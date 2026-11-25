using System.Security.Claims;
using Npgsql;

/// <summary>The automatic dues setting. Amount is in cents; DueDate is optional.</summary>
internal sealed record AutomaticDuesSetting(bool Enabled, string? Description, int AmountCents, DateOnly? DueDate);

/// <summary>
/// Gives every player the club's standard dues without an admin assigning them one by one.
/// When the setting is on, a player who signs in, or opens their dues, and has no dues with the
/// setting's description gets them. Dues an admin removed count as "has them", so they are never
/// added back. Admins are not included: assign theirs by hand. Failures never block a sign-in.
/// </summary>
internal sealed class AutomaticDues(NpgsqlDataSource dataSource, ILogger<AutomaticDues> logger)
{
    public async Task<AutomaticDuesSetting> GetAsync(CancellationToken ct)
    {
        await using var command = dataSource.CreateCommand(
            "SELECT enabled, description, amount_cents, due_date FROM dues_auto_assign WHERE id");
        await using var reader = await command.ExecuteReaderAsync(ct);
        return await reader.ReadAsync(ct)
            ? new(reader.GetBoolean(0), reader.GetString(1), reader.GetInt32(2),
                reader.IsDBNull(3) ? null : reader.GetFieldValue<DateOnly>(3))
            : new(false, "Season dues", 0, null);
    }

    public async Task SaveAsync(AutomaticDuesSetting setting, string admin, CancellationToken ct)
    {
        await using var command = dataSource.CreateCommand("""
            INSERT INTO dues_auto_assign (id, enabled, description, amount_cents, due_date, updated_by, updated_at)
            VALUES (true, @enabled, @description, @amount, @due, @by, now())
            ON CONFLICT (id) DO UPDATE SET enabled = EXCLUDED.enabled, description = EXCLUDED.description,
                amount_cents = EXCLUDED.amount_cents, due_date = EXCLUDED.due_date,
                updated_by = EXCLUDED.updated_by, updated_at = now()
            """);
        command.Parameters.AddWithValue("enabled", setting.Enabled);
        command.Parameters.AddWithValue("description", setting.Description!);
        command.Parameters.AddWithValue("amount", setting.AmountCents);
        command.Parameters.Add("due", NpgsqlTypes.NpgsqlDbType.Date).Value = (object?)setting.DueDate ?? DBNull.Value;
        command.Parameters.AddWithValue("by", admin);
        await command.ExecuteNonQueryAsync(ct);
    }

    /// <summary>Assigns the automatic dues to <paramref name="user"/> if they are a player without them.</summary>
    public Task EnsureAsync(ClaimsPrincipal user, CancellationToken ct) =>
        EnsureAsync(user.FindFirstValue("sub"), ClubRoles.Of(user), ct);

    public async Task EnsureAsync(string? subject, string? role, CancellationToken ct)
    {
        if (role != "player" || string.IsNullOrEmpty(subject)) return;
        try
        {
            var setting = await GetAsync(ct);
            if (!setting.Enabled || setting.AmountCents <= 0 || string.IsNullOrWhiteSpace(setting.Description)) return;

            // The ID comes from the member and the description, so two sign-ins at once insert one row.
            var id = DuesLedger.BatchAssessmentId(AutoBatch, $"{subject}:{setting.Description.Trim().ToLowerInvariant()}");
            await using var command = dataSource.CreateCommand("""
                INSERT INTO dues_assessments (id, player_subject, description, amount_cents, due_date)
                SELECT @id, @subject, @description, @amount, @due
                WHERE NOT EXISTS (SELECT 1 FROM dues_assessments -- removed ones count: an admin took them off
                                  WHERE player_subject = @subject AND lower(btrim(description)) = lower(btrim(@description)))
                ON CONFLICT (id) DO NOTHING
                """);
            command.Parameters.AddWithValue("id", id);
            command.Parameters.AddWithValue("subject", subject);
            command.Parameters.AddWithValue("description", setting.Description.Trim());
            command.Parameters.AddWithValue("amount", setting.AmountCents);
            command.Parameters.Add("due", NpgsqlTypes.NpgsqlDbType.Date).Value = (object?)setting.DueDate ?? DBNull.Value;
            if (await command.ExecuteNonQueryAsync(ct) == 1)
                logger.LogInformation("Assigned automatic dues \"{Description}\" to {Subject}.", setting.Description, subject);
        }
        catch (Exception exception) when (exception is NpgsqlException or InvalidOperationException)
        {
            logger.LogWarning(exception, "Automatic dues could not be assigned to {Subject}.", subject);
        }
    }

    private static readonly Guid AutoBatch = new("6f1d6c1e-6a52-4f0e-9d0a-2d7a4f0b5c11");
}
