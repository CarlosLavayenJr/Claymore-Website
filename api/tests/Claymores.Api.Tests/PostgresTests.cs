using System.Net;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.DataProtection.KeyManagement;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;

namespace Claymores.Api.Tests;

public sealed class MigrationTests(PostgresDatabase database) : IClassFixture<PostgresDatabase>
{
    [Fact]
    public async Task Applies_every_script_once_and_tolerates_manually_applied_ones()
    {
        database.SkipIfUnavailable();
        var ct = TestContext.Current.CancellationToken;
        await using var dataSource = database.CreateDataSource();

        // Databases set up by hand before the runner existed already have scripts 001-004.
        foreach (var (version, sql) in DatabaseMigrator.LoadScripts().Where(s => string.CompareOrdinal(s.Version, "005") < 0))
        {
            await using var command = dataSource.CreateCommand(sql);
            await command.ExecuteNonQueryAsync(ct);
        }

        var migrator = new DatabaseMigrator(dataSource, NullLogger<DatabaseMigrator>.Instance);
        var all = DatabaseMigrator.LoadScripts().Select(s => s.Version).ToArray();
        Assert.Equal(all, await migrator.PendingAsync(ct));

        Assert.Equal(all, await migrator.MigrateAsync(ct));
        Assert.Empty(await migrator.MigrateAsync(ct));
        Assert.Empty(await migrator.PendingAsync(ct));
    }
}

public sealed class ConcurrentMigrationTests(PostgresDatabase database) : IClassFixture<PostgresDatabase>
{
    [Fact]
    public async Task Concurrent_runs_apply_each_script_once()
    {
        database.SkipIfUnavailable();
        var ct = TestContext.Current.CancellationToken;
        await using var dataSource = database.CreateDataSource();
        var runs = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ =>
            new DatabaseMigrator(dataSource, NullLogger<DatabaseMigrator>.Instance).MigrateAsync(ct)));

        var applied = runs.SelectMany(run => run).Order(StringComparer.Ordinal).ToArray();
        Assert.Equal(DatabaseMigrator.LoadScripts().Select(s => s.Version), applied);
    }
}

public sealed class InvitationTests(PostgresDatabase database) : IClassFixture<PostgresDatabase>, IAsyncLifetime
{
    private NpgsqlDataSource? _dataSource;

    public async ValueTask InitializeAsync()
    {
        if (database.ConnectionString is null) return;
        _dataSource = database.CreateDataSource();
        await new DatabaseMigrator(_dataSource, NullLogger<DatabaseMigrator>.Instance).MigrateAsync(CancellationToken.None);
    }

    public async ValueTask DisposeAsync()
    {
        if (_dataSource is not null) await _dataSource.DisposeAsync();
    }

    [Fact]
    public async Task Invitations_grant_change_and_lose_roles()
    {
        database.SkipIfUnavailable();
        var ct = TestContext.Current.CancellationToken;
        var invitations = new ClubInvitations(_dataSource!, new MemoryCache(new MemoryCacheOptions()));
        var configuration = new ConfigurationBuilder().Build();
        var player = Identities.Google("New.Player@Example.com");

        Assert.Null(await ClubRoles.ResolveAsync(player, configuration, invitations, ct));

        await invitations.UpsertAsync("  New.Player@Example.com ", "player", "admin@example.com", ct);
        Assert.Equal("player", await ClubRoles.ResolveAsync(player, configuration, invitations, ct));

        await invitations.UpsertAsync("new.player@example.com", "admin", null, ct);
        Assert.Equal("admin", await ClubRoles.ResolveAsync(player, configuration, invitations, ct));
        // Other tests in this class share the database, so look only at this address.
        Assert.Single(await invitations.ListAsync(ct), invitation => invitation.Email == "new.player@example.com");

        Assert.True(await invitations.RemoveAsync("NEW.PLAYER@example.com", ct));
        Assert.Null(await ClubRoles.ResolveAsync(player, configuration, invitations, ct));
        Assert.False(await invitations.RemoveAsync("new.player@example.com", ct));
    }

    [Fact]
    public async Task Configured_admin_outranks_a_stored_player_role()
    {
        database.SkipIfUnavailable();
        var ct = TestContext.Current.CancellationToken;
        var invitations = new ClubInvitations(_dataSource!, new MemoryCache(new MemoryCacheOptions()));
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Authentication:Google:AdminEmails:0"] = "bootstrap@example.com",
        }).Build();

        await invitations.UpsertAsync("bootstrap@example.com", "player", null, ct);
        Assert.Equal("admin", await ClubRoles.ResolveAsync(Identities.Google("bootstrap@example.com"),
            configuration, invitations, ct));
    }

    [Fact]
    public async Task Database_rejects_unknown_roles()
    {
        database.SkipIfUnavailable();
        var invitations = new ClubInvitations(_dataSource!, new MemoryCache(new MemoryCacheOptions()));
        await Assert.ThrowsAsync<PostgresException>(() =>
            invitations.UpsertAsync("x@example.com", "owner", null, TestContext.Current.CancellationToken));
    }
}

public sealed class KeyRingTests(PostgresDatabase database) : IClassFixture<PostgresDatabase>
{
    private static IDataProtector Protector(NpgsqlDataSource dataSource)
    {
        var services = new ServiceCollection();
        services.AddDataProtection().SetApplicationName("claymores-api");
        services.Configure<KeyManagementOptions>(options => options.XmlRepository = new PostgresKeyRepository(dataSource));
        return services.BuildServiceProvider().GetDataProtectionProvider().CreateProtector("session-test");
    }

    [Fact]
    public async Task A_restarted_instance_can_read_cookies_from_the_previous_one()
    {
        database.SkipIfUnavailable();
        await using var dataSource = database.CreateDataSource();
        await new DatabaseMigrator(dataSource, NullLogger<DatabaseMigrator>.Instance)
            .MigrateAsync(TestContext.Current.CancellationToken);

        var protectedPayload = Protector(dataSource).Protect("signed-in");

        // A separate container simulates a restart or a second instance.
        Assert.Equal("signed-in", Protector(dataSource).Unprotect(protectedPayload));
    }
}

public sealed class ReadinessTests(PostgresDatabase database) : IClassFixture<PostgresDatabase>
{
    [Fact]
    public async Task Startup_migrates_and_reports_ready()
    {
        database.SkipIfUnavailable();
        await using var factory = ApiFactory.With(new Dictionary<string, string?>
        {
            ["ConnectionStrings:Claymores"] = database.ConnectionString,
        });
        var response = await factory.CreateClient().GetAsync("/health/ready", TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Unreachable_database_reports_503()
    {
        await using var factory = ApiFactory.With(new Dictionary<string, string?>
        {
            ["ConnectionStrings:Claymores"] = "Host=127.0.0.1;Port=1;Database=none;Username=none;Timeout=2",
            ["Database:MigrateOnStartup"] = "false",
        });
        var response = await factory.CreateClient().GetAsync("/health/ready", TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
    }
}
