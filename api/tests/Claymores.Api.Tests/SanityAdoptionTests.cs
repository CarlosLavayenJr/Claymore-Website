using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;

namespace Claymores.Api.Tests;

public sealed class SanityAdoptionRuleTests
{
    private static JsonElement Doc(string json) => JsonSerializer.Deserialize<JsonElement>(json);

    [Theory]
    [InlineData("""{"id":"scraped-2025-09-20-x","manualOverride":true}""", true)]
    [InlineData("""{"id":"scraped-2025-09-20-x","manualOverride":false}""", false)]
    [InlineData("""{"id":"scraped-2025-09-20-x"}""", false)]
    [InlineData("""{"id":"07c4a7f0-4210-4a45-a880-4ca231fb86a4","manualOverride":null}""", true)]
    [InlineData("""{"id":"ae5a2143-3767-40b4-8e46-e88fb38508b3","manualOverride":false}""", true)]
    public void Picks_overrides_and_hand_created_documents(string json, bool expected) =>
        Assert.Equal(expected, SanityAdoption.IsHandEdit(Doc(json)));

    [Theory]
    [InlineData("1:00 PM", 13, 0)]
    [InlineData("1:00pm", 13, 0)]
    [InlineData("2pm", 14, 0)]
    [InlineData("12:30 a.m.", 0, 30)]
    [InlineData("13:15", 13, 15)]
    public void Reads_free_text_kickoffs(string text, int hour, int minute) =>
        Assert.Equal(new TimeOnly(hour, minute), SanityAdoption.ParseKickoff(text));

    [Theory]
    [InlineData("TBC")]
    [InlineData("13")]
    [InlineData("13:00 PM")]
    public void Rejects_unreadable_kickoffs(string text) => Assert.Null(SanityAdoption.ParseKickoff(text));

    [Fact]
    public void Parses_a_document_and_rejects_an_unknown_status()
    {
        var candidate = SanityAdoption.Parse(Doc("""
            {"id":"x","date":"2025-11-22","homeTeam":"Jacksonville","awayTeam":"Claymores","homeScore":0,"awayScore":0,
             "status":"cancelled","matchType":"friendly","competition":"Friendlies 2025-26","kickoffTime":null}
            """), out var problem)!;
        Assert.Null(problem);
        Assert.Equal((2026, "cancelled", (TimeOnly?)null), (candidate.Season, candidate.Status, candidate.Kickoff));

        Assert.Null(SanityAdoption.Parse(Doc("""{"id":"y","date":"2025-11-22","homeTeam":"A","awayTeam":"B","status":"postponed"}"""),
            out problem));
        Assert.Contains("unknown status", problem);
    }
}

public sealed class SanityAdoptionPostgresTests(PostgresDatabase database) : IClassFixture<PostgresDatabase>, IAsyncLifetime
{
    private NpgsqlDataSource? _dataSource;
    private readonly FakeRugbyFl _site = new();

    public async ValueTask InitializeAsync()
    {
        if (database.ConnectionString is null) return;
        _dataSource = database.CreateDataSource();
        await new DatabaseMigrator(_dataSource, NullLogger<DatabaseMigrator>.Instance).MigrateAsync(CancellationToken.None);
        await Execute("DELETE FROM fixtures; DELETE FROM scrape_runs;");
    }

    public async ValueTask DisposeAsync()
    {
        if (_dataSource is not null) await _dataSource.DisposeAsync();
    }

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

