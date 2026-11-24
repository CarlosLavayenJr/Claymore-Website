using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

/// <summary>A Sanity match document that was edited or created by hand, in the shape the scraper table stores.</summary>
public sealed record AdoptionCandidate(
    string SanityId, DateOnly Date, int Season, string HomeTeam, string AwayTeam, int? HomeScore, int? AwayScore,
    string Status, string? MatchType, string? Competition, string? Note, TimeOnly? Kickoff, string? Venue,
    bool Hidden = false);

public sealed record AdoptionItem(AdoptionCandidate Candidate, TeamRef Home, TeamRef Away);

public enum AdoptionOutcome { Adopted, Updated, Unchanged, Released }

public sealed record AdoptionResult(
    int Adopted, int Updated, int Unchanged, IReadOnlyList<string> UnresolvedNames, IReadOnlyList<string> Skipped,
    IReadOnlyList<string> Lines, int Released = 0);

/// <summary>
/// Carries Sanity's hand edits over to the scraper rows before cutover (--adopt-sanity-overrides).
/// A document is a hand edit when <c>manualOverride</c> is true or its <c>_id</c> was not written by
/// the website scraper (which always uses a <c>scraped-</c> prefix). Each one becomes, or overwrites,
/// the scraper row with the same (date, home team, away team) and locks it with manual_override.
/// A document with <c>hidden</c> checked is a hand edit too: its row is locked and retired, so it
/// disappears from the API and later scrapes can't bring it back. A row adopted earlier whose
/// document is no longer a hand edit (both boxes unticked) is released back to the scraper.
/// Runs hourly (render.yaml) and by hand with --adopt-sanity-overrides.
/// </summary>
public static partial class SanityAdoption
{
    private static readonly HashSet<string> Statuses = new(StringComparer.Ordinal)
        { "played", "upcoming", "cancelled", "forfeit_us", "forfeit_them" };
    private static readonly HashSet<string> MatchTypes = new(StringComparer.Ordinal) { "league", "friendly" };

    public static bool IsHandEdit(JsonElement doc) =>
        (doc.TryGetProperty("manualOverride", out var flag) && flag.ValueKind == JsonValueKind.True) ||
        IsHidden(doc) ||
        (Text(doc, "id") is { } id && !id.StartsWith("scraped-", StringComparison.Ordinal));

    public static bool IsHidden(JsonElement doc) =>
        doc.TryGetProperty("hidden", out var hidden) && hidden.ValueKind == JsonValueKind.True;

