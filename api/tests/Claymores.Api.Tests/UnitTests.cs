using Microsoft.Extensions.Configuration;
using Npgsql;

namespace Claymores.Api.Tests;

public sealed class DatabaseUrlTests
{
    [Fact]
    public void Converts_a_render_internal_url()
    {
        var builder = new NpgsqlConnectionStringBuilder(
            Hosting.FromDatabaseUrl("postgresql://claymores_user:p%40ss%2Fword@dpg-abc123-a/claymores"));

        Assert.Equal("dpg-abc123-a", builder.Host);
        Assert.Equal(5432, builder.Port);
        Assert.Equal("claymores", builder.Database);
        Assert.Equal("claymores_user", builder.Username);
        Assert.Equal("p@ss/word", builder.Password);
        Assert.Equal(SslMode.Prefer, builder.SslMode);
    }

    [Fact]
    public void Honors_port_and_sslmode()
    {
        var builder = new NpgsqlConnectionStringBuilder(
            Hosting.FromDatabaseUrl("postgres://u:p@ep-cool.us-east-2.aws.neon.tech:6543/neondb?sslmode=require&channel_binding=require"));

        Assert.Equal(6543, builder.Port);
        Assert.Equal(SslMode.Require, builder.SslMode);
    }

    [Theory]
    [InlineData("mysql://u:p@host/db")]
    [InlineData("postgres://host/db")]
    [InlineData("not a url")]
    public void Rejects_unusable_urls(string url) =>
        Assert.Throws<InvalidOperationException>(() => Hosting.FromDatabaseUrl(url));

    [Fact]
    public void Prefers_the_explicit_connection_string()
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:Claymores"] = "Host=explicit;Database=db;Username=u",
            ["DATABASE_URL"] = "postgres://u:p@fromurl/db",
        }).Build();

        Assert.Equal("Host=explicit;Database=db;Username=u", Hosting.ResolveConnectionString(configuration));
    }
}

public sealed class ConfiguredRoleTests
{
    private static readonly IConfiguration Configuration = new ConfigurationBuilder()
        .AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Authentication:Google:AdminEmails:0"] = "Captain@Example.com",
            ["Authentication:Google:PlayerEmails:0"] = "player@example.com",
            ["Authentication:Google:PlayerEmails:1"] = "captain@example.com",
        }).Build();

    [Theory]
    [InlineData("captain@example.com", "admin")]
    [InlineData("PLAYER@example.com", "player")]
    [InlineData("stranger@example.com", null)]
    public async Task Resolves_roles_from_configuration(string email, string? expected) =>
        Assert.Equal(expected, await ClubRoles.ResolveAsync(Identities.Google(email), Configuration, null,
            TestContext.Current.CancellationToken));

    [Fact]
    public async Task Rejects_unverified_email() =>
        Assert.Null(await ClubRoles.ResolveAsync(Identities.Google("captain@example.com", verified: false),
            Configuration, null, TestContext.Current.CancellationToken));

    [Theory]
    [InlineData("someone@example.com", true)]
    [InlineData("a@b", true)]
    [InlineData("no-at-sign", false)]
    [InlineData("two@@example.com", false)]
    [InlineData("trailing@", false)]
    [InlineData("has space@example.com", false)]
    public void Validates_invitation_emails(string email, bool valid) =>
        Assert.Equal(valid, ClubInvitations.IsValidEmail(email));
}
