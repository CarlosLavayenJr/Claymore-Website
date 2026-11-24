using System.Globalization;

/// <summary>Fetches rugbyfl.com pages. Separate from parsing so tests can serve saved HTML.</summary>
public interface IRugbyFlSource
{
    Task<string> ClubPageAsync(int clubId, int seasonId, CancellationToken ct);
    Task<string> GameDetailAsync(string path, CancellationToken ct);
    Task<string> ChampionshipPageAsync(string championshipId, CancellationToken ct);
}

public sealed class RugbyFlClient(HttpClient client) : IRugbyFlSource
{
    public const string BaseUrl = "https://rugbyfl.com";

    public static void Configure(HttpClient client)
    {
        client.BaseAddress = new Uri(BaseUrl);
        client.Timeout = TimeSpan.FromSeconds(30);
        client.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (compatible; ClaymoresScraper/1.0)");
    }

    public static string ClubUrl(int clubId, int seasonId) =>
        $"{BaseUrl}/Clubs/Club.asp?Club_ID={clubId}&Season_ID={seasonId}";

    public static string ChampionshipUrl(string championshipId) =>
        $"{BaseUrl}/Season/Championships/Championship_Print.asp?Championship_ID={Uri.EscapeDataString(championshipId)}";

    public Task<string> ClubPageAsync(int clubId, int seasonId, CancellationToken ct) =>
        client.GetStringAsync(ClubUrl(clubId, seasonId), ct);

