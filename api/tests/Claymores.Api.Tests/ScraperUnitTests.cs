using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Claymores.Api.Tests;

internal static class RugbyFlPages
{
    public static string Read(string name) =>
        File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "rugbyfl", name));

    /// <summary>The teams and aliases seeded by sql/007_scraped_data.sql, parsed from the script itself.</summary>
    public static (string[] Teams, (string Alias, string Normalized, string Team)[] Aliases) Seed()
    {
        var sql = DatabaseMigrator.LoadScripts().Single(script => script.Version == "007_scraped_data").Sql;
        var teamsBlock = sql[sql.IndexOf("INSERT INTO teams (name, slug, source) VALUES", StringComparison.Ordinal)..];
        teamsBlock = teamsBlock[..teamsBlock.IndexOf("ON CONFLICT", StringComparison.Ordinal)];
        var teams = Regex.Matches(teamsBlock, @"\('([^']+)', '[^']+', 'seed'\)").Select(m => m.Groups[1].Value).ToArray();
        var aliasBlock = sql[sql.IndexOf("INSERT INTO team_aliases", StringComparison.Ordinal)..];
        aliasBlock = aliasBlock[..aliasBlock.IndexOf(") AS seed", StringComparison.Ordinal)];
        var aliases = Regex.Matches(aliasBlock, @"\('([^']+)', '([^']+)', '([^']+)'\)")
            .Select(m => (m.Groups[1].Value, m.Groups[2].Value, m.Groups[3].Value)).ToArray();
        return (teams, aliases);
    }

    public static TeamNameResolver SeedResolver()
    {
        var (teams, aliases) = Seed();
        return new TeamNameResolver(teams.Select((name, index) => new TeamCandidate(index + 1, name,
            aliases.Where(alias => alias.Team == name).Select(alias => alias.Alias).ToArray())));
    }
}

public sealed class TeamNameResolverTests
{
    [Theory]
    [InlineData("Ft. Lauderdale Knights RFC (D3)", "ft lauderdale knights")]
    [InlineData("Central Florida Claymores RFC", "central florida claymores")]
    [InlineData("Jacksonville D3", "jacksonville")]
    [InlineData("Jacksonville D4", "jacksonville")]
    [InlineData("Gainesville (D3)", "gainesville")]
    [InlineData("Sarasota Rugby Club", "sarasota")]
    [InlineData("Tallahassee Rugby", "tallahassee")]
    [InlineData("Brevard Old Red Eye Rugby Football Club", "brevard old red eye")]
    [InlineData("Some F.C.", "some")]
    [InlineData("Miami FC", "miami")]
    [InlineData("IR/Claymores", "claymores")]
    [InlineData("Orlando Otters 2026", "orlando otters")]
    [InlineData("FSU B", "fsu b")]
    [InlineData("Orlando Otters II", "orlando otters ii")]
    public void Normalizes_names(string raw, string expected) => Assert.Equal(expected, TeamNameResolver.Normalize(raw));

    [Fact]
    public void Seeded_alias_keys_match_the_normalizer()
    {
        var (teams, aliases) = RugbyFlPages.Seed();
        Assert.Equal(14, teams.Length);
        Assert.Equal(20, aliases.Length);
        foreach (var (alias, normalized, team) in aliases)
        {
            Assert.Equal(TeamNameResolver.Normalize(alias), normalized);
            Assert.Contains(team, teams);
        }
    }

