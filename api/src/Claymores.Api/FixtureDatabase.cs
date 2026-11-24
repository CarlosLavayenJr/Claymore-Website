using System.Text.Json;
using Npgsql;
using NpgsqlTypes;

/// <param name="readSource">
/// Which rows the public endpoints serve: 'sanity' (imported with --import-fixtures, the default)
/// or 'scraper' (written by the rugbyfl.com scraper). Set Fixtures:Source=scraper at cutover.
/// </param>
public sealed class FixtureDatabase(NpgsqlDataSource dataSource, string readSource = FixtureDatabase.SanitySource)
{
    public const string SanitySource = "sanity";
    public const string ScraperSource = "scraper";

    /// <summary>
    /// Scraper rows in the JSON shape Sanity's match projection returns (see <see cref="SanityData"/>),
    /// built from the typed columns and the teams table at read time, so team logo, slug and city
    /// changes show up without a rescrape. Columns: id, fixture_date, season, payload.
    /// <list type="bullet">
    /// <item>Names are the stored display names minus a trailing season year: rugbyfl.com lists
    /// "Orlando Otters 2026", Sanity (and so the website's fixture slugs) shows "Orlando Otters".</item>
    /// <item>Logo, slug and city come from the team's profile: the team row itself when it carries
    /// profile data (copied from Sanity by --import-reference-data), else the profile team that owns
    /// the team's name as an alias. That is how the seeded "Claymores" row gets the "Central Florida
    /// Claymores" profile. Teams without a profile get nulls, like Sanity matches without a team
    /// reference, so the website never links to an /opponents page that doesn't exist.</item>
    /// <item>updatedAt uses Sanity's second-precision UTC format.</item>
    /// <item>Retired rows (no longer listed on rugbyfl.com, see <see cref="ScrapeStore.UpsertFixturesAsync"/>) are left out.</item>
    /// </list>
    /// </summary>
    internal const string ScraperPayloadQuery = """
        SELECT f.sanity_id AS id, f.fixture_date, f.season, jsonb_build_object(
            'id', f.sanity_id,
            'updatedAt', to_char(f.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
            'date', to_char(f.fixture_date, 'YYYY-MM-DD'),
            'season', f.season,
            'homeTeam', COALESCE(NULLIF(regexp_replace(f.home_team_raw, '\s+(19|20)[0-9]{2}$', ''), ''), f.home_team_raw),
            'awayTeam', COALESCE(NULLIF(regexp_replace(f.away_team_raw, '\s+(19|20)[0-9]{2}$', ''), ''), f.away_team_raw),
            'homeScore', f.home_score,
            'awayScore', f.away_score,
            'status', f.status,
            'venue', f.venue,
            'kickoffTime', to_char(f.kickoff_time, 'FMHH12:MI AM'),
            'note', f.note,
            'matchType', f.match_type,
            'competition', f.competition,
            'recap', NULL,
            'homeLogo', hp.logo_url,
            'awayLogo', ap.logo_url,
            'homeTeamSlug', hp.slug,
            'awayTeamSlug', ap.slug,
            'homeTeamCity', hp.city,
            'awayTeamCity', ap.city) AS payload
        FROM fixtures f
        LEFT JOIN LATERAL (
            SELECT p.slug, p.city, p.logo_url FROM (
                SELECT 0 AS rank, t.id, t.slug, t.city, t.logo_url, t.website FROM teams t WHERE t.id = f.home_team_id
                UNION ALL
                SELECT 1, t.id, t.slug, t.city, t.logo_url, t.website
                FROM teams h JOIN team_aliases a ON a.alias_normalized = lower(h.name) JOIN teams t ON t.id = a.team_id
                WHERE h.id = f.home_team_id
            ) p
            WHERE p.logo_url IS NOT NULL OR p.city IS NOT NULL OR p.website IS NOT NULL
            ORDER BY p.rank, p.id LIMIT 1
        ) hp ON true
        LEFT JOIN LATERAL (
            SELECT p.slug, p.city, p.logo_url FROM (
                SELECT 0 AS rank, t.id, t.slug, t.city, t.logo_url, t.website FROM teams t WHERE t.id = f.away_team_id
                UNION ALL
                SELECT 1, t.id, t.slug, t.city, t.logo_url, t.website
                FROM teams h JOIN team_aliases a ON a.alias_normalized = lower(h.name) JOIN teams t ON t.id = a.team_id
                WHERE h.id = f.away_team_id
            ) p
            WHERE p.logo_url IS NOT NULL OR p.city IS NOT NULL OR p.website IS NOT NULL
            ORDER BY p.rank, p.id LIMIT 1
        ) ap ON true
        WHERE f.source = 'scraper' AND f.retired_at IS NULL
        """;

