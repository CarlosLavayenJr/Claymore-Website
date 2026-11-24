using System.Security.Claims;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Npgsql;

namespace Claymores.Api.Tests;

/// <summary>Runs the real API in memory. Settings use UseSetting so Program.cs sees them while building.</summary>
public sealed class ApiFactory : WebApplicationFactory<Program>
{
    private readonly IReadOnlyDictionary<string, string?> _settings;

    public ApiFactory() => _settings = new Dictionary<string, string?>();

    private ApiFactory(IReadOnlyDictionary<string, string?> settings) => _settings = settings;

    public static ApiFactory With(IReadOnlyDictionary<string, string?> settings) => new(settings);

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("ConnectionStrings:Claymores", "");
        builder.UseSetting("DATABASE_URL", "");
        foreach (var (key, value) in _settings)
            builder.UseSetting(key, value);
    }
}

/// <summary>
/// A throwaway Postgres database per test class. Set CLAYMORES_TEST_DATABASE to an admin
/// connection string (one that may CREATE DATABASE) to run these tests; they skip otherwise.
/// </summary>
public sealed class PostgresDatabase : IAsyncLifetime
{
    private string? _admin;
    private string? _name;

    public string? ConnectionString { get; private set; }

    public void SkipIfUnavailable() =>
        Assert.SkipWhen(ConnectionString is null, "Set CLAYMORES_TEST_DATABASE to run the Postgres tests.");

    public NpgsqlDataSource CreateDataSource() => NpgsqlDataSource.Create(ConnectionString!);

    public async ValueTask InitializeAsync()
    {
        _admin = Environment.GetEnvironmentVariable("CLAYMORES_TEST_DATABASE");
        if (string.IsNullOrWhiteSpace(_admin)) return;

        _name = "claymores_test_" + Guid.NewGuid().ToString("N")[..12];
        await using var admin = NpgsqlDataSource.Create(_admin);
        await using var create = admin.CreateCommand($"CREATE DATABASE {_name}");
        await create.ExecuteNonQueryAsync();
        ConnectionString = new NpgsqlConnectionStringBuilder(_admin) { Database = _name }.ConnectionString;
    }

    public async ValueTask DisposeAsync()
    {
        if (_admin is null || _name is null) return;
        NpgsqlConnection.ClearAllPools();
        await using var admin = NpgsqlDataSource.Create(_admin);
        await using var drop = admin.CreateCommand($"DROP DATABASE IF EXISTS {_name} WITH (FORCE)");
        await drop.ExecuteNonQueryAsync();
    }
}

internal static class Identities
{
    public static ClaimsPrincipal Google(string email, bool verified = true, string subject = "google-subject") =>
        new(new ClaimsIdentity(
        [
            new Claim("sub", subject),
            new Claim("email", email),
            new Claim("email_verified", verified ? "true" : "false"),
        ], "test"));
}