    [Theory]
    [InlineData("Claymores", "Claymores", TeamMatchKind.Claymores)]
    [InlineData("IR/Claymores", "Claymores", TeamMatchKind.Claymores)]
    [InlineData("Claymores (D3)", "Claymores", TeamMatchKind.Claymores)]
    [InlineData("Central Florida Claymores RFC", "Claymores", TeamMatchKind.Claymores)]
    [InlineData("Orlando Otters", "Orlando Otters", TeamMatchKind.ExactName)]
    [InlineData("Orlando Otters 2026", "Orlando Otters", TeamMatchKind.ExactName)]
    [InlineData("Daytona Coconuts RFC", "Daytona Coconuts", TeamMatchKind.ExactName)]
    [InlineData("Jacksonville D4", "Jacksonville Rugby", TeamMatchKind.ExactName)] // "Jacksonville Rugby" normalizes to "jacksonville"
    [InlineData("Jacksonville (D3)", "Jacksonville Rugby", TeamMatchKind.ExactName)]
    [InlineData("Tallahassee", "Tallahassee Rugby", TeamMatchKind.ExactName)]
    [InlineData("Pelicans (D3)", "St Pete Pelicans", TeamMatchKind.ExactAlias)]
    [InlineData("Ft. Lauderdale (D3)", "Fort Lauderdale RFC", TeamMatchKind.ExactAlias)]
    [InlineData("Orlando D3", "Orlando Griffins", TeamMatchKind.ExactAlias)]
    [InlineData("FSU B", "Tallahassee Rugby", TeamMatchKind.ExactAlias)]
    [InlineData("Gainesville Rugby Club", "Gainesville Hogs", TeamMatchKind.ExactAlias)]
    [InlineData("Ft. Lauderdale Knights RFC (D3)", "Fort Lauderdale RFC", TeamMatchKind.Fuzzy)]
    [InlineData("Brevard Old Red Eye", "Brevard Red Eyes", TeamMatchKind.Fuzzy)]
    public void Resolves_known_names(string raw, string team, TeamMatchKind kind)
    {
        var match = RugbyFlPages.SeedResolver().Resolve(raw);
        Assert.NotNull(match);
        Assert.Equal(team, match.TeamName);
        Assert.Equal(kind, match.Kind);
    }

    [Theory]
    [InlineData("Eckerd")]
    [InlineData("Embry Riddle")]
    [InlineData("Orlando Otters II")] // a second side joins its club only through an alias
    [InlineData("Gainesville B")]
    [InlineData("Jacksonville Womens")]
    [InlineData("Tampa")]
    [InlineData("")]
    public void Leaves_unknown_names_unresolved(string raw) => Assert.Null(RugbyFlPages.SeedResolver().Resolve(raw));

    [Fact]
    public void Fuzzy_matches_must_be_unambiguous()
    {
        var resolver = new TeamNameResolver([
            new TeamCandidate(1, "Bay Sharks", []),
            new TeamCandidate(2, "Bay Rays", []),
            new TeamCandidate(3, "Coast", ["Coast Guard"]),
        ]);
        Assert.Null(resolver.Resolve("Bay Sharks Rays"));
        Assert.Equal(1, resolver.Resolve("Bay Sharks Old Boys")!.TeamId);
        Assert.Null(resolver.Resolve("Bay")); // the input must contain the candidate, not the reverse
    }

    [Fact]
    public void Learns_teams_added_after_loading()
    {
        var resolver = RugbyFlPages.SeedResolver();
        Assert.Null(resolver.Resolve("Eckerd"));
        resolver.Add(new TeamCandidate(99, "Eckerd", []));
        Assert.Equal(99, resolver.Resolve("Eckerd College RFC")!.TeamId);
    }
}

public sealed class ScraperRuleTests
{
    [Theory]
    [InlineData("2025-07-31", 2025)]
    [InlineData("2025-08-01", 2026)]
    [InlineData("2025-12-31", 2026)]
    [InlineData("2026-01-10", 2026)]
    public void Seasons_are_named_by_their_closing_year(string date, int season) =>
        Assert.Equal(season, RugbyFlParser.SeasonFor(DateOnly.Parse(date)));

