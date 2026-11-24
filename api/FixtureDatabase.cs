using System.Text.Json;
using Npgsql;
using NpgsqlTypes;

public sealed class FixtureDatabase(NpgsqlDataSource dataSource)
{
    public async Task<JsonElement[]> ListAsync(int? season, CancellationToken ct)
    {
        await using var command = dataSource.CreateCommand("""
            SELECT payload FROM fixtures
            WHERE @season IS NULL OR season = @season
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
        await using var command = dataSource.CreateCommand(
            "SELECT payload FROM fixtures WHERE sanity_id = @id");
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
