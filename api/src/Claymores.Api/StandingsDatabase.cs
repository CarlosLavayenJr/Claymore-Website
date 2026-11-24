using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Npgsql;

/// <summary>
/// Serves the scraped standings tables (sql/007) in the JSON shape of Sanity's leagueStandings
/// documents (see <see cref="SanityData.StandingsAsync"/>), so the website and the app read either
/// source unchanged. Rows keep the positions the scraper assigned, which are contiguous from 1.
/// </summary>
public sealed partial class StandingsDatabase(NpgsqlDataSource dataSource)
{
    public const string SanitySource = "sanity";
    public const string PostgresSource = "postgres";

    /// <summary>
    /// The standings of the championship in <c>championship_config</c>, or of the latest season when
    /// there is no config row. Null when that championship has not been scraped.
    /// </summary>
    public async Task<JsonElement?> CurrentAsync(CancellationToken ct)
    {
        await using var command = dataSource.CreateCommand("""
            SELECT s.championship_id FROM championship_config c
            JOIN standings s ON s.championship_id = c.championship_id
            UNION ALL
            SELECT championship_id FROM (
                SELECT championship_id FROM standings ORDER BY season_label DESC, last_updated DESC LIMIT 1
            ) latest WHERE NOT EXISTS (SELECT 1 FROM championship_config)
            LIMIT 1
            """);
        return await command.ExecuteScalarAsync(ct) is string id ? await DocumentAsync(id, ct) : null;
    }

    /// <summary>The most recently updated standings for a season label, or null when none are stored.</summary>
    public async Task<JsonElement?> SeasonAsync(string seasonLabel, CancellationToken ct)
    {
        await using var command = dataSource.CreateCommand("""
            SELECT championship_id FROM standings WHERE season_label = @season
            ORDER BY last_updated DESC, championship_id LIMIT 1
            """);
        command.Parameters.AddWithValue("season", seasonLabel);
        return await command.ExecuteScalarAsync(ct) is string id ? await DocumentAsync(id, ct) : null;
    }

    /// <summary>One season card per stored championship, newest season first (Sanity's standings index shape).</summary>
    public async Task<JsonObject[]> SeasonsAsync(CancellationToken ct)
    {
        await using var command = dataSource.CreateCommand("""
            SELECT s.season_label, s.division_name, s.last_updated,
                   (SELECT count(*)::int FROM standings_rows r WHERE r.championship_id = s.championship_id),
                   (SELECT r.position FROM standings_rows r
                    WHERE r.championship_id = s.championship_id AND r.team_name ILIKE '%claymore%'
                    ORDER BY r.position LIMIT 1)
            FROM standings s ORDER BY s.season_label DESC, s.last_updated DESC
            """);
        await using var reader = await command.ExecuteReaderAsync(ct);
        var seasons = new List<JsonObject>();
        while (await reader.ReadAsync(ct))
            seasons.Add(new JsonObject
            {
                ["claymoresPosition"] = reader.IsDBNull(4) ? null : reader.GetInt32(4),
                ["divisionName"] = reader.IsDBNull(1) ? null : reader.GetString(1),
                ["lastUpdated"] = LastUpdated(reader.GetFieldValue<DateTime>(2)),
                ["seasonLabel"] = reader.GetString(0),
                ["teamCount"] = reader.GetInt32(3),
            });
        return seasons.ToArray();
    }

    private async Task<JsonElement?> DocumentAsync(string championshipId, CancellationToken ct)
    {
        await using var connection = await dataSource.OpenConnectionAsync(ct);
        JsonObject document;
        await using (var header = new NpgsqlCommand("""
            SELECT season_label, division_name, last_updated FROM standings WHERE championship_id = @id
            """, connection))
        {
            header.Parameters.AddWithValue("id", championshipId);
            await using var reader = await header.ExecuteReaderAsync(ct);
            if (!await reader.ReadAsync(ct)) return null;
            var updated = reader.GetFieldValue<DateTime>(2);
            document = new JsonObject
            {
                ["championshipId"] = championshipId,
                ["divisionName"] = reader.IsDBNull(1) ? null : reader.GetString(1),
                ["id"] = "leagueStandings-" + championshipId,
                ["lastUpdated"] = LastUpdated(updated),
                ["seasonLabel"] = reader.GetString(0),
                ["updatedAt"] = updated.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture),
            };
        }