    [Theory]
    [InlineData(false, "Forfeit by Claymores", FixtureStatus.Upcoming)]
    [InlineData(true, "", FixtureStatus.Played)]
    [InlineData(true, "Crossover game", FixtureStatus.Played)]
    [InlineData(true, "Forfeit by Claymores. Game not played.", FixtureStatus.ForfeitUs)]
    [InlineData(true, "Claymores forfeit", FixtureStatus.ForfeitUs)]
    [InlineData(true, "IR/Claymores forfeits the match", FixtureStatus.ForfeitUs)]
    [InlineData(true, "Forfeit by Daytona. Game not played", FixtureStatus.ForfeitThem)]
    [InlineData(true, "Crossover game. Lakeland forfeits. Game played. Claymores 26-15", FixtureStatus.ForfeitThem)]
    public void Derives_status(bool hasScores, string note, string status) =>
        Assert.Equal(status, RugbyFlParser.StatusFor(hasScores, note));

    [Fact]
    public void Forfeits_score_twenty_nil_to_the_side_that_turned_up()
    {
        Assert.Equal((0, 20), RugbyFlParser.ScoresFor(FixtureStatus.ForfeitUs, "Claymores", "Daytona", 5, 5));
        Assert.Equal((20, 0), RugbyFlParser.ScoresFor(FixtureStatus.ForfeitUs, "Daytona", "IR/Claymores", 0, 0));
        Assert.Equal((20, 0), RugbyFlParser.ScoresFor(FixtureStatus.ForfeitThem, "Claymores", "Lakeland", 26, 15));
        Assert.Equal((0, 20), RugbyFlParser.ScoresFor(FixtureStatus.ForfeitThem, "Lakeland", "Claymores", 0, 0));
        Assert.Equal((14, 17), RugbyFlParser.ScoresFor(FixtureStatus.Played, "Claymores", "Lakeland", 14, 17));
    }

    [Theory]
    [InlineData("Friendlies 2025-26", "friendly")]
    [InlineData("FRIENDLY", "friendly")]
    [InlineData("Men Division 3", "league")]
    [InlineData(null, "league")]
    public void Classifies_match_type(string? competition, string type) =>
        Assert.Equal(type, RugbyFlParser.MatchTypeFor(competition));

    [Theory]
    [InlineData("CANCELLED", true)]
    [InlineData("Canceled due to weather", true)]
    [InlineData("Cancelled - forfeit by Daytona", false)]
    [InlineData("Forfeit by FTL. Game not played.", true)]
    [InlineData("Forfeit by Lakeland. Game played", false)]
    [InlineData("Moved from 3/16/2024", false)]
    [InlineData("", false)]
    public void Detects_cancelled_games(string note, bool cancelled) =>
        Assert.Equal(cancelled, RugbyFlParser.IsCancelled(note));

    [Theory]
    [InlineData("QF1 - #7 travels to #2", null)] // kept as in the website rules: "QF" is not a keyword
    [InlineData("Quarter-final 2", "quarter")]
    [InlineData("D3 Semifinal South", "semi")]
    [InlineData("Gulf Coast Super Regional Semi Final", "semi")]
    [InlineData("3rd Place playoff", "third")]
    [InlineData("Men D3 State Final", "final")]
    [InlineData("Gulf Coast Super Regional FINAL", "final")]
    [InlineData("Crossover game", null)]
    public void Classifies_playoff_rounds(string note, string? round) =>
        Assert.Equal(round, RugbyFlParser.ClassifyRound(note));
}

