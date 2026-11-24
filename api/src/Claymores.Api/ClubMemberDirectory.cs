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

    /// <summary>
    /// The member a Google or Apple sign-in belongs to (one member per person, see migration 016):
    /// the member this provider account is linked to; else the member with the same verified email,
    /// so signing in with Apple after Google (same address) is the same member; else a new member
    /// whose subject is this account's. Reads only: after the role check, call
    /// <see cref="RememberIdentityAsync"/>. The returned email is the member's, which is the one
    /// invitations match, so a linked Apple relay address still gets the member's role.
    /// </summary>
    /// <param name="signIn">The provider account: its subject (Google's, or <c>apple|</c> + Apple's),
    /// verified email and the name it sent, if any.</param>
    public async Task<ClubMember> ResolveAsync(ClubMember signIn, CancellationToken ct)
    {
        await using (var linked = dataSource.CreateCommand("""
            SELECT m.google_subject, m.email, m.display_name
            FROM member_identities i JOIN club_members m ON m.google_subject = i.member_subject
            WHERE i.provider_subject = @provider
            """))
        {
            linked.Parameters.AddWithValue("provider", signIn.Subject);
            await using var reader = await linked.ExecuteReaderAsync(ct);
            if (await reader.ReadAsync(ct))
                return new ClubMember(reader.GetString(0), reader.GetString(1),
                    signIn.Name ?? (reader.IsDBNull(2) ? null : reader.GetString(2)));
        }

        await using var sameEmail = dataSource.CreateCommand("""
            SELECT google_subject, email, display_name FROM club_members
            WHERE lower(btrim(email)) = lower(btrim(@email))
            ORDER BY first_sign_in_at, google_subject LIMIT 1
            """);
        sameEmail.Parameters.AddWithValue("email", signIn.Email);
        await using (var reader = await sameEmail.ExecuteReaderAsync(ct))
        {
            if (await reader.ReadAsync(ct))
                return new ClubMember(reader.GetString(0), reader.GetString(1),
                    signIn.Name ?? (reader.IsDBNull(2) ? null : reader.GetString(2)));
        }
        return signIn;
    }

    /// <summary>Records that <paramref name="providerSubject"/> signs in as <paramref name="memberSubject"/>.</summary>
    public async Task RememberIdentityAsync(string providerSubject, string memberSubject, CancellationToken ct)
    {
        await using var command = dataSource.CreateCommand("""
            INSERT INTO member_identities (provider_subject, member_subject) VALUES (@provider, @member)
            ON CONFLICT (provider_subject) DO NOTHING
            """);
        command.Parameters.AddWithValue("provider", providerSubject);
        command.Parameters.AddWithValue("member", memberSubject);
        await command.ExecuteNonQueryAsync(ct);
    }

    /// <summary>
    /// Links an Apple account to <paramref name="memberSubject"/> (an explicit link from the app,
    /// needed for "Hide My Email" addresses). If that Apple account was already its own member
    /// (signed in on its own before linking) with no dues, that member is folded in: its row is
    /// removed and its app sessions end. False when the Apple account belongs to another member
    /// with dues, or to another person's account.
    /// </summary>
    public async Task<bool> LinkAsync(string providerSubject, string memberSubject, CancellationToken ct)
    {
        await using var connection = await dataSource.OpenConnectionAsync(ct);
        await using var transaction = await connection.BeginTransactionAsync(ct);
        string? current;
        await using (var find = new NpgsqlCommand(
            "SELECT member_subject FROM member_identities WHERE provider_subject = @provider FOR UPDATE",
            connection, transaction))
        {
            find.Parameters.AddWithValue("provider", providerSubject);
            current = await find.ExecuteScalarAsync(ct) as string;
        }
        if (current == memberSubject) return true;
        if (current is not null)
        {
            // Only a standalone Apple member (its own subject) without dues can be folded in.
            await using var standalone = new NpgsqlCommand("""
                SELECT @current = @provider
                   AND NOT EXISTS (SELECT 1 FROM dues_assessments WHERE player_subject = @current)
                   AND NOT EXISTS (SELECT 1 FROM member_identities
                                   WHERE member_subject = @current AND provider_subject <> @provider)
                """, connection, transaction);
            standalone.Parameters.AddWithValue("current", current);
            standalone.Parameters.AddWithValue("provider", providerSubject);
            if (!(bool)(await standalone.ExecuteScalarAsync(ct))!) return false;

            await using var fold = new NpgsqlCommand("""
                UPDATE mobile_refresh_tokens SET revoked_at = now() WHERE google_subject = @current AND revoked_at IS NULL;
                DELETE FROM club_members WHERE google_subject = @current;
                UPDATE member_identities SET member_subject = @member, linked_at = now() WHERE provider_subject = @provider;
                """, connection, transaction);
            fold.Parameters.AddWithValue("current", current);
            fold.Parameters.AddWithValue("member", memberSubject);
            fold.Parameters.AddWithValue("provider", providerSubject);
            await fold.ExecuteNonQueryAsync(ct);
        }
        else
        {
            await using var insert = new NpgsqlCommand(
                "INSERT INTO member_identities (provider_subject, member_subject) VALUES (@provider, @member)",
                connection, transaction);
            insert.Parameters.AddWithValue("provider", providerSubject);
            insert.Parameters.AddWithValue("member", memberSubject);
            await insert.ExecuteNonQueryAsync(ct);
        }
        await transaction.CommitAsync(ct);
        return true;
    }

    /// <summary>Which providers can sign in as this member ("google", "apple").</summary>
    public async Task<string[]> ProvidersAsync(string memberSubject, CancellationToken ct)
    {
        await using var command = dataSource.CreateCommand("""
            SELECT provider_subject FROM member_identities WHERE member_subject = @member
            UNION SELECT @member
            """);
        command.Parameters.AddWithValue("member", memberSubject);
        await using var reader = await command.ExecuteReaderAsync(ct);
        var providers = new SortedSet<string>(StringComparer.Ordinal);
        while (await reader.ReadAsync(ct))
            providers.Add(reader.GetString(0).StartsWith(AppleSignIn.SubjectPrefix, StringComparison.Ordinal)
                ? "apple" : "google");
        return [.. providers];
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
