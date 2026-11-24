using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;

namespace Claymores.Api.Tests;

/// <summary>Serves saved rugbyfl.com pages, or HTML set by the test, instead of the network.</summary>
internal sealed class FakeRugbyFl : IRugbyFlSource
{
    public Dictionary<(int Club, int Season), string> ClubPages { get; } = new();
    public Dictionary<string, string> Championships { get; } = new();
    public string GameDetail { get; set; } = RugbyFlPages.Read("game-13415.html");
    public int GameDetailRequests { get; private set; }

    public Task<string> ClubPageAsync(int clubId, int seasonId, CancellationToken ct) =>
        ClubPages.TryGetValue((clubId, seasonId), out var html)
            ? Task.FromResult(html)
            : Task.FromException<string>(new HttpRequestException("Not Found", null, HttpStatusCode.NotFound));

    public Task<string> GameDetailAsync(string path, CancellationToken ct)
    {
        GameDetailRequests++;
        return Task.FromResult(GameDetail);
    }

    public Task<string> ChampionshipPageAsync(string championshipId, CancellationToken ct) =>
        Championships.TryGetValue(championshipId, out var html)
            ? Task.FromResult(html)
            : Task.FromException<string>(new HttpRequestException("Server Error", null, HttpStatusCode.InternalServerError));
}

internal static class ClubPageBuilder
{
    public sealed record Game(string Date, string Home, string Away, int? HomeScore = null, int? AwayScore = null,
        string Competition = "Men Division 3", string Kickoff = "1:00 PM", string? Note = null);

    /// <summary>A minimal club page with the same markup rugbyfl.com uses.</summary>
    public static string Build(params Game[] games)
    {
        var body = string.Concat(games.Select(game => $"""
            <tr><td colspan="5" class="SectionTitleSec">{game.Date} <a href="#"><img/></a></td></tr>
            <tr><td colspan="5" class="TableRowBig"><b>{game.Kickoff}</b> | <a href="/c"><font color="#000000">{game.Competition}</font></a> | <strong>Ref: </strong></td></tr>
            <tr>
              <td>&nbsp;</td><td class="TeamGame">&nbsp;</td>
              <td class="TeamGame"><strong><a href="/Clubs/Team.asp?x=1">&nbsp;{game.Home}</a></strong>
                {(game.HomeScore is { } hs ? $"(<font color=\"#FF0000\"><strong>{hs}</strong></font>)" : "")} vs.
                {(game.AwayScore is { } @as ? $"(<font color=\"#FF0000\"><strong>{@as}</strong></font>)" : "")}
                <strong><a href="/Clubs/Team.asp?x=2">{game.Away}</a></strong></td>
              <td class="TeamGame"><a href="/Season/Championships/Game_Detail.asp?Game_ID=1&amp;Home_Team_ID=2">Details</a></td>
            </tr>
            {(game.Note is null ? "" : $"<tr><td></td><td></td><td colspan=\"3\" class=\"TableRowNoLine\"><strong>Note:</strong> {game.Note}</td></tr>")}
            """));
        return $"<html><body><table>{body}</table></body></html>";
    }
}

public sealed class ScraperPostgresTests(PostgresDatabase database) : IClassFixture<PostgresDatabase>, IAsyncLifetime
{
    private NpgsqlDataSource? _dataSource;
    private readonly FakeRugbyFl _site = new();

    public async ValueTask InitializeAsync()
    {
        if (database.ConnectionString is null) return;
        _dataSource = database.CreateDataSource();
        await new DatabaseMigrator(_dataSource, NullLogger<DatabaseMigrator>.Instance).MigrateAsync(CancellationToken.None);
        await Execute("DELETE FROM fixtures; DELETE FROM standings; DELETE FROM scrape_runs;");
    }

    public async ValueTask DisposeAsync()
    {
        if (_dataSource is not null) await _dataSource.DisposeAsync();
    }

    private ScrapeService Service() =>
        new(_site, new ScrapeStore(_dataSource!), NullLogger<ScrapeService>.Instance);

    private Task<FixtureScrapeResult> ScrapeAsync(int season = 27, bool venues = false) =>
        Service().ScrapeFixturesAsync(new FixtureScrapeRequest([117], [season], venues), "cli", TestContext.Current.CancellationToken);