public sealed class RugbyFlParserTests
{
    [Fact]
    public void Parses_a_played_season_from_a_saved_club_page()
    {
        var fixtures = RugbyFlParser.ParseClubFixtures(RugbyFlPages.Read("club-117-season-27.html"))
            .Where(f => f.InvolvesClaymores).ToArray();
        Assert.Equal(10, fixtures.Length);
        Assert.All(fixtures, f => Assert.Equal(2026, f.Season));

        var opener = fixtures[0];
        Assert.Equal(new DateOnly(2025, 9, 20), opener.Date);
        Assert.Equal("Orlando Otters 2026", opener.HomeTeam);
        Assert.Equal("Claymores", opener.AwayTeam);
        Assert.Equal((14, 91), (opener.HomeScore, opener.AwayScore));
        Assert.Equal(FixtureStatus.Played, opener.Status);
        Assert.Equal("friendly", opener.MatchType);
        Assert.Equal("Friendlies 2025-26", opener.Competition);
        Assert.Equal(new TimeOnly(13, 0), opener.Kickoff);
        Assert.Equal(13351, opener.GameId);
        Assert.Null(opener.Note);

        var forfeitUs = fixtures.Single(f => f.Date == new DateOnly(2026, 2, 7));
        Assert.Equal(FixtureStatus.ForfeitUs, forfeitUs.Status);
        // The website scraper stored the whole note cell, label included; kept for parity with Sanity.
        Assert.Equal("Note: Forfeit by Claymores. Game not played.", forfeitUs.Note);
        Assert.Equal(("Jacksonville", 20, 0), (forfeitUs.HomeTeam, forfeitUs.HomeScore, forfeitUs.AwayScore));
        Assert.Equal("league", forfeitUs.MatchType);
        Assert.Equal(new TimeOnly(12, 30), forfeitUs.Kickoff);

        var forfeitThem = fixtures.Single(f => f.Date == new DateOnly(2026, 2, 28));
        Assert.Equal(FixtureStatus.ForfeitThem, forfeitThem.Status);
        Assert.Equal(("Claymores", 20, 0), (forfeitThem.HomeTeam, forfeitThem.HomeScore, forfeitThem.AwayScore));

        var notPlayedYet = fixtures.Single(f => f.Date == new DateOnly(2025, 11, 22));
        Assert.Equal(FixtureStatus.Upcoming, notPlayedYet.Status);
        Assert.Equal((0, 0), (notPlayedYet.HomeScore, notPlayedYet.AwayScore));
    }

    [Fact]
    public void Parses_upcoming_games_and_collapses_division_suffixes_on_our_side()
    {
        var fixtures = RugbyFlParser.ParseClubFixtures(RugbyFlPages.Read("club-117-season-28.html"))
            .Where(f => f.InvolvesClaymores).ToArray();
        Assert.Equal(6, fixtures.Length);
        Assert.All(fixtures, f => Assert.Equal(2027, f.Season));
        Assert.Equal(("Gainesville (D3)", "Claymores", 62, 22, FixtureStatus.Played),
            (fixtures[0].HomeTeam, fixtures[0].AwayTeam, fixtures[0].HomeScore, fixtures[0].AwayScore, fixtures[0].Status));
        Assert.Equal("Claymores (D3)", fixtures[0].AwayTeamRaw);
        Assert.Equal(5, fixtures.Count(f => f.Status == FixtureStatus.Upcoming));
    }

    [Fact]
    public void Reads_the_venue_from_a_game_detail_page()
    {
        Assert.Equal("Plantation Sports Complex, 321 Old Hard Rd, Fleming Island, FL",
            RugbyFlParser.ParseGameVenue(RugbyFlPages.Read("game-13415.html")));
        Assert.Null(RugbyFlParser.ParseGameVenue("<table><tr><td><strong>Field:</strong> Pending<br/>x</td></tr></table>"));
        Assert.Null(RugbyFlParser.ParseGameVenue("<p>No field here</p>"));
    }

    [Fact]
    public void Parses_a_published_standings_table()
    {
        var parsed = RugbyFlParser.ParseChampionship(RugbyFlPages.Read("championship-191.html"));
        Assert.NotNull(parsed);
        Assert.Equal(StandingsSource.StandingsTable, parsed.Source);
        var raw = RugbyFlParser.ParseStandings(RugbyFlPages.Read("championship-191.html"));
        Assert.Equal(raw.Count(r => r.Pool != "Unique"), parsed.Rows.Count);
        Assert.Contains(new StandingsRow("Ft. Lauderdale Knights RFC (D3)", "Combo", 7, 5, 2, 0, 168, 57, 111, 0, 18), raw);
        Assert.Equal(Enumerable.Range(1, parsed.Rows.Count), parsed.Rows.Select(r => r.Position));
        Assert.True(parsed.Rows.Zip(parsed.Rows.Skip(1)).All(pair =>
            pair.First.Row.TotalPoints > pair.Second.Row.TotalPoints ||
            (pair.First.Row.TotalPoints == pair.Second.Row.TotalPoints &&
             pair.First.Row.PointsDifference >= pair.Second.Row.PointsDifference)));
        Assert.Contains(parsed.Rows, r => TeamNameResolver.IsClaymores(r.Row.TeamName));
    }

