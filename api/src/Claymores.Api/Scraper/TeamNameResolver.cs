using System.Text.RegularExpressions;

/// <summary>A team the resolver may match, with its raw aliases.</summary>
public sealed record TeamCandidate(long Id, string Name, IReadOnlyCollection<string> Aliases);

public enum TeamMatchKind { Claymores, ExactName, ExactAlias, Fuzzy }

public sealed record TeamMatch(long TeamId, string TeamName, TeamMatchKind Kind);

/// <summary>
/// The single place where rugbyfl.com / Sanity team names are turned into team rows.
/// Order: Claymores detection, exact normalized name, exact normalized alias, then a
/// guarded token-subset fuzzy match that must point at exactly one team. Anything else
/// is unresolved, and the caller creates a team flagged <c>needs_review</c>.
/// </summary>
public sealed partial class TeamNameResolver
{
    public const string ClaymoresName = "Claymores";

    // Tokens that mark a different side of the same club. A fuzzy match never ignores
    // one of these; a B side or second XV joins its club only through an explicit alias.
    private static readonly HashSet<string> SideMarkers = new(StringComparer.Ordinal)
    {
        "a", "b", "c", "ii", "iii", "2", "3", "2nd", "2nds", "3rd", "3rds", "seconds", "thirds",
        "reserve", "reserves", "development", "dev", "women", "womens", "ladies", "youth",
        "u18", "u19", "u20", "u21", "u23", "hs", "academy", "sevens", "7s",
    };

    private readonly Dictionary<string, TeamCandidate> _byName = new(StringComparer.Ordinal);
    private readonly Dictionary<string, TeamCandidate> _byAlias = new(StringComparer.Ordinal);
    private readonly List<(string[] Tokens, TeamCandidate Team)> _fuzzyKeys = [];
    private TeamCandidate? _claymores;

    public TeamNameResolver(IEnumerable<TeamCandidate> teams)
    {
        foreach (var team in teams.OrderBy(team => team.Id))
            Add(team);
    }

    /// <summary>Makes a team (for example one the scraper just created) resolvable. First added wins on clashes.</summary>
    public void Add(TeamCandidate team)
    {
        var name = Normalize(team.Name);
        if (name.Length > 0)
        {
            _byName.TryAdd(name, team);
            _fuzzyKeys.Add((name.Split(' '), team));
        }
        foreach (var alias in team.Aliases)
        {
            var key = Normalize(alias);
            if (key.Length == 0) continue;
            _byAlias.TryAdd(key, team);
            _fuzzyKeys.Add((key.Split(' '), team));
        }
        if (_claymores is null && name == "claymores")
            _claymores = team;
    }

    public static bool IsClaymores(string name) => ClaymoresPattern().IsMatch(name);

    /// <summary>"IR/Claymores", "Claymores (D3)" and "Central Florida Claymores RFC" all display as "Claymores".</summary>
    public static string DisplayName(string raw)
    {
        var cleaned = Clean(raw);
        return IsClaymores(cleaned) ? ClaymoresName : cleaned;
    }

    public static string Clean(string raw) => Whitespace().Replace(raw.Replace(' ', ' '), " ").Trim();

    /// <summary>
    /// Lowercase; drop parentheticals, a leading "IR/", "F.C.", "RFC", "FC", "Rugby Football Club",
    /// "Rugby Club", "Rugby", a trailing division marker (D1-D4) and a trailing season year;
    /// collapse punctuation. "Ft. Lauderdale Knights RFC (D3)" becomes "ft lauderdale knights".
    /// </summary>
    public static string Normalize(string input)
    {
        var text = input.Replace(' ', ' ').ToLowerInvariant();
        text = Parenthetical().Replace(text, " ");
        text = LeadingIr().Replace(text, " ");
        text = text.Replace("f.c.", " ", StringComparison.Ordinal);
        text = NonAlphanumeric().Replace(text, " ");
        var tokens = text.Split(' ', StringSplitOptions.RemoveEmptyEntries).ToList();

        for (var i = 0; i < tokens.Count; i++)
        {
            if (tokens[i] != "rugby") continue;
            var length = 1;
            if (i + 2 < tokens.Count && tokens[i + 1] == "football" && tokens[i + 2] == "club") length = 3;
            else if (i + 1 < tokens.Count && tokens[i + 1] == "club") length = 2;
            tokens.RemoveRange(i, length);
            i--;
        }
        tokens.RemoveAll(token => token is "rfc" or "fc");

        while (tokens.Count > 1 && (DivisionToken().IsMatch(tokens[^1]) || YearToken().IsMatch(tokens[^1])))
            tokens.RemoveAt(tokens.Count - 1);

        return string.Join(' ', tokens);
    }

    public TeamMatch? Resolve(string raw)
    {
        if (IsClaymores(raw) && _claymores is not null)
            return new(_claymores.Id, _claymores.Name, TeamMatchKind.Claymores);

        var key = Normalize(raw);
        if (key.Length == 0) return null;
        if (_byName.TryGetValue(key, out var byName))
            return new(byName.Id, byName.Name, TeamMatchKind.ExactName);
        if (_byAlias.TryGetValue(key, out var byAlias))
            return new(byAlias.Id, byAlias.Name, TeamMatchKind.ExactAlias);

        var input = key.Split(' ');
        var inputSet = input.ToHashSet(StringComparer.Ordinal);
        var matches = new Dictionary<long, TeamCandidate>();
        foreach (var (tokens, team) in _fuzzyKeys)
        {
            // The candidate's tokens must all appear in the input, and be specific enough.
            if (tokens.Length >= input.Length || string.Join(' ', tokens).Length < 4) continue;
            if (!tokens.All(inputSet.Contains)) continue;
            var extra = input.Where(token => !tokens.Contains(token, StringComparer.Ordinal));
            if (extra.Any(SideMarkers.Contains)) continue;
            matches.TryAdd(team.Id, team);
        }
        return matches.Count == 1 && matches.Values.Single() is var only
            ? new(only.Id, only.Name, TeamMatchKind.Fuzzy)
            : null;
    }

    [GeneratedRegex("claymore", RegexOptions.IgnoreCase)]
    private static partial Regex ClaymoresPattern();
    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();
    [GeneratedRegex(@"\([^)]*\)")]
    private static partial Regex Parenthetical();
    [GeneratedRegex(@"^\s*ir\s*/")]
    private static partial Regex LeadingIr();
    [GeneratedRegex("[^a-z0-9]+")]
    private static partial Regex NonAlphanumeric();
    [GeneratedRegex("^d[1-4]$")]
    private static partial Regex DivisionToken();
    [GeneratedRegex("^(19|20)[0-9]{2}$")]
    private static partial Regex YearToken();
}
