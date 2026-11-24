using System.Text.Json;

/// <summary>Runs the scraper command-line tasks after migrations have been applied.</summary>
public static class ScraperCli
{
    /// <returns>The process exit code.</returns>
    public static async Task<int> RunAsync(ScraperCommand command, IServiceProvider services, CancellationToken ct)
    {
        var store = services.GetRequiredService<ScrapeStore>();
        switch (command.Name)
        {
            case "--scrape-fixtures":
            {
                var result = await services.GetRequiredService<ScrapeService>().ScrapeFixturesAsync(command.Fixtures!, "cli", ct);
                Console.WriteLine(JsonSerializer.Serialize(result, Indented));
                return result.Status == "failed" ? 1 : 0;
            }
            case "--scrape-standings":
            {
                var result = await services.GetRequiredService<ScrapeService>().ScrapeStandingsAsync(command.Standings!, "cli", ct);
                Console.WriteLine(JsonSerializer.Serialize(result, Indented));
                return result.Status == "failed" ? 1 : 0;
            }
            case "--import-reference-data":
            {
                var sanity = services.GetRequiredService<SanityData>();
                var teams = await store.ImportTeamsAsync(await sanity.TeamsAsync(ct), ct);
                Console.WriteLine($"Copied {teams} Sanity team profiles and their aliases.");
                var championship = await sanity.ChampionshipAsync(ct);
                if (championship.ValueKind == JsonValueKind.Object &&
                    Text(championship, "championshipId") is { } id && Text(championship, "seasonLabel") is { } season)
                {
                    var active = !championship.TryGetProperty("active", out var a) || a.ValueKind != JsonValueKind.False;
                    await store.SaveChampionshipConfigAsync(new ChampionshipConfig(active, id, season,
                        Text(championship, "divisionName")), ct);
                    Console.WriteLine($"Championship config set to {id} ({season}), active={active}.");
                }
                else
                    Console.WriteLine("Sanity has no complete leagueChampionship singleton; championship_config unchanged.");
                return 0;
            }
            case "--adopt-sanity-overrides":
            {
                // Reads Sanity only; writes scraper rows in Postgres. Never run automatically.
                var docs = await services.GetRequiredService<SanityData>().FixturesForAdoptionAsync(ct);
                var result = await SanityAdoption.RunAsync(store, docs, ct);
                Console.WriteLine($"Sanity hand edits: {result.Adopted} adopted (new rows), {result.Updated} updated, " +
                                  $"{result.Unchanged} unchanged, {result.UnresolvedNames.Count} unresolved names, " +
                                  $"{result.Skipped.Count} skipped.");
                foreach (var line in result.Lines)
                    Console.WriteLine("  " + line);
                foreach (var name in result.UnresolvedNames)
                    Console.WriteLine("  UNRESOLVED " + name);
                foreach (var reason in result.Skipped)
                    Console.WriteLine("  SKIPPED " + reason);
                return 0;
            }
            case "--compare-with-sanity":
            {
                var sanity = services.GetRequiredService<SanityData>();
                var resolver = await store.LoadResolverAsync(ct);
                var reports = new List<ComparisonReport>
                {
                    SanityComparison.CompareFixtures(await sanity.FixturesAsync(null, ct),
                        await store.ScrapedFixturesAsync(ct), resolver),
                };
                foreach (var (championshipId, seasonLabel) in await store.StandingsListAsync(ct))
                {
                    var stored = (await store.StandingsAsync(championshipId, ct))!.Value;
                    reports.Add(SanityComparison.CompareStandings(seasonLabel, await sanity.StandingsAsync(seasonLabel, ct),
                        stored.Rows, stored.Playoffs, resolver));
                }
                foreach (var report in reports)
                {
                    Console.WriteLine($"== {report.Subject}: {report.Matched} matching, {report.Differences} different");
                    foreach (var line in report.Lines)
                        Console.WriteLine("  " + line);
                }
                return 0;
            }
            default:
                throw new ArgumentException($"Unknown scraper command {command.Name}.");
        }
    }

    private static readonly JsonSerializerOptions Indented = new(JsonSerializerDefaults.Web) { WriteIndented = true };

    private static string? Text(JsonElement element, string property) =>
        element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
}