    [Fact]
    public void Drops_the_unique_pool_and_reranks_like_the_website_table()
    {
        var html = RugbyFlPages.Read("championship-191.html");
        var raw = RugbyFlParser.ParseStandings(html);
        Assert.Equal(19, raw.Count);
        Assert.Equal(["Austin Blacks", "New Orleans", "Detroit Tradesmen", "Life West Gladiators", "Syracuse Chargers"],
            raw.Where(r => r.Pool == "Unique").Select(r => r.TeamName));

        var parsed = RugbyFlParser.ParseChampionship(html)!;
        Assert.Equal(14, parsed.Rows.Count);
        Assert.DoesNotContain(parsed.Rows, r => r.Row.Pool == "Unique");
        Assert.Equal(Enumerable.Range(1, 14), parsed.Rows.Select(r => r.Position));
        // The order Sanity's leagueStandings for championship 191 lists (checked against production on 2026-11-24).
        // Sanity numbers its last three 18-20 because rows were deleted by hand without renumbering; we re-rank to 12-14.
        Assert.Equal(
        [
            "Palm Beach Panthers RFC", "Ft. Lauderdale Knights RFC (D3)", "Jacksonville RFC", "Brevard Old Red Eye RFC",
            "Sarasota Surge RFC", "FSU B", "Bay Area Pelican RFC (D3)", "Central Florida Claymores RFC",
            "Gainesville Hogs RFC", "SWFL Hammerheads RFC", "Tampa Bay Krewe RFC (D3)", "Orlando Griffins RFC (D3)",
            "Daytona Beach Coconuts RFC", "Lakeland Lancers RFC",
        ], parsed.Rows.Select(r => r.Row.TeamName));
        Assert.Equal(8, parsed.Rows.Single(r => TeamNameResolver.IsClaymores(r.Row.TeamName)).Position);
        Assert.Equal(12, parsed.Rows.Single(r => r.Row.TeamName.StartsWith("Orlando Griffins", StringComparison.Ordinal)).Position);
    }

    [Theory]
    [InlineData("Unique")]
    [InlineData(" unique ")]
    [InlineData("UNIQUE")]
    public void Pool_exclusion_ignores_case_and_whitespace(string pool)
    {
        var rows = RugbyFlParser.ExcludePools([
            new StandingsRow("A", pool, 1, 1, 0, 0, 10, 0, 10, 0, 4),
            new StandingsRow("B", "North", 1, 0, 1, 0, 0, 10, -10, 0, 0),
        ]);
        Assert.Equal(["B"], rows.Select(r => r.TeamName));
    }

    [Fact]
    public void Extracts_playoffs_from_the_schedule()
    {
        var parsed = RugbyFlParser.ParseChampionship(RugbyFlPages.Read("championship-162.html"));
        Assert.NotNull(parsed);
        Assert.Equal(["semi", "semi", "final", "semi", "final"], parsed.Playoffs.Select(p => p.Round));
        Assert.Equal("D3 Semifinal South", parsed.Playoffs[0].Label);
        Assert.Matches(@"^\d{4}-\d{2}-\d{2}$", parsed.Playoffs[0].Date);
    }