    /// <summary>Reads a Sanity match document. Returns null and a reason when it cannot be stored.</summary>
    public static AdoptionCandidate? Parse(JsonElement doc, out string? problem)
    {
        problem = null;
        var id = Text(doc, "id") ?? "(no _id)";
        if (Text(doc, "date") is not { } dateText ||
            !DateOnly.TryParseExact(dateText, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
        {
            problem = $"{id}: missing or invalid date";
            return null;
        }
        if (Text(doc, "homeTeam") is not { } home || Text(doc, "awayTeam") is not { } away)
        {
            problem = $"{id}: missing team name";
            return null;
        }
        var status = Text(doc, "status") ?? FixtureStatus.Upcoming;
        if (!Statuses.Contains(status))
        {
            problem = $"{id}: unknown status \"{status}\"";
            return null;
        }
        var matchType = Text(doc, "matchType");
        if (matchType is not null && !MatchTypes.Contains(matchType))
        {
            problem = $"{id}: unknown matchType \"{matchType}\"";
            return null;
        }
        TimeOnly? kickoff = null;
        if (Text(doc, "kickoffTime") is { } kickoffText)
        {
            kickoff = ParseKickoff(kickoffText);
            if (kickoff is null)
            {
                problem = $"{id}: unreadable kickoffTime \"{kickoffText}\"";
                return null;
            }
        }
        var season = Number(doc, "season") ?? RugbyFlParser.SeasonFor(date);
        return new AdoptionCandidate(id, date, season, home, away, Number(doc, "homeScore"), Number(doc, "awayScore"),
            status, matchType, Text(doc, "competition"), Text(doc, "note"), kickoff, Text(doc, "venue"), IsHidden(doc));
    }

    /// <summary>"1:00 PM", "1:00pm", "1pm", "13:00" and "1:00 p.m." all read as 13:00.</summary>
    public static TimeOnly? ParseKickoff(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        var match = KickoffText().Match(text.Trim());
        if (!match.Success) return null;
        var hour = int.Parse(match.Groups["h"].Value, CultureInfo.InvariantCulture);
        var minute = match.Groups["m"].Success ? int.Parse(match.Groups["m"].Value, CultureInfo.InvariantCulture) : 0;
        if (match.Groups["ampm"].Success)
        {
            if (hour is < 1 or > 12) return null;
            var pm = char.ToLowerInvariant(match.Groups["ampm"].Value[0]) == 'p';
            hour = hour % 12 + (pm ? 12 : 0);
        }
        else if (!match.Groups["m"].Success)
            return null; // a bare "13" is too ambiguous
        return hour is >= 0 and < 24 && minute is >= 0 and < 60 ? new TimeOnly(hour, minute) : null;
    }

    /// <summary>The kickoff as GET /v1/fixtures prints it for scraper rows ("1:00 PM").</summary>
    public static string FormatKickoff(TimeOnly time) => time.ToString("h:mm tt", CultureInfo.InvariantCulture);

    public static async Task<AdoptionResult> RunAsync(ScrapeStore store, IEnumerable<JsonElement> sanityFixtures, CancellationToken ct)
    {
        var docs = sanityFixtures as IReadOnlyCollection<JsonElement> ?? sanityFixtures.ToArray();
        // An empty answer from Sanity is an outage or a wrong dataset, never "every edit was undone".
        if (docs.Count == 0) throw new InvalidOperationException("Sanity returned no match documents; nothing synced.");
        var resolver = await store.LoadResolverAsync(ct);
        var unresolved = new List<string>();
        var skipped = new List<string>();
        var lines = new List<string>();
        var items = new List<AdoptionItem>();
        foreach (var doc in docs.Where(IsHandEdit))
        {
            if (Parse(doc, out var problem) is not { } candidate)
            {
                skipped.Add(problem!);
                continue;
            }
            var (home, homeCreated) = await store.ResolveOrCreateAsync(resolver, candidate.HomeTeam, ct);
            var (away, awayCreated) = await store.ResolveOrCreateAsync(resolver, candidate.AwayTeam, ct);
            if (homeCreated) unresolved.Add($"{candidate.HomeTeam} (created team \"{home.Name}\", needs review)");
            if (awayCreated) unresolved.Add($"{candidate.AwayTeam} (created team \"{away.Name}\", needs review)");
            items.Add(new AdoptionItem(candidate, home, away));
        }

        var duplicates = items.GroupBy(item => (item.Candidate.Date, item.Home.Id, item.Away.Id)).Where(g => g.Count() > 1);
        foreach (var group in duplicates)
            skipped.Add($"{string.Join(", ", group.Select(item => item.Candidate.SanityId))}: same date and teams; " +
                        $"only {group.Last().Candidate.SanityId} is kept");
        var distinct = items.GroupBy(item => (item.Candidate.Date, item.Home.Id, item.Away.Id)).Select(g => g.Last()).ToArray();

        var outcomes = await store.AdoptFixturesAsync(distinct, ct);
        foreach (var (item, outcome) in distinct.Zip(outcomes))
            lines.Add($"{outcome.ToString().ToUpperInvariant(),-9} {item.Candidate.Date:yyyy-MM-dd} {item.Candidate.HomeTeam} v " +
                      $"{item.Candidate.AwayTeam} ({item.Candidate.SanityId}, {(item.Candidate.Hidden ? "hidden" : item.Candidate.Status)}" +
                      $"{(item.Candidate.Competition is { } c ? ", " + c : "")})");

        // Documents that still exist but are no longer hand edits: hand their rows back to the scraper.
        // Rows whose document is gone are left alone (a deletion is not an instruction).
        var released = await store.ReleaseFixturesAsync(
            docs.Where(doc => !IsHandEdit(doc)).Select(doc => Text(doc, "id")).OfType<string>().ToArray(), ct);
        foreach (var line in released)
            lines.Add($"{"RELEASED",-9} {line}");
        return new AdoptionResult(outcomes.Count(o => o == AdoptionOutcome.Adopted), outcomes.Count(o => o == AdoptionOutcome.Updated),
            outcomes.Count(o => o == AdoptionOutcome.Unchanged), unresolved.Distinct().ToArray(), skipped, lines, released.Count);
    }

    private static string? Text(JsonElement element, string property) =>
        element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String &&
        value.GetString() is { } text && !string.IsNullOrWhiteSpace(text) ? TeamNameResolver.Clean(text) : null;

    private static int? Number(JsonElement element, string property) =>
        element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var n)
            ? n : null;

    [GeneratedRegex(@"^(?<h>\d{1,2})(?::(?<m>\d{2}))?\s*(?:(?<ampm>[ap])\.?\s*m\.?)?$", RegexOptions.IgnoreCase)]
    private static partial Regex KickoffText();
}