    private async Task Execute(string sql)
    {
        await using var command = _dataSource!.CreateCommand(sql);
        await command.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
    }

    private async Task<T> Scalar<T>(string sql)
    {
        await using var command = _dataSource!.CreateCommand(sql);
        return (T)(await command.ExecuteScalarAsync(TestContext.Current.CancellationToken))!;
    }

    [Fact]
    public async Task Seeds_teams_and_aliases_that_match_the_normalizer()
    {
        database.SkipIfUnavailable();
        Assert.Equal(14L, await Scalar<long>("SELECT count(*) FROM teams WHERE source = 'seed'"));
        await using var command = _dataSource!.CreateCommand("SELECT alias, alias_normalized FROM team_aliases");
        await using var reader = await command.ExecuteReaderAsync(TestContext.Current.CancellationToken);
        var count = 0;
        while (await reader.ReadAsync(TestContext.Current.CancellationToken))
        {
            count++;
            Assert.Equal(TeamNameResolver.Normalize(reader.GetString(0)), reader.GetString(1));
        }
        Assert.Equal(16, count); // 20 seeded aliases, four of which share a normalized key
        Assert.Equal(0L, await Scalar<long>("SELECT count(*) FROM teams WHERE slug IS NULL"));
    }

    [Fact]
    public async Task Rescraping_is_idempotent_and_keeps_public_reads_on_sanity_rows()
    {
        database.SkipIfUnavailable();
        _site.ClubPages[(117, 27)] = RugbyFlPages.Read("club-117-season-27.html");

        var first = await ScrapeAsync(venues: true);
        Assert.Equal("success", first.Status);
        Assert.Equal(10, first.Pages.Single().Inserted);
        // Unknown opponents (Eckerd, Embry Riddle) become needs_review teams; another test may have created them first.
        Assert.All(first.NewTeamsNeedingReview, name => Assert.Contains(name, new[] { "Eckerd", "Embry Riddle" }));
        Assert.Equal(10, _site.GameDetailRequests);

        var second = await ScrapeAsync();
        Assert.Equal((0, 0, 10, 0), (second.Pages.Single().Inserted, second.Pages.Single().Updated,
            second.Pages.Single().Unchanged, second.Pages.Single().SkippedManualOverride));
        Assert.Empty(second.NewTeamsNeedingReview);
        Assert.Equal(10L, await Scalar<long>("SELECT count(*) FROM fixtures WHERE source = 'scraper'"));
        // A run without venue lookups keeps the venue captured earlier.
        Assert.Equal(10L, await Scalar<long>(
            "SELECT count(*) FROM fixtures WHERE venue = 'Plantation Sports Complex, 321 Old Hard Rd, Fleming Island, FL'"));

        Assert.True(await Scalar<bool>("SELECT needs_review FROM teams WHERE name = 'Eckerd'"));
        Assert.Equal("scraper", await Scalar<string>("SELECT source FROM teams WHERE name = 'Eckerd'"));
        Assert.Equal("Jacksonville Rugby", await Scalar<string>(
            "SELECT home_team FROM fixtures WHERE fixture_date = '2026-02-07' AND source = 'scraper'"));
        Assert.Equal(2L, await Scalar<long>("SELECT count(*) FROM scrape_runs WHERE kind = 'fixtures' AND status = 'success'"));

        var ct = TestContext.Current.CancellationToken;
        var forfeit = await Scalar<string>(
            "SELECT payload::text FROM fixtures WHERE fixture_date = '2026-02-07' AND source = 'scraper'");
        using (var payload = JsonDocument.Parse(forfeit))
        {
            var root = payload.RootElement;
            Assert.Equal("Jacksonville", root.GetProperty("homeTeam").GetString());
            Assert.Equal("Claymores", root.GetProperty("awayTeam").GetString());
            Assert.Equal("forfeit_us", root.GetProperty("status").GetString());
            Assert.Equal(20, root.GetProperty("homeScore").GetInt32());
            Assert.Equal("12:30 PM", root.GetProperty("kickoffTime").GetString());
            Assert.Equal("2026-02-07", root.GetProperty("date").GetString());
            Assert.Equal(2026, root.GetProperty("season").GetInt32());
            Assert.Equal("jacksonville-rugby", root.GetProperty("homeTeamSlug").GetString());
        }

        // Shadow mode: the public fixture reads still serve only Sanity-imported rows.
        Assert.Empty(await new FixtureDatabase(_dataSource!).ListAsync(null, ct));
        var scraped = await new FixtureDatabase(_dataSource!, FixtureDatabase.ScraperSource).ListAsync(2026, ct);
        Assert.Equal(10, scraped.Length);
        Assert.All(scraped, fixture => Assert.StartsWith("rfl-", fixture.GetProperty("id").GetString()));
    }