    [Fact]
    public void Computes_standings_from_the_schedule_when_none_are_published()
    {
        var html = RugbyFlPages.Read("championship-120.html");
        Assert.Empty(RugbyFlParser.ParseStandings(html));
        var schedule = RugbyFlParser.ParseSchedule(html);
        Assert.Contains(schedule, m => RugbyFlParser.IsCancelled(m.Note));

        var parsed = RugbyFlParser.ParseChampionship(html);
        Assert.NotNull(parsed);
        Assert.Equal(StandingsSource.ComputedFromSchedule, parsed.Source);
        var counted = schedule.Count(m => !RugbyFlParser.IsCancelled(m.Note) && !RugbyFlParser.IsPlayoff(m.Note) &&
                                          (m.HomeScore is not null || m.AwayScore is not null));
        Assert.Equal(counted * 2, parsed.Rows.Sum(r => r.Row.Played));
        Assert.All(parsed.Rows, r => Assert.Equal(r.Row.PointsFor - r.Row.PointsAgainst, r.Row.PointsDifference));
    }

    [Fact]
    public void Applies_league_points_and_bonuses()
    {
        ScheduleMatch Game(string home, string away, int? hs, int? @as, int ht = 0, int at = 0, string note = "") =>
            new("2026-01-01", home, away, hs, @as, ht, at, note);

        var rows = RugbyFlParser.ComputeStandingsFromSchedule([
            Game("A", "B", 30, 25, ht: 4, at: 4),          // A: 4+1 try; B: 1 try + 1 losing = 2
            Game("B", "C", 10, 10),                         // draw: 2 each
            Game("C", "A", 20, 0, note: "Forfeit by A."),   // forfeit: win 4, no bonuses
            Game("A", "C", 50, 0, note: "CANCELLED"),       // cancelled: skipped
            Game("A", "B", 40, 0, note: "D3 Semifinal"),    // playoff: skipped
            Game("B", "C", null, null),                     // unplayed: skipped
        ]).ToDictionary(r => r.TeamName);

        Assert.Equal(new StandingsRow("A", "", 2, 1, 1, 0, 30, 45, -15, 1, 5), rows["A"]);
        Assert.Equal(new StandingsRow("B", "", 2, 0, 1, 1, 35, 40, -5, 2, 4), rows["B"]);
        Assert.Equal(new StandingsRow("C", "", 2, 1, 0, 1, 30, 10, 20, 0, 6), rows["C"]);

        var ranked = RugbyFlParser.Rank([
            rows["A"], rows["B"], rows["C"], rows["A"] with { TeamName = "AA", PointsDifference = 0 },
            rows["A"] with { TeamName = "Ab", PointsDifference = 0 },
        ]);
        Assert.Equal(["C", "AA", "Ab", "A", "B"], ranked.Select(r => r.Row.TeamName));
    }

    [Fact]
    public void Score_cells_and_dates_parse_like_the_website()
    {
        Assert.Equal(31, RugbyFlParser.ParseScoreCell(" (31) "));
        Assert.Null(RugbyFlParser.ParseScoreCell("0"));
        Assert.Null(RugbyFlParser.ParseScoreCell(""));
        Assert.Equal("2023-04-01", RugbyFlParser.ParseScheduleDate("4/1/2023  "));
        Assert.Equal("", RugbyFlParser.ParseScheduleDate("TBD"));
    }
}

public sealed class ScraperCommandTests
{
    [Fact]
    public void Parses_hide_fixtures()
    {
        Assert.Equal(["rfl-2018-10-13-34-2", "rfl-2019-11-16-42-2"],
            ScraperCommand.Parse(["--hide-fixtures", "rfl-2018-10-13-34-2", "rfl-2019-11-16-42-2", "rfl-2018-10-13-34-2"]).FixtureIds);
        Assert.Throws<ArgumentException>(() => ScraperCommand.Parse(["--hide-fixtures"]));
        Assert.Throws<ArgumentException>(() => ScraperCommand.Parse(["--hide-fixtures", "x'; drop"]));
        Assert.Throws<ArgumentException>(() => ScraperCommand.Parse(["--hide-fixtures", "--all"]));
    }