    // Shapes taken from the production Sanity documents listed in the cutover comparison.
    private static readonly JsonElement[] SanityDocs = JsonSerializer.Deserialize<JsonElement[]>("""
        [
          {"id":"scraped-2025-10-04-claymores-gainesville","date":"2025-10-04","season":2026,"homeTeam":"Claymores",
           "awayTeam":"Gainesville","homeScore":3,"awayScore":5,"status":"played","matchType":"league",
           "competition":"Men Division 3","manualOverride":false},
          {"id":"scraped-2025-11-22-jacksonville-claymores","date":"2025-11-22","season":2026,"homeTeam":"Jacksonville",
           "awayTeam":"Claymores","homeScore":0,"awayScore":0,"status":"cancelled","matchType":"friendly",
           "competition":"Friendlies 2025-26","note":null,"kickoffTime":null,"venue":null,"manualOverride":true},
          {"id":"07c4a7f0-4210-4a45-a880-4ca231fb86a4","date":"2026-04-11","season":2026,"homeTeam":"Claymores",
           "awayTeam":"HHIRFC","homeScore":0,"awayScore":0,"status":"cancelled","matchType":"friendly",
           "competition":null,"manualOverride":null},
          {"id":"3e7a8cb0-80fb-451e-8c4a-6779e6963524","date":"2027-01-16","season":2027,"homeTeam":"Claymores",
           "awayTeam":"Claymores","homeScore":0,"awayScore":0,"status":"upcoming","matchType":"friendly",
           "competition":"Annual Highland games","kickoffTime":"1:00pm",
           "venue":"Central Winds Park, Winter Springs Fl 32708","manualOverride":true}
        ]
        """)!;

