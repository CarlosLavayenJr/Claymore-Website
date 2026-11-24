using System.Globalization;
using System.Text.Json;

public sealed record ComparisonReport(string Subject, int Matched, int Differences, IReadOnlyList<string> Lines);

/// <summary>
/// Shadow-mode check for cutover: compares Postgres scraper data with what Sanity serves today.
/// Games are matched on (date, home team, away team) after name resolution.
/// </summary>
public static class SanityComparison
{
    private static readonly string[] FixtureFields =
        ["status", "homeScore", "awayScore", "matchType", "competition", "note", "kickoffTime", "venue"];

    // The website scraper never captured these, so Postgres filling a blank Sanity value is expected.
    private static readonly string[] EnrichedFields = ["kickoffTime", "venue"];

    public static ComparisonReport CompareFixtures(IEnumerable<JsonElement> sanityFixtures, IEnumerable<StoredFixture> scraped,
        TeamNameResolver resolver)
    {
        var lines = new List<string>();
        string Key(string date, string home, string away) => $"{date} {TeamKey(resolver, home)} v {TeamKey(resolver, away)}";

        var sanity = sanityFixtures
            .Where(f => Text(f, "date") is not null && Text(f, "homeTeam") is not null && Text(f, "awayTeam") is not null)
            .GroupBy(f => Key(Text(f, "date")!, Text(f, "homeTeam")!, Text(f, "awayTeam")!))
            .ToDictionary(group => group.Key, group => group.ToArray());
        var postgres = scraped
            .GroupBy(f => $"{f.Date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)} #{f.HomeTeamId} v #{f.AwayTeamId}")
            .ToDictionary(group => group.Key, group => group.First());

        foreach (var (key, docs) in sanity.Where(pair => pair.Value.Length > 1))
            lines.Add($"DUPLICATE in Sanity {key}: {string.Join(", ", docs.Select(d => Text(d, "id")))}");

        int matched = 0, differences = 0, enriched = 0;
        foreach (var key in sanity.Keys.Union(postgres.Keys).Order(StringComparer.Ordinal))
        {
            var inSanity = sanity.TryGetValue(key, out var docs);
            var inPostgres = postgres.TryGetValue(key, out var row);
            if (inSanity && !inPostgres)
            {
                differences++;
                lines.Add($"ONLY IN SANITY  {key} ({Text(docs![0], "id")}: {Text(docs[0], "homeTeam")} v {Text(docs[0], "awayTeam")})");
                continue;
            }
            if (!inSanity)
            {
                differences++;
                lines.Add($"ONLY IN POSTGRES {key} ({row!.Id}: {row.HomeTeam} v {row.AwayTeam})");
                continue;
            }

            var doc = docs![0];
            var ours = new Dictionary<string, string?>
            {
                ["status"] = row!.Status,
                ["homeScore"] = row.HomeScore?.ToString(CultureInfo.InvariantCulture),
                ["awayScore"] = row.AwayScore?.ToString(CultureInfo.InvariantCulture),
                ["matchType"] = row.MatchType,
                ["competition"] = row.Competition,
                ["note"] = row.Note,
                ["kickoffTime"] = row.KickoffTime,
                ["venue"] = row.Venue,
            };
            var changed = FixtureFields
                .Select(field => (field, theirs: Normalize(Text(doc, field)), ours: Normalize(ours[field])))
                .Where(item => !string.Equals(item.theirs, item.ours, StringComparison.Ordinal))
                .ToArray();
            if (changed.Any(item => item.theirs is null && EnrichedFields.Contains(item.field)))
                enriched++;
            var fieldDiffs = changed
                .Where(item => !(item.theirs is null && EnrichedFields.Contains(item.field)))
                .Select(item => $"{item.field}: sanity={Show(item.theirs)} postgres={Show(item.ours)}")
                .ToArray();
            if (fieldDiffs.Length == 0)
            {
                matched++;
                continue;
            }
            differences++;
            lines.Add($"DIFFERENT {key} ({Text(doc, "id")} / {row.Id}{(row.ManualOverride ? ", manual override" : "")}): " +
                      string.Join("; ", fieldDiffs));
        }
        if (enriched > 0)
            lines.Add($"ENRICHED {enriched} games have a kickoff time or venue that Sanity leaves blank (not counted as differences).");
        return new ComparisonReport("fixtures", matched, differences, lines);
    }

