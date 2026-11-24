using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Web;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;

namespace Claymores.Api.Tests;

/// <summary>
/// Answers SanityData's GROQ queries with responses captured from the live API on 2026-11-24
/// (Fixtures/sanity), and records each query so tests can tell which source served a request.
/// </summary>
internal sealed class FakeSanity : HttpMessageHandler
{
    public List<string> Queries { get; } = [];

    public static JsonElement Read(string name) => JsonSerializer.Deserialize<JsonElement>(
        File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "sanity", name)));

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        var parameters = HttpUtility.ParseQueryString(request.RequestUri!.Query);
        var query = parameters["query"]!;
        var season = parameters["$season"];
        Queries.Add(query);
        var file = query switch
        {
            _ when query.Contains("\"teamCount\"") => "standings-seasons.json",
            _ when query.Contains("seasonLabel == $season") => season switch
            {
                "\"2025-2026\"" => "standings-2025-2026.json",
                "\"2026-2027\"" => "standings-current.json",
                _ => null,
            },
            _ when query.Contains("leagueChampionship") => "standings-current.json",
            _ when query.Contains("_type == \"team\"") => "teams.json",
            _ when query.Contains("_type == \"match\"") => "fixtures-2026.json",
            _ => throw new InvalidOperationException("Unexpected Sanity query: " + query),
        };
        var result = file is null ? "null" : File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "sanity", file));
        return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("{\"result\":" + result + "}", Encoding.UTF8, "application/json"),
        });
    }
}

/// <summary>
/// Standings:Source=postgres and Fixtures:Source=scraper against data scraped from the saved
/// rugbyfl.com pages, compared with what Sanity serves for the same season.
/// </summary>
public sealed partial class CutoverTests(PostgresDatabase database) : IClassFixture<PostgresDatabase>, IAsyncLifetime
{
    private NpgsqlDataSource? _dataSource;
    private readonly FakeRugbyFl _site = new();
    private readonly FakeSanity _sanity = new();

    public async ValueTask InitializeAsync()
    {
        if (database.ConnectionString is null) return;
        _dataSource = database.CreateDataSource();
        var ct = CancellationToken.None;
        await new DatabaseMigrator(_dataSource, NullLogger<DatabaseMigrator>.Instance).MigrateAsync(ct);
        if (await Scalar<long>("SELECT count(*) FROM standings") > 0) return; // set up by an earlier test

        // What production ran: --import-reference-data, --scrape-fixtures, --scrape-standings.
        var store = new ScrapeStore(_dataSource);
        await store.ImportTeamsAsync(FakeSanity.Read("teams.json"), ct);
        await store.SaveChampionshipConfigAsync(new ChampionshipConfig(true, "191", "2025-2026", "Men Division 3"), ct);
        _site.ClubPages[(117, 27)] = RugbyFlPages.Read("club-117-season-27.html");
        _site.Championships["191"] = RugbyFlPages.Read("championship-191.html");
        var service = new ScrapeService(_site, store, NullLogger<ScrapeService>.Instance);
        Assert.Equal("success", (await service.ScrapeFixturesAsync(new FixtureScrapeRequest([117], [27], false), "cli", ct)).Status);
        Assert.Equal("success", (await service.ScrapeStandingsAsync(new(false, null, null, null), "cli", ct)).Status);
    }

    public async ValueTask DisposeAsync()
    {
        if (_dataSource is not null) await _dataSource.DisposeAsync();
    }

    private async Task<T> Scalar<T>(string sql)
    {
        await using var command = _dataSource!.CreateCommand(sql);
        return (T)(await command.ExecuteScalarAsync(CancellationToken.None))!;
    }

    private async Task UseChampionship(string id, string season) =>
        await new ScrapeStore(_dataSource!).SaveChampionshipConfigAsync(
            new ChampionshipConfig(true, id, season, "Men Division 3"), TestContext.Current.CancellationToken);

    private ApiFactory Api(string? standings = "postgres", string? fixtures = "scraper") =>
        ApiFactory.With(new Dictionary<string, string?>
        {
            ["ConnectionStrings:Claymores"] = database.ConnectionString,
            ["Standings:Source"] = standings,
            ["Fixtures:Source"] = fixtures,
        }, services => services.AddHttpClient<SanityData>().ConfigurePrimaryHttpMessageHandler(() => _sanity));