    public async Task<JsonElement[]> ListAsync(int? season, CancellationToken ct)
    {
        await using var command = dataSource.CreateCommand(readSource == ScraperSource
            ? "SELECT payload FROM (" + ScraperPayloadQuery + """
                ) p WHERE @season IS NULL OR season = @season ORDER BY fixture_date, id
                """
            : """
                SELECT payload FROM fixtures
                WHERE source = 'sanity' AND (@season IS NULL OR season = @season)
                ORDER BY fixture_date, sanity_id
                """);
        command.Parameters.Add("season", NpgsqlDbType.Integer).Value = (object?)season ?? DBNull.Value;
        await using var reader = await command.ExecuteReaderAsync(ct);
        var fixtures = new List<JsonElement>();
        while (await reader.ReadAsync(ct))
            fixtures.Add(reader.GetFieldValue<JsonElement>(0));
        return fixtures.ToArray();
    }

    public async Task<JsonElement> FindAsync(string id, CancellationToken ct)
    {
        await using var command = dataSource.CreateCommand(readSource == ScraperSource
            ? "SELECT payload FROM (" + ScraperPayloadQuery + ") p WHERE id = @id"
            : "SELECT payload FROM fixtures WHERE sanity_id = @id AND source = 'sanity'");
        command.Parameters.AddWithValue("id", id);
        await using var reader = await command.ExecuteReaderAsync(ct);
        return await reader.ReadAsync(ct) ? reader.GetFieldValue<JsonElement>(0) : default;
    }

    public async Task<int> ImportAsync(JsonElement[] fixtures, CancellationToken ct)
    {
        if (fixtures.Length == 0)
            throw new InvalidOperationException("Sanity returned zero fixtures.");

        await using var connection = await dataSource.OpenConnectionAsync(ct);
        await using var transaction = await connection.BeginTransactionAsync(ct);

        // Insert team names in a stable order so concurrent imports acquire locks consistently.
        var teams = fixtures.SelectMany(fixture => new[]
        {
            fixture.GetProperty("homeTeam").GetString()!,
            fixture.GetProperty("awayTeam").GetString()!
        }).Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal).ToArray();

        await using (var teamsCommand = new NpgsqlCommand("""
            INSERT INTO teams (name) SELECT unnest(@teams)
            ON CONFLICT (name) DO NOTHING
            """, connection, transaction))
        {
            teamsCommand.Parameters.AddWithValue("teams", teams);
            await teamsCommand.ExecuteNonQueryAsync(ct);
        }

        await using var batch = new NpgsqlBatch(connection, transaction);
        foreach (var fixture in fixtures.OrderBy(fixture => fixture.GetProperty("id").GetString(), StringComparer.Ordinal))
        {
            var command = new NpgsqlBatchCommand("""
                INSERT INTO fixtures (sanity_id, fixture_date, season, home_team, away_team, payload)
                VALUES (@id, @date, @season, @home, @away, @payload)
                ON CONFLICT (sanity_id) DO UPDATE SET
                    fixture_date = EXCLUDED.fixture_date,
                    season = EXCLUDED.season,
                    home_team = EXCLUDED.home_team,
                    away_team = EXCLUDED.away_team,
                    payload = EXCLUDED.payload
                """);
            command.Parameters.AddWithValue("id", fixture.GetProperty("id").GetString()!);
            command.Parameters.AddWithValue("date", DateOnly.ParseExact(fixture.GetProperty("date").GetString()!, "yyyy-MM-dd"));
            command.Parameters.Add("season", NpgsqlDbType.Integer).Value =
                fixture.GetProperty("season").TryReadInteger() is { } season ? season : DBNull.Value;
            command.Parameters.AddWithValue("home", fixture.GetProperty("homeTeam").GetString()!);
            command.Parameters.AddWithValue("away", fixture.GetProperty("awayTeam").GetString()!);
            command.Parameters.AddWithValue("payload", NpgsqlDbType.Jsonb, fixture);
            batch.BatchCommands.Add(command);
        }

        await batch.ExecuteNonQueryAsync(ct);
        await transaction.CommitAsync(ct);
        return fixtures.Length;
    }
}

file static class JsonValues
{
    public static int? TryReadInteger(this JsonElement value) =>
        value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var number) ? number : null;
}
