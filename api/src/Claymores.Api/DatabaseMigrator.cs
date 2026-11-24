using System.Reflection;
using Npgsql;

/// <summary>
/// Applies the embedded <c>sql/*.sql</c> scripts in name order and records each one in
/// <c>schema_migrations</c>. A Postgres advisory lock keeps concurrent instances from
/// migrating at the same time. Each script runs in its own transaction.
/// </summary>
public sealed class DatabaseMigrator(NpgsqlDataSource dataSource, ILogger<DatabaseMigrator> logger)
{
    // Arbitrary, stable key for pg_advisory_lock ("Claymore" in ASCII).
    private const long LockKey = 0x436C_6179_6D6F_7265;
    private const string ResourcePrefix = "sql/";

    public static IReadOnlyList<(string Version, string Sql)> LoadScripts()
    {
        var assembly = typeof(DatabaseMigrator).Assembly;
        return assembly.GetManifestResourceNames()
            .Where(name => name.StartsWith(ResourcePrefix, StringComparison.Ordinal) &&
                           name.EndsWith(".sql", StringComparison.Ordinal))
            .Order(StringComparer.Ordinal)
            .Select(name => (Path.GetFileNameWithoutExtension(name[ResourcePrefix.Length..]), Read(assembly, name)))
            .ToArray();
    }

    public async Task<IReadOnlyList<string>> MigrateAsync(CancellationToken ct)
    {
        await using var connection = await dataSource.OpenConnectionAsync(ct);
        await ExecuteAsync(connection, null, "SELECT pg_advisory_lock(@key)", ct, ("key", LockKey));
        try
        {
            await ExecuteAsync(connection, null, """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version text PRIMARY KEY,
                    applied_at timestamptz NOT NULL DEFAULT now()
                )
                """, ct);

            var applied = await AppliedAsync(connection, ct);
            var newlyApplied = new List<string>();
            foreach (var (version, sql) in LoadScripts())
            {
                if (applied.Contains(version)) continue;

                await using var transaction = await connection.BeginTransactionAsync(ct);
                await ExecuteAsync(connection, transaction, sql, ct);
                await ExecuteAsync(connection, transaction,
                    "INSERT INTO schema_migrations (version) VALUES (@version)", ct, ("version", version));
                await transaction.CommitAsync(ct);
                logger.LogInformation("Applied database migration {Version}", version);
                newlyApplied.Add(version);
            }
            return newlyApplied;
        }
        finally
        {
            await ExecuteAsync(connection, null, "SELECT pg_advisory_unlock(@key)", CancellationToken.None, ("key", LockKey));
        }
    }

    /// <summary>Versions bundled with this build that the database has not recorded yet.</summary>
    public async Task<string[]> PendingAsync(CancellationToken ct)
    {
        await using var connection = await dataSource.OpenConnectionAsync(ct);
        await using var exists = new NpgsqlCommand("SELECT to_regclass('schema_migrations') IS NOT NULL", connection);
        var applied = (bool)(await exists.ExecuteScalarAsync(ct))!
            ? await AppliedAsync(connection, ct)
            : [];
        return LoadScripts().Select(script => script.Version).Where(version => !applied.Contains(version)).ToArray();
    }

    private static async Task<HashSet<string>> AppliedAsync(NpgsqlConnection connection, CancellationToken ct)
    {
        await using var command = new NpgsqlCommand("SELECT version FROM schema_migrations", connection);
        await using var reader = await command.ExecuteReaderAsync(ct);
        var versions = new HashSet<string>(StringComparer.Ordinal);
        while (await reader.ReadAsync(ct))
            versions.Add(reader.GetString(0));
        return versions;
    }

    private static async Task ExecuteAsync(NpgsqlConnection connection, NpgsqlTransaction? transaction,
        string sql, CancellationToken ct, params (string Name, object Value)[] parameters)
    {
        await using var command = new NpgsqlCommand(sql, connection, transaction);
        foreach (var (name, value) in parameters)
            command.Parameters.AddWithValue(name, value);
        await command.ExecuteNonQueryAsync(ct);
    }

    private static string Read(Assembly assembly, string name)
    {
        using var stream = assembly.GetManifestResourceStream(name)!;
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