    [Fact]
    public async Task Rescraping_updates_scores_but_never_a_manual_override()
    {
        database.SkipIfUnavailable();
        _site.ClubPages[(117, 30)] = ClubPageBuilder.Build(
            new ClubPageBuilder.Game("Saturday, March 6, 2027", "Claymores", "Daytona (D3)"),
            new ClubPageBuilder.Game("Saturday, March 13, 2027", "Claymores", "Lakeland"));
        Assert.Equal(2, (await ScrapeAsync(30)).Pages.Single().Inserted);

        await Execute("UPDATE fixtures SET manual_override = true, home_score = 99, note = 'Edited by hand' WHERE fixture_date = '2027-03-13'");
        _site.ClubPages[(117, 30)] = ClubPageBuilder.Build(
            new ClubPageBuilder.Game("Saturday, March 6, 2027", "Claymores", "Daytona (D3)", 31, 12, Note: "Rescheduled kickoff"),
            new ClubPageBuilder.Game("Saturday, March 13, 2027", "Claymores", "Lakeland", 40, 0));
        var page = (await ScrapeAsync(30)).Pages.Single();
        Assert.Equal((0, 1, 0, 1), (page.Inserted, page.Updated, page.Unchanged, page.SkippedManualOverride));

        Assert.Equal("played 31-12 Note: Rescheduled kickoff", await Scalar<string>("""
            SELECT status || ' ' || home_score || '-' || away_score || ' ' || note FROM fixtures WHERE fixture_date = '2027-03-06'
            """));
        Assert.Equal(31, await Scalar<int>("SELECT (payload->>'homeScore')::int FROM fixtures WHERE fixture_date = '2027-03-06'"));
        Assert.Equal("upcoming 99 Edited by hand", await Scalar<string>(
            "SELECT status || ' ' || home_score || ' ' || note FROM fixtures WHERE fixture_date = '2027-03-13'"));
    }

    [Fact]
    public async Task Keeps_two_games_on_the_same_day()
    {
        database.SkipIfUnavailable();
        _site.ClubPages[(117, 31)] = ClubPageBuilder.Build(
            new ClubPageBuilder.Game("Saturday, October 2, 2027", "Claymores", "Brevard", 10, 5, Competition: "Fall 7s Festival"),
            new ClubPageBuilder.Game("Saturday, October 2, 2027", "Claymores", "Sarasota", 7, 12, Competition: "Fall 7s Festival"),
            new ClubPageBuilder.Game("Saturday, October 2, 2027", "IR/Claymores", "Brevard", 10, 5, Competition: "Fall 7s Festival"));
        var page = (await ScrapeAsync(31)).Pages.Single();
        Assert.Equal(3, page.Parsed);
        Assert.Equal(2, page.Inserted); // the IR/Claymores listing is the same game as the first
        Assert.Equal(2L, await Scalar<long>("SELECT count(*) FROM fixtures WHERE fixture_date = '2027-10-02'"));
        Assert.Equal(2028, await Scalar<int>("SELECT DISTINCT season FROM fixtures WHERE fixture_date = '2027-10-02'"));
    }

    [Fact]
    public async Task Promotes_raw_imported_team_names_instead_of_duplicating_them()
    {
        database.SkipIfUnavailable();
        await Execute("INSERT INTO teams (name) VALUES ('Embry Riddle') ON CONFLICT DO NOTHING");
        _site.ClubPages[(117, 32)] = ClubPageBuilder.Build(new ClubPageBuilder.Game("Saturday, October 9, 2027", "Embry Riddle", "Claymores", 3, 5));
        await ScrapeAsync(32);
        Assert.Equal("scraper true", await Scalar<string>(
            "SELECT source || ' ' || needs_review FROM teams WHERE name = 'Embry Riddle'"));
        Assert.Equal(1L, await Scalar<long>("SELECT count(*) FROM teams WHERE slug LIKE 'embry-riddle%'"));
    }

