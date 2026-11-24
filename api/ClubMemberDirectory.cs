using Npgsql;

internal sealed record ClubMember(string Subject, string Email, string? Name);

internal sealed class ClubMemberDirectory(NpgsqlDataSource dataSource, IConfiguration configuration)
{
    public async Task ObserveSignInAsync(ClubMember member, CancellationToken ct)
    {
        await using var command = dataSource.CreateCommand("""
            INSERT INTO club_members (google_subject, email, display_name)
            VALUES (@subject, @email, @name)
            ON CONFLICT (google_subject) DO UPDATE SET
                email = EXCLUDED.email,
                display_name = EXCLUDED.display_name,
                last_sign_in_at = now()
            """);
        command.Parameters.AddWithValue("subject", member.Subject);
        command.Parameters.AddWithValue("email", member.Email.Trim());
        command.Parameters.Add("name", NpgsqlTypes.NpgsqlDbType.Text).Value =
            (object?)member.Name ?? DBNull.Value;
        await command.ExecuteNonQueryAsync(ct);
    }

    public async Task<List<ClubMember>> ListAsync(CancellationToken ct)
    {
        var invited = new[] { "PlayerEmails", "AdminEmails" }
            .SelectMany(group => configuration.GetSection($"Authentication:Google:{group}").GetChildren())
            .Select(entry => entry.Value?.Trim().ToLowerInvariant())
            .OfType<string>()
            .Where(email => email.Length > 0)
            .Distinct(StringComparer.Ordinal)
            .ToArray();

        var members = new List<ClubMember>();
        if (invited.Length == 0) return members;

        await using var command = dataSource.CreateCommand("""
            SELECT google_subject, email, display_name FROM club_members
            WHERE lower(email) = ANY(@invited)
            ORDER BY lower(COALESCE(display_name, email)), email, google_subject
            """);
        command.Parameters.AddWithValue("invited", invited);
        await using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
            members.Add(new ClubMember(
                reader.GetString(0), reader.GetString(1),
                reader.IsDBNull(2) ? null : reader.GetString(2)));

        return members;
    }
}