    [Fact]
    public void Parses_fixture_options()
    {
        var single = ScraperCommand.Parse(["--scrape-fixtures"]).Fixtures!;
        Assert.Equal([117], single.ClubIds);
        Assert.Equal([28], single.SeasonIds);
        Assert.True(single.FetchVenues);

        Assert.Equal([27], ScraperCommand.Parse(["--scrape-fixtures", "--season-id", "27"]).Fixtures!.SeasonIds);

        var all = ScraperCommand.Parse(["--scrape-fixtures", "--all"]).Fixtures!;
        Assert.Equal([117, 51], all.ClubIds);
        Assert.Equal(Enumerable.Range(10, 19), all.SeasonIds);
        Assert.False(all.FetchVenues);

        Assert.Throws<ArgumentException>(() => ScraperCommand.Parse(["--scrape-fixtures", "--season-id", "x"]));
        Assert.Throws<ArgumentException>(() => ScraperCommand.Parse(["--scrape-fixtures", "--season-id"]));
        Assert.Throws<ArgumentException>(() => ScraperCommand.Parse(["--scrape-fixtures", "--force"]));
    }

    [Fact]
    public void Parses_standings_options()
    {
        Assert.Equal(new StandingsScrapeRequest(true, null, null, null),
            ScraperCommand.Parse(["--scrape-standings", "--force"]).Standings);
        Assert.Equal(new StandingsScrapeRequest(false, "162", "2023-2024", null),
            ScraperCommand.Parse(["--scrape-standings", "--championship-id", "162", "--season-label", "2023-2024"]).Standings);
        Assert.Throws<ArgumentException>(() => ScraperCommand.Parse(["--scrape-standings", "--championship-id", "162"]));
        Assert.Throws<ArgumentException>(() =>
            ScraperCommand.Parse(["--scrape-standings", "--championship-id", "1x", "--season-label", "2023-2024"]));
        Assert.False(ScraperCommand.IsScraperCommand(["--migrate"]));
    }
}

public sealed class ScrapeEndpointTests
{
    [Fact]
    public void Compares_bearer_tokens_exactly()
    {
        Assert.True(ScrapeEndpoints.IsAuthorized("Bearer s3cret-value", "s3cret-value"));
        Assert.False(ScrapeEndpoints.IsAuthorized("Bearer s3cret-valu", "s3cret-value"));
        Assert.False(ScrapeEndpoints.IsAuthorized("bearer s3cret-value", "s3cret-value"));
        Assert.False(ScrapeEndpoints.IsAuthorized("s3cret-value", "s3cret-value"));
        Assert.False(ScrapeEndpoints.IsAuthorized("", "s3cret-value"));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("configured-secret")] // without Postgres the scraper is unavailable
    public async Task Returns_404_unless_secret_and_database_are_configured(string? secret)
    {
        await using var factory = ApiFactory.With(new Dictionary<string, string?> { ["Scraper:Secret"] = secret });
        using var client = factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, "/v1/internal/scrape/fixtures");
        request.Headers.Authorization = new("Bearer", "configured-secret");
        using var response = await client.SendAsync(request, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}

public sealed class SanityComparisonTests
{
    [Fact]
    public void Reports_missing_extra_and_different_games()
    {
        var resolver = RugbyFlPages.SeedResolver();
        var claymores = resolver.Resolve("Claymores")!.TeamId;
        var jacksonville = resolver.Resolve("Jacksonville")!.TeamId;
        var daytona = resolver.Resolve("Daytona")!.TeamId;
        var sanity = JsonSerializer.Deserialize<JsonElement[]>("""
            [
              {"id":"a","date":"2026-02-07","homeTeam":"Jacksonville D3","awayTeam":"Claymores","homeScore":20,"awayScore":0,"status":"forfeit_us","matchType":"league"},
              {"id":"b","date":"2026-03-07","homeTeam":"Claymores","awayTeam":"Daytona","homeScore":20,"awayScore":0,"status":"forfeit_them","matchType":"league","venue":"Barnett Park"},
              {"id":"c","date":"2026-04-01","homeTeam":"Claymores","awayTeam":"Okapi","homeScore":0,"awayScore":0,"status":"upcoming"},
              {"id":"d","date":"2026-04-01","homeTeam":"Claymores","awayTeam":"Okapi Wanderers","homeScore":0,"awayScore":0,"status":"upcoming"}
            ]
            """)!;
        StoredFixture Row(string id, string date, string home, string away, long homeId, long awayId, string status, string? venue = null) =>
            new(id, DateOnly.Parse(date), home, away, homeId, awayId, 20, 0, status, "league", null, null, null, venue, false);
        var report = SanityComparison.CompareFixtures(sanity,
        [
            Row("x", "2026-02-07", "Jacksonville", "Claymores", jacksonville, claymores, "forfeit_us", venue: "Plantation"),
            Row("y", "2026-03-07", "Claymores", "Daytona", claymores, daytona, "forfeit_them"),
            Row("z", "2026-05-01", "Claymores", "Daytona", claymores, daytona, "upcoming"),
        ], resolver);

        Assert.Equal(1, report.Matched);
        Assert.Equal(3, report.Differences);
        Assert.Contains(report.Lines, line => line.StartsWith("DUPLICATE in Sanity 2026-04-01", StringComparison.Ordinal));
        Assert.Contains(report.Lines, line => line.StartsWith("ONLY IN SANITY  2026-04-01", StringComparison.Ordinal));
        Assert.Contains(report.Lines, line => line.StartsWith("ONLY IN POSTGRES 2026-05-01", StringComparison.Ordinal));
        Assert.Contains(report.Lines, line => line.Contains("venue: sanity=\"Barnett Park\" postgres=null", StringComparison.Ordinal));
        Assert.Contains(report.Lines, line => line.StartsWith("ENRICHED 1 games", StringComparison.Ordinal));
    }