    [Fact]
    public async Task Reports_partial_runs_when_a_page_fails()
    {
        database.SkipIfUnavailable();
        _site.ClubPages[(117, 33)] = ClubPageBuilder.Build(new ClubPageBuilder.Game("Saturday, October 16, 2027", "Claymores", "Okapi", 3, 5));
        var result = await Service().ScrapeFixturesAsync(new FixtureScrapeRequest([117], [33, 34], false), "cli",
            TestContext.Current.CancellationToken);
        Assert.Equal("partial", result.Status);
        Assert.NotNull(result.Pages.Single(p => p.SeasonId == 34).Error);
        Assert.Equal("Okapi Wanderers", await Scalar<string>("SELECT away_team FROM fixtures WHERE fixture_date = '2027-10-16'"));
    }

    [Fact]
    public async Task Scrapes_standings_from_the_configured_championship()
    {
        database.SkipIfUnavailable();
        var ct = TestContext.Current.CancellationToken;
        var store = new ScrapeStore(_dataSource!);
        await store.SaveChampionshipConfigAsync(new ChampionshipConfig(true, "191", "2025-2026", "Men Division 3"), ct);
        _site.Championships["191"] = RugbyFlPages.Read("championship-191.html");
        _site.Championships["120"] = RugbyFlPages.Read("championship-120.html");
        _site.Championships["162"] = RugbyFlPages.Read("championship-162.html");

        var result = await Service().ScrapeStandingsAsync(new(false, null, null, null), "http", ct);
        Assert.Equal("success", result.Status);
        Assert.Equal("standings-table", result.Source);
        var expected = RugbyFlParser.ParseChampionship(RugbyFlPages.Read("championship-191.html"))!;
        var stored = (await store.StandingsAsync("191", ct))!.Value;
        Assert.Equal(expected.Rows, stored.Rows);
        Assert.Equal("success", await Scalar<string>("SELECT last_scrape_status FROM championship_config"));
        Assert.Equal(0L, await Scalar<long>("SELECT count(*) FROM standings_rows WHERE team_id IS NULL"));

        // Re-running replaces rather than appends.
        await Service().ScrapeStandingsAsync(new(false, null, null, null), "http", ct);
        Assert.Equal((long)expected.Rows.Count, await Scalar<long>("SELECT count(*) FROM standings_rows WHERE championship_id = '191'"));

        // A manual backfill of an older championship computes from the schedule and leaves the config stamp alone.
        await Execute("UPDATE championship_config SET last_scrape_status = 'marker'");
        var backfill = await Service().ScrapeStandingsAsync(new(false, "120", "2019-2020", null), "cli", ct);
        Assert.Equal("computed-from-schedule", backfill.Source);
        Assert.Equal("marker", await Scalar<string>("SELECT last_scrape_status FROM championship_config"));

        var playoffs = await Service().ScrapeStandingsAsync(new(false, "162", "2023-2024", null), "cli", ct);
        Assert.Equal(5, playoffs.PlayoffCount);
        Assert.Equal(5L, await Scalar<long>("SELECT count(*) FROM standings_playoffs WHERE championship_id = '162'"));

        // Off-season switch, then force.
        await Execute("UPDATE championship_config SET active = false");
        Assert.Equal("skipped", (await Service().ScrapeStandingsAsync(new(false, null, null, null), "cli", ct)).Status);
        Assert.Equal("success", (await Service().ScrapeStandingsAsync(new(true, null, null, null), "cli", ct)).Status);

        // A failed fetch is stamped like the website did.
        await store.SaveChampionshipConfigAsync(new ChampionshipConfig(true, "999", "2026-2027", null), ct);
        Assert.Equal("failed", (await Service().ScrapeStandingsAsync(new(false, null, null, null), "cli", ct)).Status);
        Assert.Equal("HTTP 500", await Scalar<string>("SELECT last_scrape_status FROM championship_config"));
        Assert.Equal(1L, await Scalar<long>("SELECT count(*) FROM scrape_runs WHERE kind = 'standings' AND status = 'skipped'"));
    }

