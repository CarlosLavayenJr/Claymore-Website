using Npgsql;

internal sealed record ClubMember(string Subject, string Email, string? Name);

internal sealed class ClubMemberDirectory(NpgsqlDataSource dataSource, IConfiguration configuration)
{
    /// <param name="keepExistingName">
    /// Keep the stored name when <paramref name="member"/> has none (Apple sends the name only once).
    /// </param>
    /// <returns>The member's stored display name after the update.</returns>
    public async Task<string?> ObserveSignInAsync(ClubMember member, CancellationToken ct, bool keepExistingName = false)
    {
        await using var command = dataSource.CreateCommand("""
            INSERT INTO club_members (google_subject, email, display_name)
            VALUES (@subject, @email, @name)
            ON CONFLICT (google_subject) DO UPDATE SET
                email = EXCLUDED.email,
                display_name = CASE WHEN @keepName
                    THEN COALESCE(EXCLUDED.display_name, club_members.display_name)
                    ELSE EXCLUDED.display_name END,
                last_sign_in_at = now()
            RETURNING display_name
            """);
        command.Parameters.AddWithValue("subject", member.Subject);
        command.Parameters.AddWithValue("email", member.Email.Trim());
        command.Parameters.Add("name", NpgsqlTypes.NpgsqlDbType.Text).Value =
            (object?)member.Name ?? DBNull.Value;
        command.Parameters.AddWithValue("keepName", keepExistingName);
        return await command.ExecuteScalarAsync(ct) as string;
    }

    public async Task<List<ClubMember>> ListAsync(CancellationToken ct)
    {
        // Members who have signed in and are still invited, either through the
        // configured bootstrap lists or the club_invitations table.
        var invited = ClubRoles.ConfiguredEmails(configuration);
        var members = new List<ClubMember>();

        await using var command = dataSource.CreateCommand("""
            SELECT google_subject, email, display_name FROM club_members
            WHERE lower(email) = ANY(@invited)
               OR lower(email) IN (SELECT email FROM club_invitations)
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