        var rows = new JsonArray();
        await using (var command = new NpgsqlCommand("""
            SELECT position, team_name, pool, played, won, lost, drawn, points_for, points_against,
                   points_difference, bonus_points, total_points
            FROM standings_rows WHERE championship_id = @id ORDER BY position
            """, connection))
        {
            command.Parameters.AddWithValue("id", championshipId);
            await using var reader = await command.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                var position = reader.GetInt32(0);
                var team = reader.GetString(1);
                var pool = reader.GetString(2);
                rows.Add(new JsonObject
                {
                    ["_key"] = $"r-{position}-{Key(team)}",
                    ["_type"] = "row",
                    ["bonusPoints"] = reader.GetInt32(10),
                    ["drawn"] = reader.GetInt32(6),
                    ["lost"] = reader.GetInt32(5),
                    ["played"] = reader.GetInt32(3),
                    ["pointsAgainst"] = reader.GetInt32(8),
                    ["pointsDifference"] = reader.GetInt32(9),
                    ["pointsFor"] = reader.GetInt32(7),
                    ["pool"] = pool.Length == 0 ? null : pool,
                    ["position"] = position,
                    ["teamName"] = team,
                    ["totalPoints"] = reader.GetInt32(11),
                    ["won"] = reader.GetInt32(4),
                });
            }
        }

        var playoffs = new JsonArray();
        await using (var command = new NpgsqlCommand("""
            SELECT ordinal, round, label, to_char(match_date, 'YYYY-MM-DD'), home_team, away_team, home_score, away_score
            FROM standings_playoffs WHERE championship_id = @id ORDER BY ordinal
            """, connection))
        {
            command.Parameters.AddWithValue("id", championshipId);
            await using var reader = await command.ExecuteReaderAsync(ct);
            var index = 0;
            while (await reader.ReadAsync(ct))
            {
                var home = reader.GetString(4);
                var away = reader.GetString(5);
                playoffs.Add(new JsonObject
                {
                    ["_key"] = $"p-{index++}-{Key(home)}-{Key(away)}",
                    ["_type"] = "playoffMatch",
                    ["awayScore"] = reader.IsDBNull(7) ? null : reader.GetInt32(7),
                    ["awayTeam"] = away,
                    ["date"] = reader.IsDBNull(3) ? null : reader.GetString(3),
                    ["homeScore"] = reader.IsDBNull(6) ? null : reader.GetInt32(6),
                    ["homeTeam"] = home,
                    ["label"] = reader.GetString(2),
                    ["round"] = reader.GetString(1),
                });
            }
        }

        document["playoffs"] = playoffs;
        document["rows"] = rows;
        return JsonSerializer.SerializeToElement(document);
    }

    // Sanity's lastUpdated is an ISO string with milliseconds, written by the website scraper.
    private static string LastUpdated(DateTime value) =>
        value.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);

    /// <summary>The website scraper's slugifyKey: lowercase, dashes for runs of other characters, 48 characters.</summary>
    internal static string Key(string text)
    {
        var key = NonKey().Replace(text.ToLowerInvariant(), "-").Trim('-');
        return key.Length > 48 ? key[..48] : key;
    }

    [GeneratedRegex("[^a-z0-9]+")]
    private static partial Regex NonKey();
}

/// <summary>
/// The public standings reads. With Standings:Source=postgres, seasons scraped into Postgres are
/// served from there and every other season falls back to Sanity, so seasons the scraper has not
/// stored yet (2026-2027 while rugbyfl.com returns HTTP 500 for championship 203, and the older
/// archived seasons) keep working. Each fallback is logged.
/// </summary>
public sealed class StandingsReader(SanityData sanity, ILogger<StandingsReader> logger, StandingsDatabase? database = null)
{
    public async Task<JsonElement> StandingsAsync(string? season, CancellationToken ct)
    {
        if (database is not null)
        {
            var stored = season is null ? await database.CurrentAsync(ct) : await database.SeasonAsync(season, ct);
            if (stored is { } document) return document;
            logger.LogInformation("Standings for {Season} are not in Postgres; falling back to Sanity.", season ?? "the current season");
        }
        return await sanity.StandingsAsync(season, ct);
    }

    public async Task<JsonElement> SeasonsAsync(CancellationToken ct)
    {
        if (database is null) return await sanity.StandingsSeasonsAsync(ct);

        var seasons = (await database.SeasonsAsync(ct)).ToList();
        var stored = seasons.Select(s => (string)s["seasonLabel"]!).ToHashSet(StringComparer.Ordinal);
        try
        {
            var fallback = (await sanity.StandingsSeasonsAsync(ct)).EnumerateArray()
                .Where(s => s.TryGetProperty("seasonLabel", out var label) && label.ValueKind == JsonValueKind.String
                            && !stored.Contains(label.GetString()!))
                .ToArray();
            if (fallback.Length > 0)
                logger.LogInformation("Standings seasons {Seasons} are not in Postgres; listing them from Sanity.",
                    string.Join(", ", fallback.Select(s => s.GetProperty("seasonLabel").GetString())));
            seasons.AddRange(fallback.Select(s => JsonNode.Parse(s.GetRawText())!.AsObject()));
        }
        catch (Exception error) when (error is HttpRequestException or TaskCanceledException && !ct.IsCancellationRequested)
        {
            logger.LogWarning(error, "Sanity is unavailable; listing only the standings seasons stored in Postgres.");
        }

        // Newest season first, like Sanity's order(seasonLabel desc). The sort is stable.
        var ordered = seasons.OrderByDescending(s => (string?)s["seasonLabel"], StringComparer.Ordinal).ToArray();
        return JsonSerializer.SerializeToElement(new JsonArray(ordered.Select(JsonNode? (s) => s).ToArray()));
    }
}
