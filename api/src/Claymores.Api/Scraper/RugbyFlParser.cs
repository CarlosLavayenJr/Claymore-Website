using System.Globalization;
using System.Text.RegularExpressions;
using AngleSharp.Dom;
using AngleSharp.Html.Dom;
using AngleSharp.Html.Parser;

public static class FixtureStatus
{
    public const string Played = "played";
    public const string Upcoming = "upcoming";
    public const string ForfeitUs = "forfeit_us";
    public const string ForfeitThem = "forfeit_them";
}

/// <summary>One game from a rugbyfl.com club page. Home is the first team in the HTML.</summary>
public sealed record ScrapedFixture(
    DateOnly Date,
    int Season,
    string HomeTeamRaw,
    string AwayTeamRaw,
    int HomeScore,
    int AwayScore,
    string Status,
    string MatchType,
    string? Competition,
    string? Note,
    TimeOnly? Kickoff,
    int? GameId,
    string? GameDetailPath)
{
    /// <summary>"Claymores" for our side, the raw rugbyfl.com name for the opponent.</summary>
    public string HomeTeam => TeamNameResolver.DisplayName(HomeTeamRaw);
    public string AwayTeam => TeamNameResolver.DisplayName(AwayTeamRaw);
    public bool InvolvesClaymores => TeamNameResolver.IsClaymores(HomeTeamRaw) || TeamNameResolver.IsClaymores(AwayTeamRaw);
}

public sealed record StandingsRow(
    string TeamName, string Pool, int Played, int Won, int Lost, int Drawn,
    int PointsFor, int PointsAgainst, int PointsDifference, int BonusPoints, int TotalPoints);

public sealed record RankedStandingsRow(int Position, StandingsRow Row);

public sealed record ScheduleMatch(
    string Date, string HomeName, string AwayName, int? HomeScore, int? AwayScore,
    int HomeTries, int AwayTries, string Note);

public sealed record PlayoffEntry(
    string Round, string Label, string Date, string HomeTeam, string AwayTeam, int? HomeScore, int? AwayScore);

public enum StandingsSource { StandingsTable, ComputedFromSchedule }

public sealed record ParsedChampionship(
    IReadOnlyList<RankedStandingsRow> Rows, IReadOnlyList<PlayoffEntry> Playoffs, StandingsSource Source);

/// <summary>
/// Pure HTML parsing and the scoring rules ported from the website's
/// <c>app/api/scrape-rugby</c> and <c>app/api/scrape-standings</c> routes. No I/O.
/// </summary>
public static partial class RugbyFlParser
{
    private static readonly HtmlParser Parser = new();

    // ── Rules ───────────────────────────────────────────────────────────────

    /// <summary>A season is named by its closing year: August onwards belongs to the next year.</summary>
    public static int SeasonFor(DateOnly date) => date.Month >= 8 ? date.Year + 1 : date.Year;

    public static string MatchTypeFor(string? competition) =>
        competition is not null && Friendly().IsMatch(competition) ? "friendly" : "league";

    public static string StatusFor(bool hasScores, string note)
    {
        if (!hasScores) return FixtureStatus.Upcoming;
        if (note.Contains("forfeit", StringComparison.OrdinalIgnoreCase))
            return ClaymoresForfeited().IsMatch(note) ? FixtureStatus.ForfeitUs : FixtureStatus.ForfeitThem;
        return FixtureStatus.Played;
    }

    /// <summary>Forfeits score 20-0 to the side that did not forfeit.</summary>
    public static (int Home, int Away) ScoresFor(string status, string homeTeam, string awayTeam, int home, int away)
    {
        var homeIsUs = TeamNameResolver.IsClaymores(homeTeam);
        var awayIsUs = TeamNameResolver.IsClaymores(awayTeam);
        return status switch
        {
            FixtureStatus.ForfeitUs => (homeIsUs ? 0 : 20, awayIsUs ? 0 : 20),
            FixtureStatus.ForfeitThem => (homeIsUs ? 20 : 0, awayIsUs ? 20 : 0),
            _ => (home, away),
        };
    }

    /// <summary>The note says the game was cancelled and not played. Played forfeits still count.</summary>
    public static bool IsCancelled(string note)
    {
        if (string.IsNullOrEmpty(note)) return false;
        if (GameNotPlayed().IsMatch(note)) return true;
        return CancelledPrefix().IsMatch(note) && !note.Contains("forfeit", StringComparison.OrdinalIgnoreCase);
    }

