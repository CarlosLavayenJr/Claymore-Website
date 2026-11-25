using System.Text.Json;
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
    [InlineData("captain@example.com", "superadmin")]
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

public sealed class MatchCalendarTests
{
    private static JsonElement Payload(string json) => JsonDocument.Parse(json).RootElement.Clone();

    [Fact]
    public void Calendar_has_timed_all_day_and_scored_matches_and_skips_cancelled()
    {
        var ics = MatchCalendar.Build([
            Payload("""{"id":"m1","date":"2027-01-23","homeTeam":"Central Florida Claymores","awayTeam":"Lakeland Lancers","kickoffTime":"1:00 PM","venue":"Trotters Park, Winter Garden","competition":"D3"}"""),
            Payload("""{"id":"m2","date":"2027-02-06","homeTeam":"Orlando Otters","awayTeam":"Central Florida Claymores"}"""),
            Payload("""{"id":"m3","date":"2026-03-21","homeTeam":"Lakeland Lancers","awayTeam":"Central Florida Claymores","homeScore":12,"awayScore":82,"status":"played"}"""),
            Payload("""{"id":"m4","date":"2027-03-01","homeTeam":"Central Florida Claymores","awayTeam":"Tampa","status":"cancelled"}"""),
        ], new DateTimeOffset(2026, 11, 25, 12, 0, 0, TimeSpan.Zero));

        Assert.StartsWith("BEGIN:VCALENDAR\r\n", ics);
        Assert.EndsWith("END:VCALENDAR\r\n", ics);
        // 1:00 PM in Orlando on Jan 23 (EST, UTC-5) is 18:00 UTC.
        Assert.Contains("DTSTART:20270123T180000Z\r\n", ics);
        Assert.Contains("DTEND:20270123T200000Z\r\n", ics);
        Assert.Contains("SUMMARY:Claymores vs Lakeland Lancers\r\n", ics);
        Assert.Contains("LOCATION:Trotters Park\\, Winter Garden\r\n", ics);
        Assert.Contains("DTSTART;VALUE=DATE:20270206\r\n", ics);
        Assert.Contains("SUMMARY:Lakeland Lancers vs Claymores (12–82)", ics);
        Assert.DoesNotContain("m4@", ics);
        Assert.All(ics.Split("\r\n"), line => Assert.True(System.Text.Encoding.UTF8.GetByteCount(line) <= 75));
    }
}