    [Fact]
    public async Task Adopts_hand_edits_idempotently_and_rescrapes_leave_them_alone()
    {
        database.SkipIfUnavailable();
        var ct = TestContext.Current.CancellationToken;
        var store = new ScrapeStore(_dataSource!);
        var service = new ScrapeService(_site, store, NullLogger<ScrapeService>.Instance);

        // The scraper saw the Jacksonville game as an upcoming D3 league game with a kickoff and venue.
        var page = ClubPageBuilder.Build(
            new ClubPageBuilder.Game("Saturday, November 22, 2025", "Jacksonville D3", "IR/Claymores", Competition: "Men D2/D3",
                Kickoff: "1:00 PM"),
            new ClubPageBuilder.Game("Saturday, October 4, 2025", "Claymores", "Gainesville", 3, 5));
        _site.ClubPages[(117, 27)] = page;
        await service.ScrapeFixturesAsync(new FixtureScrapeRequest([117], [27], false), "cli", ct);
        await Execute("UPDATE fixtures SET venue = 'Plantation' WHERE fixture_date = '2025-11-22'");

        var first = await SanityAdoption.RunAsync(store, SanityDocs, ct);
        // The plain scraped Gainesville doc is not a hand edit; the other three are.
        Assert.Equal((2, 1, 0), (first.Adopted, first.Updated, first.Unchanged));
        Assert.Empty(first.Skipped);
        Assert.Contains(first.UnresolvedNames, name => name.StartsWith("HHIRFC", StringComparison.Ordinal));

        // Override doc: Sanity's status and competition win, the scraped kickoff and venue stay.
        await using (var command = _dataSource!.CreateCommand("""
            SELECT status, competition, match_type, manual_override, origin_sanity_id, to_char(kickoff_time, 'HH24:MI'), venue,
                   payload->>'status'
            FROM fixtures WHERE source = 'scraper' AND fixture_date = '2025-11-22'
            """))
        await using (var reader = await command.ExecuteReaderAsync(ct))
        {
            Assert.True(await reader.ReadAsync(ct));
            Assert.Equal(("cancelled", "Friendlies 2025-26", "friendly", true), (reader.GetString(0), reader.GetString(1),
                reader.GetString(2), reader.GetBoolean(3)));
            Assert.Equal(("scraped-2025-11-22-jacksonville-claymores", "13:00", "Plantation", "cancelled"),
                (reader.GetString(4), reader.GetString(5), reader.GetString(6), reader.GetString(7)));
        }

        // Hand-created doc with an opponent we did not know: a needs_review team and a locked row.
        Assert.Equal(1L, await Scalar<long>("""
            SELECT count(*) FROM fixtures f JOIN teams t ON t.id = f.away_team_id
            WHERE f.source = 'scraper' AND f.fixture_date = '2026-04-11' AND t.name = 'HHIRFC' AND t.needs_review
              AND f.manual_override AND f.origin_sanity_id = '07c4a7f0-4210-4a45-a880-4ca231fb86a4' AND f.competition IS NULL
            """));

        // Intra-club fixture: home and away are both Claymores.
        Assert.Equal(1L, await Scalar<long>("""
            SELECT count(*) FROM fixtures f JOIN teams t ON t.id = f.home_team_id
            WHERE f.source = 'scraper' AND f.fixture_date = '2027-01-16' AND f.home_team_id = f.away_team_id
              AND t.name = 'Claymores' AND f.kickoff_time = '13:00' AND f.payload->>'kickoffTime' = '1:00 PM'
              AND f.payload->>'homeTeam' = 'Claymores' AND f.competition = 'Annual Highland games'
            """));
        // The plain scraped game is untouched.
        Assert.False(await Scalar<bool>("SELECT manual_override FROM fixtures WHERE fixture_date = '2025-10-04'"));

        // Rerunning changes nothing.
        var updatedAt = await Scalar<DateTime>("SELECT max(updated_at) FROM fixtures");
        var second = await SanityAdoption.RunAsync(store, SanityDocs, ct);
        Assert.Equal((0, 0, 3), (second.Adopted, second.Updated, second.Unchanged));
        Assert.Empty(second.UnresolvedNames);
        Assert.Equal(updatedAt, await Scalar<DateTime>("SELECT max(updated_at) FROM fixtures"));
        Assert.Equal(4L, await Scalar<long>("SELECT count(*) FROM fixtures WHERE source = 'scraper'"));

        // A rescrape that still reports the game as upcoming does not overwrite the adopted row.
        var rescrape = await service.ScrapeFixturesAsync(new FixtureScrapeRequest([117], [27], false), "cli", ct);
        Assert.Equal(1, rescrape.Pages.Single().SkippedManualOverride);
        Assert.Equal("cancelled", await Scalar<string>("SELECT status FROM fixtures WHERE fixture_date = '2025-11-22'"));

        // After adoption the comparison sees every Sanity game as matching.
        var report = SanityComparison.CompareFixtures(SanityDocs, await store.ScrapedFixturesAsync(ct), await store.LoadResolverAsync(ct));
        Assert.Equal((4, 0), (report.Matched, report.Differences));
        Assert.Contains(report.Lines, line => line.StartsWith("LOCKED 3 ", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Moves_an_adopted_row_when_the_sanity_document_changes_date()
    {
        database.SkipIfUnavailable();
        var ct = TestContext.Current.CancellationToken;
        var store = new ScrapeStore(_dataSource!);
        JsonElement[] Docs(string date) => JsonSerializer.Deserialize<JsonElement[]>($$"""
            [{"id":"hand-1","date":"{{date}}","homeTeam":"Claymores","awayTeam":"Orlando Otters","homeScore":0,
              "awayScore":0,"status":"upcoming","matchType":"friendly"}]
            """)!;

        Assert.Equal(1, (await SanityAdoption.RunAsync(store, Docs("2027-02-06"), ct)).Adopted);
        Assert.Equal(1, (await SanityAdoption.RunAsync(store, Docs("2027-02-27"), ct)).Updated);
        Assert.Equal("2027-02-27", await Scalar<string>(
            "SELECT string_agg(to_char(fixture_date, 'YYYY-MM-DD'), ',') FROM fixtures WHERE origin_sanity_id = 'hand-1'"));
        Assert.Equal("2027-02-27", await Scalar<string>("SELECT payload->>'date' FROM fixtures WHERE origin_sanity_id = 'hand-1'"));
    }

    [Fact]
    public async Task A_moved_adopted_row_gets_a_new_id_so_the_old_key_can_be_scraped_again()
    {
        database.SkipIfUnavailable();
        var ct = TestContext.Current.CancellationToken;
        var store = new ScrapeStore(_dataSource!);
        var service = new ScrapeService(_site, store, NullLogger<ScrapeService>.Instance);
        Task<FixtureScrapeResult> Scrape() => service.ScrapeFixturesAsync(new FixtureScrapeRequest([117], [42], false), "cli", ct);
        JsonElement[] Docs(string date) => JsonSerializer.Deserialize<JsonElement[]>($$"""
            [{"id":"hand-move","date":"{{date}}","homeTeam":"Claymores","awayTeam":"Daytona","homeScore":0,
              "awayScore":0,"status":"upcoming","matchType":"friendly","manualOverride":true}]
            """)!;

        // The scraper wrote the game on May 4; an admin locked it in Sanity, adoption took it over.
        _site.ClubPages[(117, 42)] = ClubPageBuilder.Build(
            new ClubPageBuilder.Game("Saturday, May 4, 2030", "Claymores", "Daytona"),
            new ClubPageBuilder.Game("Saturday, May 11, 2030", "Claymores", "Lakeland"));
        Assert.Equal(2, (await Scrape()).Pages.Single().Inserted);
        var oldId = await Scalar<string>("SELECT sanity_id FROM fixtures WHERE fixture_date = '2030-05-04'");
        Assert.Equal(1, (await SanityAdoption.RunAsync(store, Docs("2030-05-04"), ct)).Updated);

        // The Sanity document moves to May 18: the row moves with a fresh id and keeps its origin.
        Assert.Equal(1, (await SanityAdoption.RunAsync(store, Docs("2030-05-18"), ct)).Updated);
        var movedId = await Scalar<string>("SELECT sanity_id FROM fixtures WHERE origin_sanity_id = 'hand-move'");
        Assert.NotEqual(oldId, movedId);
        Assert.StartsWith("rfl-2030-05-18-", movedId);
        Assert.Equal(movedId, await Scalar<string>("SELECT payload->>'id' FROM fixtures WHERE origin_sanity_id = 'hand-move'"));

        // rugbyfl.com still lists May 4 (plus a new game): the scrape inserts the old key without a
        // primary key conflict, and the rest of the batch is written.
        _site.ClubPages[(117, 42)] = ClubPageBuilder.Build(
            new ClubPageBuilder.Game("Saturday, May 4, 2030", "Claymores", "Daytona"),
            new ClubPageBuilder.Game("Saturday, May 11, 2030", "Claymores", "Lakeland"),
            new ClubPageBuilder.Game("Saturday, May 25, 2030", "Claymores", "Brevard"));
        var page = (await Scrape()).Pages.Single();
        Assert.Equal((2, 1, 0), (page.Inserted, page.Unchanged, page.Retired));
        Assert.Equal(oldId, await Scalar<string>("SELECT sanity_id FROM fixtures WHERE fixture_date = '2030-05-04'"));
        // The adopted row is locked: never retired although the page doesn't list May 18.
        Assert.False(await Scalar<bool>("SELECT retired_at IS NOT NULL FROM fixtures WHERE origin_sanity_id = 'hand-move'"));

        // A row moved before this fix still holds the old id. The scraper picks a free id instead of
        // aborting the batch on the primary key.
        await Execute($"""
            DELETE FROM fixtures WHERE sanity_id = '{oldId}';
            UPDATE fixtures SET sanity_id = '{oldId}' WHERE origin_sanity_id = 'hand-move';
            """);
        page = (await Scrape()).Pages.Single();
        Assert.Equal((1, 2), (page.Inserted, page.Unchanged));
        Assert.Equal(oldId + "-2", await Scalar<string>("SELECT sanity_id FROM fixtures WHERE fixture_date = '2030-05-04'"));
        Assert.Equal(oldId, await Scalar<string>("SELECT sanity_id FROM fixtures WHERE origin_sanity_id = 'hand-move'"));
    }
}