    public Task<string> GameDetailAsync(string path, CancellationToken ct)
    {
        // Only follow links on rugbyfl.com itself.
        var uri = new Uri(new Uri(BaseUrl), path);
        if (!uri.Host.EndsWith("rugbyfl.com", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException($"Refusing to fetch {uri}.");
        return client.GetStringAsync(uri, ct);
    }

    public Task<string> ChampionshipPageAsync(string championshipId, CancellationToken ct) =>
        client.GetStringAsync(ChampionshipUrl(championshipId), ct);
}

public sealed record FixtureScrapeRequest(IReadOnlyList<int> ClubIds, IReadOnlyList<int> SeasonIds, bool FetchVenues)
{
    public const int ClaymoresClubId = 117;
    public const int LegacyClubId = 51; // IR/Claymores, the joined club in older seasons
    public const int FirstSeasonId = 10;
    public const int DefaultSeasonId = 28; // 2026-2027

    /// <summary>Matches the Vercel route: one season of club 117, or seasons 10-28 of clubs 117 and 51.</summary>
    public static FixtureScrapeRequest For(bool all, int? seasonId, int defaultSeasonId = DefaultSeasonId) => all
        ? new([ClaymoresClubId, LegacyClubId],
            Enumerable.Range(FirstSeasonId, Math.Max(defaultSeasonId, seasonId ?? 0) - FirstSeasonId + 1).ToArray(), false)
        : new([ClaymoresClubId], [seasonId ?? defaultSeasonId], true);
}

public sealed record PageSummary(int ClubId, int SeasonId, int Parsed, int Inserted, int Updated, int Unchanged,
    int SkippedManualOverride, string? Error);

public sealed record FixtureScrapeResult(string Status, IReadOnlyList<PageSummary> Pages, IReadOnlyList<string> NewTeamsNeedingReview)
{
    public int TotalParsed => Pages.Sum(page => page.Parsed);
}

public sealed record StandingsScrapeRequest(bool Force, string? ChampionshipId, string? SeasonLabel, string? DivisionName);

public sealed record StandingsScrapeResult(string Status, string? ChampionshipId, string? SeasonLabel, int RowCount,
    int PlayoffCount, string? Source, string? Url, string? Detail);

/// <summary>Runs a scrape end to end: fetch, parse, resolve teams, write, and log to scrape_runs.</summary>
public sealed class ScrapeService(IRugbyFlSource source, ScrapeStore store, ILogger<ScrapeService> logger)
{
    public async Task<FixtureScrapeResult> ScrapeFixturesAsync(FixtureScrapeRequest request, string trigger, CancellationToken ct)
    {
        var runId = await store.StartRunAsync("fixtures", trigger, request, ct);
        var pages = new List<PageSummary>();
        var newTeams = new List<string>();
        try
        {
            var resolver = await store.LoadResolverAsync(ct);
            var scrapedAt = DateTimeOffset.UtcNow;
            foreach (var clubId in request.ClubIds)
            foreach (var seasonId in request.SeasonIds)
            {
                try
                {
                    var html = await source.ClubPageAsync(clubId, seasonId, ct);
                    var fixtures = RugbyFlParser.ParseClubFixtures(html).Where(f => f.InvolvesClaymores).ToArray();
                    var upserts = new List<FixtureUpsert>();
                    foreach (var fixture in fixtures)
                    {
                        var (home, homeCreated) = await store.ResolveOrCreateAsync(resolver, fixture.HomeTeamRaw, ct);
                        var (away, awayCreated) = await store.ResolveOrCreateAsync(resolver, fixture.AwayTeamRaw, ct);
                        if (homeCreated) newTeams.Add(home.Name);
                        if (awayCreated) newTeams.Add(away.Name);
                        var venue = request.FetchVenues && fixture.GameDetailPath is { } path
                            ? await TryVenueAsync(path, ct)
                            : null;
                        upserts.Add(new FixtureUpsert(fixture, home, away, clubId, seasonId, venue));
                    }
                    var counts = await store.UpsertFixturesAsync(upserts, scrapedAt, ct);
                    pages.Add(new PageSummary(clubId, seasonId, fixtures.Length, counts.Inserted, counts.Updated,
                        counts.Unchanged, counts.SkippedManualOverride, null));
                    logger.LogInformation("Scraped club {ClubId} season {SeasonId}: {Parsed} games, {Counts}",
                        clubId, seasonId, fixtures.Length, counts);
                }
                catch (Exception error) when (error is HttpRequestException or TaskCanceledException && !ct.IsCancellationRequested)
                {
                    logger.LogWarning(error, "Fetching club {ClubId} season {SeasonId} failed", clubId, seasonId);
                    pages.Add(new PageSummary(clubId, seasonId, 0, 0, 0, 0, 0, error.Message));
                }
            }

            var status = pages.All(page => page.Error is null) ? "success"
                : pages.Any(page => page.Error is null) ? "partial" : "failed";
            var result = new FixtureScrapeResult(status, pages, newTeams.Distinct().ToArray());
            await store.FinishRunAsync(runId, status, result, null, ct);
            return result;
        }
        catch (Exception error)
        {
            await store.FinishRunAsync(runId, "failed", new { pages }, error.Message, CancellationToken.None);
            throw;
        }
    }

    private async Task<string?> TryVenueAsync(string path, CancellationToken ct)
    {
        try
        {
            return RugbyFlParser.ParseGameVenue(await source.GameDetailAsync(path, ct));
        }
        catch (Exception error) when (error is HttpRequestException or TaskCanceledException or InvalidOperationException
                                      && !ct.IsCancellationRequested)
        {
            logger.LogWarning(error, "Could not read the venue from {Path}", path);
            return null;
        }
    }

    public async Task<StandingsScrapeResult> ScrapeStandingsAsync(StandingsScrapeRequest request, string trigger, CancellationToken ct)
    {
        var runId = await store.StartRunAsync("standings", trigger, request, ct);
        var result = await ScrapeStandingsCoreAsync(request, ct);
        await store.FinishRunAsync(runId, result.Status, result, result.Status == "failed" ? result.Detail : null, ct);
        return result;
    }

    private async Task<StandingsScrapeResult> ScrapeStandingsCoreAsync(StandingsScrapeRequest request, CancellationToken ct)
    {
        string championshipId, seasonLabel;
        string? divisionName;
        var overridden = request.ChampionshipId is not null && request.SeasonLabel is not null;
        if (overridden)
        {
            (championshipId, seasonLabel, divisionName) = (request.ChampionshipId!, request.SeasonLabel!, request.DivisionName);
        }
        else
        {
            var config = await store.ChampionshipConfigAsync(ct);
            if (config is null)
                return Failed(null, null, null, "No championship_config row. Run --import-reference-data or insert one.");
            if (!request.Force && !config.Active)
                return new("skipped", config.ChampionshipId, config.SeasonLabel, 0, 0, null, null, "championship_config.active is false");
            (championshipId, seasonLabel, divisionName) = (config.ChampionshipId, config.SeasonLabel, config.DivisionName);
        }

        var url = RugbyFlClient.ChampionshipUrl(championshipId);
        string html;
        try
        {
            html = await source.ChampionshipPageAsync(championshipId, ct);
        }
        catch (Exception error) when (error is HttpRequestException or TaskCanceledException && !ct.IsCancellationRequested)
        {
            var detail = error is HttpRequestException { StatusCode: { } code }
                ? $"HTTP {(int)code}"
                : $"fetch error: {error.Message}";
            await StampAsync(overridden, detail, ct);
            return Failed(championshipId, seasonLabel, url, detail);
        }

        var parsed = RugbyFlParser.ParseChampionship(html);
        if (parsed is null)
        {
            const string detail = "parsed 0 rows — page structure may have changed";
            await StampAsync(overridden, detail, ct);
            return Failed(championshipId, seasonLabel, url, detail);
        }

        try
        {
            var resolver = await store.LoadResolverAsync(ct);
            await store.ReplaceStandingsAsync(championshipId, seasonLabel, divisionName, url, parsed, resolver, ct);
        }
        catch (Exception error) when (error is Npgsql.NpgsqlException)
        {
            await StampAsync(overridden, $"write error: {error.Message}", ct);
            return Failed(championshipId, seasonLabel, url, $"write error: {error.Message}");
        }

        var sourceName = parsed.Source == StandingsSource.StandingsTable ? "standings-table" : "computed-from-schedule";
        await StampAsync(overridden, parsed.Source == StandingsSource.ComputedFromSchedule
            ? "success (computed from schedule)" : "success", ct);
        return new("success", championshipId, seasonLabel, parsed.Rows.Count, parsed.Playoffs.Count, sourceName, url, null);
    }

    // Like the website route, a manual backfill (explicit championship) does not stamp the config row.
    private Task StampAsync(bool overridden, string status, CancellationToken ct) =>
        overridden ? Task.CompletedTask : store.StampChampionshipAsync(status, ct);

    private static StandingsScrapeResult Failed(string? id, string? season, string? url, string detail) =>
        new("failed", id, season, 0, 0, null, url, detail);
}

/// <summary>Parses the scraper's command-line switches.</summary>
public sealed record ScraperCommand(string Name, FixtureScrapeRequest? Fixtures, StandingsScrapeRequest? Standings)
{
    public static readonly string[] Names =
        ["--scrape-fixtures", "--scrape-standings", "--compare-with-sanity", "--import-reference-data"];

    public static bool IsScraperCommand(string[] args) => args.Length > 0 && Names.Contains(args[0]);

    public static ScraperCommand Parse(string[] args, int defaultSeasonId = FixtureScrapeRequest.DefaultSeasonId)
    {
        if (!IsScraperCommand(args)) throw new ArgumentException("Not a scraper command.");
        string? Value(string name)
        {
            var index = Array.IndexOf(args, name);
            if (index < 0) return null;
            if (index + 1 >= args.Length || args[index + 1].StartsWith("--", StringComparison.Ordinal))
                throw new ArgumentException($"{name} needs a value.");
            return args[index + 1];
        }
        bool Flag(string name) => args.Contains(name);

        var allowed = args[0] switch
        {
            "--scrape-fixtures" => new[] { "--season-id", "--all" },
            "--scrape-standings" => ["--force", "--championship-id", "--season-label", "--division-name"],
            _ => [],
        };
        var unknown = args.Skip(1).Where(arg => arg.StartsWith("--", StringComparison.Ordinal) && !allowed.Contains(arg)).ToArray();
        if (unknown.Length > 0) throw new ArgumentException($"Unknown option {unknown[0]} for {args[0]}.");

        switch (args[0])
        {
            case "--scrape-fixtures":
                int? seasonId = null;
                if (Value("--season-id") is { } text)
                {
                    if (!int.TryParse(text, NumberStyles.None, CultureInfo.InvariantCulture, out var parsed) || parsed < 1)
                        throw new ArgumentException("--season-id must be a positive integer.");
                    seasonId = parsed;
                }
                return new(args[0], FixtureScrapeRequest.For(Flag("--all"), seasonId, defaultSeasonId), null);
            case "--scrape-standings":
                var request = new StandingsScrapeRequest(Flag("--force"), Value("--championship-id"),
                    Value("--season-label"), Value("--division-name"));
                ValidateStandings(request);
                return new(args[0], null, request);
            default:
                return new(args[0], null, null);
        }
    }

    public static void ValidateStandings(StandingsScrapeRequest request)
    {
        if ((request.ChampionshipId is null) != (request.SeasonLabel is null))
            throw new ArgumentException("Pass both a championship ID and a season label, or neither.");
        if (request.ChampionshipId is { } id && !id.All(char.IsAsciiDigit))
            throw new ArgumentException("The championship ID must be numeric.");
        if (request.SeasonLabel is { } label &&
            !System.Text.RegularExpressions.Regex.IsMatch(label, @"\A[0-9]{4}-[0-9]{4}\z"))
            throw new ArgumentException("The season label must use YYYY-YYYY.");
    }
}