    private static async Task<JsonElement> Get(HttpClient client, string path)
    {
        using var response = await client.GetAsync(path, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return JsonSerializer.Deserialize<JsonElement>(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
    }

    /// <summary>
    /// Same property names at every level and the same JSON kinds, where a null on either side is
    /// allowed (Sanity omits or nulls optional fields). Array items are checked against the first
    /// item of the expected array.
    /// </summary>
    private static void AssertSameShape(JsonElement expected, JsonElement actual, string path = "$")
    {
        if (expected.ValueKind == JsonValueKind.Null || actual.ValueKind == JsonValueKind.Null) return;
        Assert.True(expected.ValueKind == actual.ValueKind, $"{path}: expected {expected.ValueKind}, got {actual.ValueKind}");
        if (expected.ValueKind == JsonValueKind.Object)
        {
            var names = expected.EnumerateObject().Select(p => p.Name).Order(StringComparer.Ordinal).ToArray();
            Assert.Equal(names, actual.EnumerateObject().Select(p => p.Name).Order(StringComparer.Ordinal).ToArray());
            foreach (var name in names)
                AssertSameShape(expected.GetProperty(name), actual.GetProperty(name), $"{path}.{name}");
        }
        else if (expected.ValueKind == JsonValueKind.Array && expected.GetArrayLength() > 0)
        {
            var schema = expected[0];
            var i = 0;
            foreach (var item in actual.EnumerateArray())
                AssertSameShape(schema, item, $"{path}[{i++}]");
        }
    }

    [Fact]
    public async Task Postgres_standings_have_the_sanity_shape_and_contiguous_positions()
    {
        database.SkipIfUnavailable();
        await UseChampionship("191", "2025-2026");
        await using var api = Api();
        var actual = await Get(api.CreateClient(), "/v1/standings?season=2025-2026");
        var expected = FakeSanity.Read("standings-2025-2026.json");
        Assert.Empty(_sanity.Queries);

        AssertSameShape(expected, actual);
        foreach (var field in new[] { "id", "championshipId", "seasonLabel", "divisionName" })
            Assert.Equal(expected.GetProperty(field).GetString(), actual.GetProperty(field).GetString());

        // Same teams and numbers. Sanity's rows were trimmed by hand without renumbering (…11, 18, 19, 20);
        // Postgres ranks them 1..14.
        var rows = actual.GetProperty("rows").EnumerateArray().ToArray();
        Assert.Equal(Enumerable.Range(1, 14), rows.Select(r => r.GetProperty("position").GetInt32()));
        var sanityRows = expected.GetProperty("rows").EnumerateArray().ToDictionary(r => r.GetProperty("teamName").GetString()!);
        Assert.Equal(sanityRows.Keys.Order(), rows.Select(r => r.GetProperty("teamName").GetString()!).Order());
        foreach (var row in rows)
        {
            var sanityRow = sanityRows[row.GetProperty("teamName").GetString()!];
            foreach (var stat in new[] { "played", "won", "lost", "drawn", "pointsFor", "pointsAgainst", "pointsDifference",
                         "bonusPoints", "totalPoints" })
                Assert.Equal(sanityRow.GetProperty(stat).GetInt32(), row.GetProperty(stat).GetInt32());
            Assert.Equal(sanityRow.GetProperty("pool").GetString(), row.GetProperty("pool").GetString());
            if (sanityRow.GetProperty("position").GetInt32() <= 11)
                Assert.Equal(sanityRow.GetProperty("_key").GetString(), row.GetProperty("_key").GetString());
        }
        Assert.Equal(8, rows.Single(r => r.GetProperty("teamName").GetString()!.Contains("Claymores")).GetProperty("position").GetInt32());

        // Playoffs, keys included, are identical.
        Assert.Equal(JsonSerializer.Serialize(expected.GetProperty("playoffs")), JsonSerializer.Serialize(actual.GetProperty("playoffs")));
    }

    [Fact]
    public async Task Seasons_postgres_lacks_fall_back_to_sanity()
    {
        database.SkipIfUnavailable();
        await UseChampionship("203", "2026-2027"); // configured, but rugbyfl.com has not served it yet
        await using var api = Api();
        var client = api.CreateClient();
        var ct = TestContext.Current.CancellationToken;

        var current = await Get(client, "/v1/standings");
        Assert.Equal("leagueStandings-203", current.GetProperty("id").GetString());
        Assert.Single(_sanity.Queries);
        Assert.Equal("2026-2027", (await Get(client, "/v1/standings?season=2026-2027")).GetProperty("seasonLabel").GetString());
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/v1/standings?season=2019-2020", ct)).StatusCode);
        Assert.Equal(3, _sanity.Queries.Count);

        // Once the configured championship is scraped, Postgres serves it.
        await UseChampionship("191", "2025-2026");
        Assert.Equal("leagueStandings-191", (await Get(client, "/v1/standings")).GetProperty("id").GetString());
        Assert.Equal(3, _sanity.Queries.Count);
    }

    [Fact]
    public async Task Season_cards_come_from_postgres_with_sanity_filling_the_other_seasons()
    {
        database.SkipIfUnavailable();
        await using var api = Api();
        var actual = await Get(api.CreateClient(), "/v1/standings/seasons");
        var expected = FakeSanity.Read("standings-seasons.json");

        AssertSameShape(expected, actual);
        Assert.Equal(["2026-2027", "2025-2026", "2024-2025", "2023-2024", "2022-2023"],
            actual.EnumerateArray().Select(s => s.GetProperty("seasonLabel").GetString()));
        var card = actual[1];
        Assert.Equal((8, 14, "Men Division 3"), (card.GetProperty("claymoresPosition").GetInt32(),
            card.GetProperty("teamCount").GetInt32(), card.GetProperty("divisionName").GetString()));
        // From Postgres: its lastUpdated is the scrape time, not Sanity's.
        Assert.NotEqual(expected[1].GetProperty("lastUpdated").GetString(), card.GetProperty("lastUpdated").GetString());
        Assert.Equal(JsonSerializer.Serialize(expected[0]), JsonSerializer.Serialize(actual[0]));
    }

    [Fact]
    public async Task Sanity_stays_the_default_source()
    {
        database.SkipIfUnavailable();
        await using var api = Api(standings: null, fixtures: null);
        var client = api.CreateClient();
        var standings = await Get(client, "/v1/standings?season=2025-2026");
        Assert.Contains(standings.GetProperty("rows").EnumerateArray(), r => r.GetProperty("position").GetInt32() == 20);
        Assert.Equal(JsonSerializer.Serialize(FakeSanity.Read("standings-seasons.json")), JsonSerializer.Serialize(await Get(client, "/v1/standings/seasons")));
        Assert.Empty((await Get(client, "/v1/fixtures")).EnumerateArray()); // no --import-fixtures rows in this database
    }

    [Fact]
    public void Postgres_standings_need_a_database()
    {
        using var api = ApiFactory.With(new Dictionary<string, string?> { ["Standings:Source"] = "postgres" });
        Assert.Throws<InvalidOperationException>(() => api.CreateClient());
        using var typo = ApiFactory.With(new Dictionary<string, string?> { ["Standings:Source"] = "postgress" });
        Assert.Throws<InvalidOperationException>(() => typo.CreateClient());
    }

    /// <summary>lib/seo.ts matchSlug, which builds the website's /fixtures/[slug] URLs.</summary>
    private static string MatchSlug(JsonElement m) =>
        $"{m.GetProperty("date").GetString()}-{Slugify(m.GetProperty("homeTeam").GetString()!)}-vs-{Slugify(m.GetProperty("awayTeam").GetString()!)}";

    private static string Slugify(string s) => NonSlug().Replace(s.ToLowerInvariant(), "-").Trim('-');

    [GeneratedRegex("[^a-z0-9]+")]
    private static partial Regex NonSlug();

    [Fact]
    public async Task Scraped_fixtures_have_the_sanity_shape_and_keep_website_slugs()
    {
        database.SkipIfUnavailable();
        await using var api = Api();
        var client = api.CreateClient();
        var actual = (await Get(client, "/v1/fixtures?season=2026")).EnumerateArray().ToArray();
        var expected = FakeSanity.Read("fixtures-2026.json").EnumerateArray().ToArray();
        Assert.Equal(10, actual.Length);
        foreach (var fixture in actual)
            AssertSameShape(expected[0], fixture);
        Assert.All(actual, f => Assert.Matches(@"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$", f.GetProperty("updatedAt").GetString()));

        // Every scraped Sanity game on this page keeps its URL, including the "Orlando Otters 2026" game
        // (Sanity shows "Orlando Otters"). Hand-created Sanity documents are adopted, not scraped.
        var slugs = actual.Select(MatchSlug).ToHashSet();
        var scrapedInSanity = expected.Where(m => m.GetProperty("id").GetString()!.StartsWith("scraped-")
            && slugs.Any(s => s.StartsWith(m.GetProperty("date").GetString()!))).ToArray();
        Assert.NotEmpty(scrapedInSanity);
        Assert.All(scrapedInSanity, m => Assert.Contains(MatchSlug(m), slugs));
        Assert.Contains("2025-09-20-orlando-otters-vs-claymores", slugs);

        // Team profile fields match Sanity where Sanity has a team reference, and are null for
        // teams without a profile (the website would otherwise link to a missing /opponents page).
        var byDate = actual.ToDictionary(f => f.GetProperty("date").GetString()!);
        foreach (var m in scrapedInSanity)
        {
            var fixture = byDate[m.GetProperty("date").GetString()!];
            foreach (var side in new[] { "home", "away" })
                if (m.GetProperty(side + "TeamSlug").GetString() is { } slug)
                {
                    Assert.Equal(slug, fixture.GetProperty(side + "TeamSlug").GetString());
                    Assert.Equal(m.GetProperty(side + "Logo").GetString(), fixture.GetProperty(side + "Logo").GetString());
                    Assert.Equal(m.GetProperty(side + "TeamCity").GetString(), fixture.GetProperty(side + "TeamCity").GetString());
                }
        }
        var eckerd = actual.Single(f => f.GetProperty("homeTeam").GetString() == "Eckerd");
        Assert.Equal(JsonValueKind.Null, eckerd.GetProperty("homeTeamSlug").ValueKind);
        Assert.Equal("central-florida-claymores", eckerd.GetProperty("awayTeamSlug").GetString());

        // IDs are stable and the detail endpoint returns the same object.
        var first = actual[0];
        Assert.Equal(first.GetRawText(), (await Get(client, "/v1/fixtures/" + first.GetProperty("id").GetString())).GetRawText());
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.GetAsync("/v1/fixtures/scraped-2025-09-20-orlando-otters-2026-claymores", TestContext.Current.CancellationToken)).StatusCode);
        Assert.Equal(first.GetRawText(), (await Get(client, "/v1/fixtures?season=2026"))[0].GetRawText());
    }
}
