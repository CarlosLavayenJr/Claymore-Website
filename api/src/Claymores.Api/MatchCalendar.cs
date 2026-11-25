using System.Globalization;
using System.Text;
using System.Text.Json;

/// <summary>
/// GET /v1/calendar.ics: every Claymores fixture as a subscribable calendar (iCalendar). Phones
/// re-fetch it a few times a day, so changed kickoffs and venues show up on their own. Matches
/// with a kickoff time are two-hour events at that time in Orlando; others are all-day events.
/// Played matches carry the score in their title.
/// </summary>
internal static class MatchCalendar
{
    private static readonly TimeZoneInfo Orlando = TimeZoneInfo.FindSystemTimeZoneById("America/New_York");
    private const string Site = "https://www.claymoresrfc.com";

    public static void Map(WebApplication app) =>
        app.MapGet("/v1/calendar.ics", async (FixtureDatabase fixtures, CancellationToken ct) =>
                Results.Text(Build(await fixtures.ListAsync(null, ct), DateTimeOffset.UtcNow), "text/calendar; charset=utf-8"))
            .WithTags("Fixtures").AllowAnonymous()
            .WithSummary("All Claymores fixtures as a calendar to subscribe to (webcal://…/v1/calendar.ics)")
            .Produces(200, contentType: "text/calendar");

    internal static string Build(IEnumerable<JsonElement> payloads, DateTimeOffset now)
    {
        var ics = new StringBuilder();
        void Line(string text) => Fold(ics, text);
        Line("BEGIN:VCALENDAR");
        Line("VERSION:2.0");
        Line("PRODID:-//Central Florida Claymores RFC//Fixtures//EN");
        Line("CALSCALE:GREGORIAN");
        Line("METHOD:PUBLISH");
        Line("X-WR-CALNAME:Claymores RFC fixtures");
        Line("X-WR-CALDESC:Central Florida Claymores RFC matches, Orlando rugby");
        Line("X-WR-TIMEZONE:America/New_York");
        Line("REFRESH-INTERVAL;VALUE=DURATION:PT6H");
        Line("X-PUBLISHED-TTL:PT6H");
        var stamp = now.UtcDateTime.ToString("yyyyMMdd'T'HHmmss'Z'", CultureInfo.InvariantCulture);

        foreach (var payload in payloads)
        {
            if (Text(payload, "id") is not { } id || Text(payload, "date") is not { } dateText ||
                !DateOnly.TryParse(dateText, CultureInfo.InvariantCulture, out var date))
                continue;
            var status = Text(payload, "status") ?? "";
            if (status.Contains("cancel", StringComparison.OrdinalIgnoreCase)) continue;
            var home = Text(payload, "homeTeam") ?? "TBA";
            var away = Text(payload, "awayTeam") ?? "TBA";
            var summary = $"{Short(home)} vs {Short(away)}";
            if (Score(payload, "homeScore") is int h && Score(payload, "awayScore") is int a)
                summary += $" ({h}–{a})";

            Line("BEGIN:VEVENT");
            Line($"UID:{Escape(id)}@claymoresrfc.com");
            Line($"DTSTAMP:{stamp}");
            if (Kickoff(Text(payload, "kickoffTime") ?? Text(payload, "kickoff")) is TimeOnly kickoff)
            {
                var local = date.ToDateTime(kickoff);
                var start = TimeZoneInfo.ConvertTimeToUtc(local, Orlando);
                Line($"DTSTART:{start:yyyyMMdd'T'HHmmss'Z'}");
                Line($"DTEND:{start.AddHours(2):yyyyMMdd'T'HHmmss'Z'}");
            }
            else
            {
                Line($"DTSTART;VALUE=DATE:{date:yyyyMMdd}");
                Line($"DTEND;VALUE=DATE:{date.AddDays(1):yyyyMMdd}");
            }
            Line($"SUMMARY:{Escape(summary)}");
            if (Text(payload, "venue") is { Length: > 0 } venue) Line($"LOCATION:{Escape(venue)}");
            var description = new List<string>();
            if (Text(payload, "competition") is { Length: > 0 } competition) description.Add(competition);
            if (Text(payload, "note") is { Length: > 0 } note) description.Add(note);
            description.Add($"{Site}/fixtures");
            Line($"DESCRIPTION:{Escape(string.Join("\n", description))}");
            Line($"URL:{Site}/fixtures");
            Line("END:VEVENT");
        }
        Line("END:VCALENDAR");
        return ics.ToString();
    }

    /// <summary>"Central Florida Claymores" reads as "Claymores" in a calendar title.</summary>
    private static string Short(string team) =>
        team.Contains("Claymores", StringComparison.OrdinalIgnoreCase) ? "Claymores" : team;

    internal static TimeOnly? Kickoff(string? text) =>
        !string.IsNullOrWhiteSpace(text) && TimeOnly.TryParse(text.Trim(), CultureInfo.GetCultureInfo("en-US"), out var t) ? t : null;

    private static string? Text(JsonElement payload, string name) =>
        payload.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;

    private static int? Score(JsonElement payload, string name) =>
        payload.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var n) ? n : null;

    /// <summary>RFC 5545 text escaping.</summary>
    internal static string Escape(string text) => text
        .Replace("\\", "\\\\").Replace(";", "\\;").Replace(",", "\\,").Replace("\r\n", "\\n").Replace("\n", "\\n");

    /// <summary>Lines longer than 75 octets continue on the next line after a space (RFC 5545 §3.1).</summary>
    private static void Fold(StringBuilder ics, string line)
    {
        var bytes = 0;
        var start = 0;
        for (var i = 0; i < line.Length; i++)
        {
            var size = Encoding.UTF8.GetByteCount(line.AsSpan(i, char.IsHighSurrogate(line[i]) ? 2 : 1));
            if (bytes + size > (start == 0 ? 75 : 74))
            {
                ics.Append(line, start, i - start).Append("\r\n ");
                start = i;
                bytes = 0;
            }
            bytes += size;
            if (char.IsHighSurrogate(line[i])) i++;
        }
        ics.Append(line, start, line.Length - start).Append("\r\n");
    }
}