    [Fact]
    public void Counts_a_locked_row_equal_to_sanity_as_matching_and_compares_kickoffs_as_times()
    {
        var resolver = RugbyFlPages.SeedResolver();
        var claymores = resolver.Resolve("Claymores")!.TeamId;
        var sanity = JsonSerializer.Deserialize<JsonElement[]>("""
            [{"id":"h","date":"2027-01-16","homeTeam":"Claymores","awayTeam":"Claymores","homeScore":0,"awayScore":0,
              "status":"upcoming","matchType":"friendly","competition":"Annual Highland games","kickoffTime":"1:00pm",
              "venue":"Central Winds Park"}]
            """)!;
        var report = SanityComparison.CompareFixtures(sanity,
        [
            new StoredFixture("rfl", DateOnly.Parse("2027-01-16"), "Claymores", "Claymores", claymores, claymores, 0, 0,
                "upcoming", "friendly", "Annual Highland games", null, "1:00 PM", "Central Winds Park", true),
        ], resolver);
        Assert.Equal((1, 0), (report.Matched, report.Differences));
        Assert.Contains(report.Lines, line => line.StartsWith("LOCKED 1 ", StringComparison.Ordinal));
    }

    [Fact]
    public void Compares_standings_rows_by_team()
    {
        var sanity = JsonSerializer.Deserialize<JsonElement>("""
            {"rows":[{"teamName":"Jacksonville (D3)","position":1,"played":2,"won":2,"lost":0,"drawn":0,"pointsFor":40,
              "pointsAgainst":10,"pointsDifference":30,"bonusPoints":1,"totalPoints":9}],"playoffs":[]}
            """);
        var ours = new[] { new RankedStandingsRow(1, new StandingsRow("Jacksonville", "", 2, 2, 0, 0, 40, 10, 30, 1, 10)) };
        var report = SanityComparison.CompareStandings("2025-2026", sanity, ours, [], RugbyFlPages.SeedResolver());
        Assert.Equal(1, report.Differences);
        Assert.Contains("totalPoints: sanity=9 postgres=10", report.Lines.Single());
    }
}