    [Fact]
    public async Task Internal_endpoint_requires_the_secret_and_runs_a_scrape()
    {
        database.SkipIfUnavailable();
        _site.ClubPages[(117, 35)] = ClubPageBuilder.Build(new ClubPageBuilder.Game("Saturday, October 23, 2027", "Claymores", "Gainesville", 3, 5));
        await using var factory = ApiFactory.With(new Dictionary<string, string?>
            {
                ["ConnectionStrings:Claymores"] = database.ConnectionString,
                ["Scraper:Secret"] = "test-scraper-secret",
            })
            .WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
                services.AddSingleton<IRugbyFlSource>(_site)));
        using var client = factory.CreateClient();
        var ct = TestContext.Current.CancellationToken;

        async Task<HttpResponseMessage> Post(string path, string? token)
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, path);
            if (token is not null) request.Headers.Authorization = new("Bearer", token);
            return await client.SendAsync(request, ct);
        }

        Assert.Equal(HttpStatusCode.Unauthorized, (await Post("/v1/internal/scrape/fixtures?seasonId=35", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Post("/v1/internal/scrape/fixtures?seasonId=35", "wrong")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Post("/v1/internal/scrape/players", "test-scraper-secret")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Post("/v1/internal/scrape/fixtures?seasonId=-1", "test-scraper-secret")).StatusCode);

        using var ok = await Post("/v1/internal/scrape/fixtures?seasonId=35", "test-scraper-secret");
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        Assert.Contains("\"inserted\":1", await ok.Content.ReadAsStringAsync(ct));
        Assert.Equal(1L, await Scalar<long>("SELECT count(*) FROM scrape_runs WHERE trigger = 'http' AND kind = 'fixtures'"));
    }
}

public sealed class ScrapedDataMigrationTests(PostgresDatabase database) : IClassFixture<PostgresDatabase>
{
    [Fact]
    public async Task Migrates_a_database_that_already_holds_imported_fixtures()
    {
        database.SkipIfUnavailable();
        var ct = TestContext.Current.CancellationToken;
        await using var dataSource = database.CreateDataSource();
        foreach (var (_, sql) in DatabaseMigrator.LoadScripts().Where(s => string.CompareOrdinal(s.Version, "007") < 0))
        {
            await using var command = dataSource.CreateCommand(sql);
            await command.ExecuteNonQueryAsync(ct);
        }
        await using (var seed = dataSource.CreateCommand("""
            INSERT INTO teams (name) VALUES ('Claymores'), ('St. Pete Pelicans'), ('Jacksonville D3');
            INSERT INTO fixtures (sanity_id, fixture_date, season, home_team, away_team, payload)
            VALUES ('scraped-2025-11-22-jacksonville-claymores', '2025-11-22', 2026, 'Jacksonville D3', 'Claymores',
                    '{"id":"scraped-2025-11-22-jacksonville-claymores","date":"2025-11-22"}');
            """))
            await seed.ExecuteNonQueryAsync(ct);

        await new DatabaseMigrator(dataSource, NullLogger<DatabaseMigrator>.Instance).MigrateAsync(ct);

        async Task<string> Text(string sql)
        {
            await using var command = dataSource.CreateCommand(sql);
            return (string)(await command.ExecuteScalarAsync(ct))!;
        }
        Assert.Equal("seed claymores", await Text("SELECT source || ' ' || slug FROM teams WHERE name = 'Claymores'"));
        Assert.Equal("import st-pete-pelicans-2", await Text("SELECT source || ' ' || slug FROM teams WHERE name = 'St. Pete Pelicans'"));
        Assert.Equal("sanity false", await Text("SELECT source || ' ' || manual_override FROM fixtures"));
        Assert.Single(await new FixtureDatabase(dataSource).ListAsync(2026, ct));

        // Raw imported names are not resolution targets; the seeded alias wins.
        var resolver = await new ScrapeStore(dataSource).LoadResolverAsync(ct);
        Assert.Equal("Jacksonville Rugby", resolver.Resolve("Jacksonville D3")!.TeamName);
    }
}