    public static bool IsPlayoff(string note) => PlayoffKeywords().IsMatch(note);

    public static string? ClassifyRound(string note)
    {
        var n = note.ToLowerInvariant();
        if (QuarterFinal().IsMatch(n)) return "quarter";
        if (SemiFinal().IsMatch(n)) return "semi";
        if (n.Contains("3rd place") || n.Contains("third place")) return "third";
        if (FinalRound().IsMatch(n)) return "final";
        return null;
    }

    // ── Club fixtures page ──────────────────────────────────────────────────

    /// <summary>
    /// Walks td.SectionTitleSec (date), td.TableRowBig (kickoff and competition) and
    /// td.TeamGame (teams and scores) in document order, like the original cheerio scraper.
    /// Returns every game on the page; filter with <see cref="ScrapedFixture.InvolvesClaymores"/>.
    /// </summary>
    public static IReadOnlyList<ScrapedFixture> ParseClubFixtures(string html)
    {
        using var document = Parser.ParseDocument(html);
        var fixtures = new List<ScrapedFixture>();
        DateOnly? currentDate = null;
        var currentCompetition = "";
        TimeOnly? currentKickoff = null;

        foreach (var td in document.QuerySelectorAll("td.SectionTitleSec, td.TableRowBig, td.TeamGame"))
        {
            if (td.ClassList.Contains("SectionTitleSec"))
            {
                var match = LongDate().Match(td.TextContent);
                if (match.Success && DateOnly.TryParseExact(Collapse(match.Groups[1].Value), "MMMM d, yyyy",
                        CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
                    currentDate = date;
                continue;
            }

            if (td.ClassList.Contains("TableRowBig"))
            {
                var competition = Collapse(td.QuerySelector("a font")?.TextContent ?? "");
                if (competition.Length > 0) currentCompetition = competition;
                currentKickoff = ParseKickoff(td);
                continue;
            }

            var links = td.QuerySelectorAll("a");
            if (links.Length < 2 || currentDate is not { } gameDate) continue;

            var homeRaw = TeamNameResolver.Clean(links[0].TextContent);
            var awayRaw = TeamNameResolver.Clean(links[1].TextContent);
            if (homeRaw.Length == 0 || awayRaw.Length == 0) continue;

            var scores = td.QuerySelectorAll("font[color=\"#FF0000\"] strong")
                .Select(strong => ParseLeadingInt(strong.TextContent))
                .Where(score => score is not null).Select(score => score!.Value).ToArray();
            var hasScores = scores.Length >= 2;

            var row = td.Closest("tr");
            var noteCell = row?.NextElementSibling is { LocalName: "tr" } next ? next.QuerySelector(".TableRowNoLine") : null;
            var note = noteCell is null ? "" : Collapse(noteCell.TextContent);

            var detail = row?.QuerySelector("a[href*=\"Game_Detail.asp\"]")?.GetAttribute("href");
            int? gameId = detail is not null && GameIdPattern().Match(detail) is { Success: true } id
                ? int.Parse(id.Groups[1].Value, CultureInfo.InvariantCulture)
                : null;

            var status = StatusFor(hasScores, note);
            var (home, away) = ScoresFor(status, homeRaw, awayRaw, hasScores ? scores[0] : 0, hasScores ? scores[1] : 0);
            var competitionOrNull = currentCompetition.Length > 0 ? currentCompetition : null;

            fixtures.Add(new ScrapedFixture(gameDate, SeasonFor(gameDate), homeRaw, awayRaw, home, away, status,
                MatchTypeFor(competitionOrNull), competitionOrNull, note.Length > 0 ? note : null,
                currentKickoff, gameId, detail is null ? null : System.Net.WebUtility.HtmlDecode(detail)));
        }
        return fixtures;
    }

    private static TimeOnly? ParseKickoff(IElement tableRowBig)
    {
        var bold = tableRowBig.QuerySelector("b")?.TextContent ?? tableRowBig.TextContent;
        var match = KickoffPattern().Match(bold);
        return match.Success && TimeOnly.TryParseExact(match.Groups[1].Value.ToUpperInvariant().Replace("  ", " "),
            ["h:mm tt", "h:mmtt"], CultureInfo.InvariantCulture, DateTimeStyles.None, out var time)
            ? time
            : null;
    }

    /// <summary>The "Field:" line on Game_Detail.asp plus its street address, or null when pending.</summary>
    public static string? ParseGameVenue(string html)
    {
        using var document = Parser.ParseDocument(html);
        var label = document.QuerySelectorAll("td > strong")
            .FirstOrDefault(strong => Collapse(strong.TextContent).Equals("Field:", StringComparison.OrdinalIgnoreCase));
        if (label is null) return null;

        var name = new System.Text.StringBuilder();
        var address = new System.Text.StringBuilder();
        var inAddress = false;
        for (var node = label.NextSibling; node is not null; node = node.NextSibling)
        {
            if (node is IElement { LocalName: "br" })
            {
                if (inAddress) break;
                inAddress = true;
                continue;
            }
            if (node is IElement { LocalName: "a" }) break; // the map link ends the address
            if (node is IText or IElement)
                (inAddress ? address : name).Append(node.TextContent);
        }

        var venue = Collapse(name.ToString());
        if (venue.Length == 0 || PendingVenue().IsMatch(venue)) return null;
        var street = TrailingZip().Replace(Collapse(address.ToString()).Split('\u2022')[0].Trim(), "").TrimEnd(',', ' ');
        return street.Length > 0 ? $"{venue}, {street}" : venue;
    }

    // ── Championship page ───────────────────────────────────────────────────

    public static ParsedChampionship? ParseChampionship(string html)
    {
        using var document = Parser.ParseDocument(html);
        var schedule = ParseSchedule(document);
        var rows = ParseStandings(document);
        var source = StandingsSource.StandingsTable;
        if (rows.Count == 0 && schedule.Count > 0)
        {
            // The schedule has no pool column, so ExcludePools below has nothing to drop here.
            rows = ComputeStandingsFromSchedule(schedule);
            source = StandingsSource.ComputedFromSchedule;
        }
        rows = ExcludePools(rows);
        return rows.Count == 0 ? null : new ParsedChampionship(Rank(rows), ExtractPlayoffs(schedule), source);
    }

    /// <summary>
    /// rugbyfl.com lists out-of-state guest sides (Austin Blacks, Detroit Tradesmen, ...) in a pool called
    /// "Unique". They are not part of the league table the site shows, so they are dropped before ranking.
    /// </summary>
    public static readonly IReadOnlySet<string> ExcludedPools = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "Unique" };

    public static List<StandingsRow> ExcludePools(IEnumerable<StandingsRow> rows) =>
        rows.Where(row => !ExcludedPools.Contains(row.Pool.Trim())).ToList();

    public static IReadOnlyList<StandingsRow> ParseStandings(string html)
    {
        using var document = Parser.ParseDocument(html);
        return ParseStandings(document);
    }

    public static IReadOnlyList<ScheduleMatch> ParseSchedule(string html)
    {
        using var document = Parser.ParseDocument(html);
        return ParseSchedule(document);
    }

    private static List<StandingsRow> ParseStandings(IDocument document)
    {
        var rows = new List<StandingsRow>();
        // Like the cheerio original: the first table whose first row (at any depth) has the expected
        // headings, then every descendant row whose direct cells number at least 19.
        var table = document.QuerySelectorAll("table").FirstOrDefault(candidate =>
        {
            var header = HeaderText(candidate);
            return header.Contains("pos") && header.Contains("pool") && header.Contains("team") &&
                   header.Contains("played") && header.Contains("total");
        });
        if (table is null) return rows;

        foreach (var tr in table.QuerySelectorAll("tr"))
        {
            var cells = tr.Children.Where(child => child.LocalName == "td").ToArray();
            if (cells.Length < 19) continue;
            var anchor = cells[2].QuerySelector("a[href*=\"Team.asp\"]");
            if (anchor is null) continue;
            var teamName = Collapse(anchor.TextContent.Length > 0 ? anchor.TextContent : cells[2].TextContent);
            if (teamName.Length == 0 || teamName.Equals("team", StringComparison.OrdinalIgnoreCase)) continue;

            rows.Add(new StandingsRow(teamName, Collapse(cells[1].TextContent),
                ToInt(cells[3]), ToInt(cells[4]), ToInt(cells[5]), ToInt(cells[6]),
                ToInt(cells[11]), ToInt(cells[12]), ToInt(cells[13]), ToInt(cells[17]), ToInt(cells[18])));
        }
        return rows;
    }

    private static List<ScheduleMatch> ParseSchedule(IDocument document)
    {
        var matches = new List<ScheduleMatch>();
        var table = document.QuerySelectorAll("table").FirstOrDefault(candidate =>
        {
            var header = HeaderText(candidate);
            return header.Contains("date") && header.Contains("home") && header.Contains("tries") &&
                   header.Contains("away") && BpColumn().Matches(header).Count >= 2;
        });
        if (table is null) return matches;

        var trs = table.QuerySelectorAll("tr").ToArray();
        for (var i = 0; i < trs.Length; i++)
        {
            var cells = trs[i].QuerySelectorAll("td").ToArray();
            if (cells.Length < 14) continue;

            var homeName = Collapse(cells[1].QuerySelector("a")?.TextContent is { Length: > 0 } h ? h : cells[1].TextContent);
            var awayName = Collapse(cells[8].QuerySelector("a")?.TextContent is { Length: > 0 } a ? a : cells[8].TextContent);
            if (homeName.Length == 0 || awayName.Length == 0) continue;
            if (homeName.Equals("home", StringComparison.OrdinalIgnoreCase) &&
                awayName.Equals("away", StringComparison.OrdinalIgnoreCase)) continue;

            var note = "";
            if (i + 1 < trs.Length)
            {
                var nextCells = trs[i + 1].QuerySelectorAll("td");
                if (nextCells.Length <= 2)
                {
                    var nextText = string.Concat(nextCells.Select(cell => cell.TextContent)).Trim();
                    if (NoteWord().IsMatch(nextText))
                        note = NotePrefix().Replace(nextText, "").Trim();
                }
            }

            matches.Add(new ScheduleMatch(ParseScheduleDate(cells[0].TextContent), homeName, awayName,
                ParseScoreCell(cells[2].TextContent), ParseScoreCell(cells[9].TextContent),
                ToInt(cells[3]), ToInt(cells[10]), note));
        }
        return matches;
    }

    /// <summary>
    /// World Rugby league points: win 4, draw 2, +1 for four or more tries, +1 for losing by
    /// seven or fewer. Cancelled and playoff games are skipped; forfeits earn no bonus points.
    /// </summary>
    public static List<StandingsRow> ComputeStandingsFromSchedule(IEnumerable<ScheduleMatch> matches)
    {
        var table = new Dictionary<string, int[]>(StringComparer.Ordinal); // P W L D PF PA BP TP
        var order = new List<string>();
        int[] Ensure(string name)
        {
            if (table.TryGetValue(name, out var existing)) return existing;
            order.Add(name);
            return table[name] = new int[8];
        }

        foreach (var m in matches)
        {
            if (IsCancelled(m.Note) || IsPlayoff(m.Note)) continue;
            if (m.HomeScore is null && m.AwayScore is null) continue;

            var home = Ensure(m.HomeName);
            var away = Ensure(m.AwayName);
            var hs = m.HomeScore ?? 0;
            var @as = m.AwayScore ?? 0;
            home[0]++; away[0]++;
            home[4] += hs; home[5] += @as;
            away[4] += @as; away[5] += hs;

            var margin = Math.Abs(hs - @as);
            int homeBonus = 0, awayBonus = 0;
            if (!m.Note.Contains("forfeit", StringComparison.OrdinalIgnoreCase))
            {
                if (m.HomeTries >= 4) homeBonus++;
                if (m.AwayTries >= 4) awayBonus++;
                if (hs < @as && margin <= 7) homeBonus++;
                if (@as < hs && margin <= 7) awayBonus++;
            }

            int homeMatch = 0, awayMatch = 0;
            if (hs > @as) { home[1]++; away[2]++; homeMatch = 4; }
            else if (hs < @as) { away[1]++; home[2]++; awayMatch = 4; }
            else { home[3]++; away[3]++; homeMatch = 2; awayMatch = 2; }

            home[6] += homeBonus; away[6] += awayBonus;
            home[7] += homeMatch + homeBonus; away[7] += awayMatch + awayBonus;
        }

        return order.Select(name =>
        {
            var t = table[name];
            return new StandingsRow(name, "", t[0], t[1], t[2], t[3], t[4], t[5], t[4] - t[5], t[6], t[7]);
        }).ToList();
    }

    /// <summary>Total points, then points difference (both descending), then team name.</summary>
    public static IReadOnlyList<RankedStandingsRow> Rank(IEnumerable<StandingsRow> rows) =>
        rows.OrderByDescending(row => row.TotalPoints)
            .ThenByDescending(row => row.PointsDifference)
            .ThenBy(row => row.TeamName, StringComparer.Create(CultureInfo.InvariantCulture, CompareOptions.IgnoreCase))
            .Select((row, index) => new RankedStandingsRow(index + 1, row))
            .ToArray();

    public static IReadOnlyList<PlayoffEntry> ExtractPlayoffs(IEnumerable<ScheduleMatch> matches) =>
        matches.Where(m => !IsCancelled(m.Note))
            .Select(m => (Match: m, Round: ClassifyRound(m.Note)))
            .Where(item => item.Round is not null)
            .Select(item => new PlayoffEntry(item.Round!, item.Match.Note, item.Match.Date, item.Match.HomeName,
                item.Match.AwayName, item.Match.HomeScore, item.Match.AwayScore))
            .ToArray();

    // ── Helpers ─────────────────────────────────────────────────────────────

    private static string HeaderText(IElement table) =>
        Collapse(table.QuerySelector("tr")?.TextContent ?? "").ToLowerInvariant();

    private static string Collapse(string text) => TeamNameResolver.Clean(text);

    private static int ToInt(IElement cell) => ParseLeadingInt(cell.TextContent) ?? 0;

    private static int? ParseLeadingInt(string text)
    {
        var match = LeadingInt().Match(text.Replace(' ', ' '));
        return match.Success && int.TryParse(match.Groups[1].Value, CultureInfo.InvariantCulture, out var value) ? value : null;
    }

    /// <summary>"(31)" is a played score; a bare "0" or blank cell means not played.</summary>
    public static int? ParseScoreCell(string raw)
    {
        var match = BracketedScore().Match(raw.Replace(' ', ' ').Trim());
        return match.Success ? int.Parse(match.Groups[1].Value, CultureInfo.InvariantCulture) : null;
    }

    /// <summary>"4/1/2023" becomes "2023-04-01"; anything else becomes "".</summary>
    public static string ParseScheduleDate(string raw)
    {
        var match = ShortDate().Match(raw.Replace(' ', ' ').Trim());
        return match.Success
            ? $"{match.Groups[3].Value}-{match.Groups[1].Value.PadLeft(2, '0')}-{match.Groups[2].Value.PadLeft(2, '0')}"
            : "";
    }

    [GeneratedRegex("friendl", RegexOptions.IgnoreCase)]
    private static partial Regex Friendly();
    [GeneratedRegex("claymore.{0,15}forfeit|forfeit.{0,10}by.{0,10}claymore", RegexOptions.IgnoreCase)]
    private static partial Regex ClaymoresForfeited();
    [GeneratedRegex("game not played", RegexOptions.IgnoreCase)]
    private static partial Regex GameNotPlayed();
    [GeneratedRegex("^cancel(l)?ed", RegexOptions.IgnoreCase)]
    private static partial Regex CancelledPrefix();
    [GeneratedRegex(@"semi[-\s]?final|quarter[-\s]?final|state final|gulf coast|super regional|cup final|grand final|playoff|championship final|clubs final|3rd place|third place", RegexOptions.IgnoreCase)]
    private static partial Regex PlayoffKeywords();
    [GeneratedRegex(@"quarter[-\s]?final")]
    private static partial Regex QuarterFinal();
    [GeneratedRegex(@"semi[-\s]?final")]
    private static partial Regex SemiFinal();
    [GeneratedRegex(@"\bfinal\b|championship|clubs final|cup final|grand final|state final")]
    private static partial Regex FinalRound();
    [GeneratedRegex(@"(\w+ \d+,\s*\d{4})")]
    private static partial Regex LongDate();
    [GeneratedRegex(@"(\d{1,2}:\d{2}\s*[AaPp][Mm])")]
    private static partial Regex KickoffPattern();
    [GeneratedRegex(@"Game_ID=(\d+)", RegexOptions.IgnoreCase)]
    private static partial Regex GameIdPattern();
    [GeneratedRegex(@"^\s*(-?\d+)")]
    private static partial Regex LeadingInt();
    [GeneratedRegex(@"^\((-?\d+)\)$")]
    private static partial Regex BracketedScore();
    [GeneratedRegex(@"^(\d{1,2})/(\d{1,2})/(\d{4})")]
    private static partial Regex ShortDate();
    [GeneratedRegex("bp")]
    private static partial Regex BpColumn();
    [GeneratedRegex("note:?", RegexOptions.IgnoreCase)]
    private static partial Regex NoteWord();
    [GeneratedRegex(@"^[\s ]*note:?\s*", RegexOptions.IgnoreCase)]
    private static partial Regex NotePrefix();
    [GeneratedRegex(@"^(pending|tbd|tba)\b", RegexOptions.IgnoreCase)]
    private static partial Regex PendingVenue();
    [GeneratedRegex(@"\s+\d{5}$")]
    private static partial Regex TrailingZip();
}