    public static ComparisonReport CompareStandings(string seasonLabel, JsonElement sanityStandings,
        IReadOnlyList<RankedStandingsRow> rows, IReadOnlyList<PlayoffEntry> playoffs, TeamNameResolver resolver)
    {
        var subject = $"standings {seasonLabel}";
        if (sanityStandings.ValueKind != JsonValueKind.Object)
            return new ComparisonReport(subject, 0, 1, [$"Sanity has no leagueStandings for {seasonLabel}."]);

        var lines = new List<string>();
        var sanityRows = sanityStandings.TryGetProperty("rows", out var r) && r.ValueKind == JsonValueKind.Array
            ? r.EnumerateArray().ToArray() : [];
        var theirs = sanityRows.Where(row => Text(row, "teamName") is not null)
            .GroupBy(row => TeamKey(resolver, Text(row, "teamName")!)).ToDictionary(g => g.Key, g => g.First());
        var ours = rows.GroupBy(row => TeamKey(resolver, row.Row.TeamName)).ToDictionary(g => g.Key, g => g.First());

        int matched = 0, differences = 0;
        foreach (var key in theirs.Keys.Union(ours.Keys).Order(StringComparer.Ordinal))
        {
            if (!ours.TryGetValue(key, out var mine))
            {
                differences++;
                lines.Add($"ONLY IN SANITY  {Text(theirs[key], "teamName")}");
                continue;
            }
            if (!theirs.TryGetValue(key, out var sanityRow))
            {
                differences++;
                lines.Add($"ONLY IN POSTGRES {mine.Row.TeamName}");
                continue;
            }
            var values = new (string Field, int Ours)[]
            {
                ("position", mine.Position), ("played", mine.Row.Played), ("won", mine.Row.Won), ("lost", mine.Row.Lost),
                ("drawn", mine.Row.Drawn), ("pointsFor", mine.Row.PointsFor), ("pointsAgainst", mine.Row.PointsAgainst),
                ("pointsDifference", mine.Row.PointsDifference), ("bonusPoints", mine.Row.BonusPoints),
                ("totalPoints", mine.Row.TotalPoints),
            };
            var diffs = values.Where(v => Number(sanityRow, v.Field) != v.Ours)
                .Select(v => $"{v.Field}: sanity={Number(sanityRow, v.Field)?.ToString(CultureInfo.InvariantCulture) ?? "null"} postgres={v.Ours}")
                .ToArray();
            if (diffs.Length == 0) { matched++; continue; }
            differences++;
            lines.Add($"DIFFERENT {mine.Row.TeamName}: {string.Join("; ", diffs)}");
        }

        var sanityPlayoffs = sanityStandings.TryGetProperty("playoffs", out var p) && p.ValueKind == JsonValueKind.Array
            ? p.EnumerateArray().Select(e => $"{Text(e, "round")} {Text(e, "date")} {Text(e, "homeTeam")} {Number(e, "homeScore")}-{Number(e, "awayScore")} {Text(e, "awayTeam")}").ToArray()
            : [];
        var ourPlayoffs = playoffs.Select(e => $"{e.Round} {e.Date} {e.HomeTeam} {e.HomeScore}-{e.AwayScore} {e.AwayTeam}").ToArray();
        if (!sanityPlayoffs.SequenceEqual(ourPlayoffs))
        {
            differences++;
            lines.Add($"PLAYOFFS differ: sanity=[{string.Join(" | ", sanityPlayoffs)}] postgres=[{string.Join(" | ", ourPlayoffs)}]");
        }
        return new ComparisonReport(subject, matched, differences, lines);
    }

    private static string TeamKey(TeamNameResolver resolver, string name) =>
        resolver.Resolve(name) is { } match ? $"#{match.TeamId}" : "?" + TeamNameResolver.Normalize(name);

    private static string? Normalize(string? value) => string.IsNullOrWhiteSpace(value) ? null : TeamNameResolver.Clean(value);
    private static string Show(string? value) => value is null ? "null" : $"\"{value}\"";

    private static string? Text(JsonElement element, string property) =>
        element.ValueKind == JsonValueKind.Object && element.TryGetProperty(property, out var value)
            ? value.ValueKind switch
            {
                JsonValueKind.String => value.GetString(),
                JsonValueKind.Number => value.GetRawText(),
                JsonValueKind.True => "true",
                JsonValueKind.False => "false",
                _ => null,
            }
            : null;

    private static int? Number(JsonElement element, string property) =>
        element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var n)
            ? n : null;
}
