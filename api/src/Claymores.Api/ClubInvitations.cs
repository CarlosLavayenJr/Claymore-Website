using System.Security.Claims;
using Microsoft.Extensions.Caching.Memory;
using Npgsql;

internal sealed record ClubInvitation(string Email, string Role, string? InvitedBy, DateTimeOffset InvitedAt);
internal sealed record InvitationRequest(string? Role);

/// <summary>
/// Who may sign in, and as what. Rows live in <c>club_invitations</c>. Role lookups are
/// cached briefly because the session cookie re-checks the role on every request.
/// </summary>
internal sealed class ClubInvitations(NpgsqlDataSource dataSource, IMemoryCache cache)
{
    internal static readonly TimeSpan CacheDuration = TimeSpan.FromSeconds(30);
    internal static readonly string[] Roles = ["player", "admin"];

    public static string Normalize(string email) => email.Trim().ToLowerInvariant();

    public static bool IsValidEmail(string email) =>
        email.Length is >= 3 and <= 320 && email.IndexOf('@') is > 0 && email.IndexOf('@') == email.LastIndexOf('@') &&
        email.IndexOf('@') < email.Length - 1 && !email.Any(char.IsWhiteSpace);

    public async Task<string?> FindRoleAsync(string email, CancellationToken ct)
    {
        var key = "club-invitation:" + Normalize(email);
        if (cache.TryGetValue(key, out string? cached)) return cached;

        await using var command = dataSource.CreateCommand("SELECT role FROM club_invitations WHERE email = @email");
        command.Parameters.AddWithValue("email", Normalize(email));
        var role = await command.ExecuteScalarAsync(ct) as string;
        cache.Set(key, role, CacheDuration);
        return role;
    }

    public async Task<List<ClubInvitation>> ListAsync(CancellationToken ct)
    {
        await using var command = dataSource.CreateCommand(
            "SELECT email, role, invited_by, invited_at FROM club_invitations ORDER BY role, email");
        await using var reader = await command.ExecuteReaderAsync(ct);
        var invitations = new List<ClubInvitation>();
        while (await reader.ReadAsync(ct))
            invitations.Add(new(reader.GetString(0), reader.GetString(1),
                reader.IsDBNull(2) ? null : reader.GetString(2), reader.GetFieldValue<DateTimeOffset>(3)));
        return invitations;
    }

    /// <summary>
    /// Invites <paramref name="email"/> or changes its role, and marks that email's pending join
    /// requests approved by <paramref name="invitedBy"/>, since they no longer need a decision.
    /// </summary>
    public async Task UpsertAsync(string email, string role, string? invitedBy, CancellationToken ct)
    {
        await using var connection = await dataSource.OpenConnectionAsync(ct);
        await using var transaction = await connection.BeginTransactionAsync(ct);
        await UpsertAsync(connection, transaction, email, role, invitedBy, keepAdmin: false, ct);
        await transaction.CommitAsync(ct);
        Forget(email);
    }

    /// <summary>
    /// The invitation write inside the caller's transaction. With <paramref name="keepAdmin"/>, an
    /// existing admin invitation is never lowered to player (join request approvals use this). The
    /// caller commits, then calls <see cref="Forget"/>.
    /// </summary>
    /// <returns>The email's role afterwards.</returns>
    internal static async Task<string> UpsertAsync(NpgsqlConnection connection, NpgsqlTransaction transaction,
        string email, string role, string? invitedBy, bool keepAdmin, CancellationToken ct)
    {
        await using var command = new NpgsqlCommand("""
            INSERT INTO club_invitations (email, role, invited_by) VALUES (@email, @role, @by)
            ON CONFLICT (email) DO UPDATE SET
                role = CASE WHEN @keepAdmin AND club_invitations.role = 'admin' THEN 'admin' ELSE EXCLUDED.role END,
                updated_at = now()
            RETURNING role
            """, connection, transaction);
        command.Parameters.AddWithValue("email", Normalize(email));
        command.Parameters.AddWithValue("role", role);
        command.Parameters.Add("by", NpgsqlTypes.NpgsqlDbType.Text).Value = (object?)invitedBy ?? DBNull.Value;
        command.Parameters.AddWithValue("keepAdmin", keepAdmin);
        var stored = (string)(await command.ExecuteScalarAsync(ct))!;

        await using var approve = new NpgsqlCommand("""
            UPDATE join_requests SET status = 'approved', decided_by = @by, decided_at = now(), deny_reason = NULL,
                updated_at = now()
            WHERE status = 'pending' AND lower(btrim(email)) = @email
            """, connection, transaction);
        approve.Parameters.AddWithValue("email", Normalize(email));
        approve.Parameters.Add("by", NpgsqlTypes.NpgsqlDbType.Text).Value = (object?)invitedBy ?? DBNull.Value;
        await approve.ExecuteNonQueryAsync(ct);
        return stored;
    }

    /// <summary>Drops the cached role so the next lookup sees a committed change.</summary>
    public void Forget(string email) => cache.Remove("club-invitation:" + Normalize(email));

    public async Task<bool> RemoveAsync(string email, CancellationToken ct)
    {
        await using var command = dataSource.CreateCommand("DELETE FROM club_invitations WHERE email = @email");
        command.Parameters.AddWithValue("email", Normalize(email));
        var removed = await command.ExecuteNonQueryAsync(ct) > 0;
        cache.Remove("club-invitation:" + Normalize(email));
        return removed;
    }
}

internal static class ClubRoles
{
    /// <summary>
    /// Resolves a verified Google identity to "admin", "player", or null (not invited).
    /// Sources: the configured bootstrap lists (Authentication:Google:AdminEmails and
    /// PlayerEmails) and the club_invitations table. Admin from either source wins.
    /// </summary>
    public static async Task<string?> ResolveAsync(ClaimsPrincipal? user, IConfiguration configuration,
        ClubInvitations? invitations, CancellationToken ct)
    {
        var email = user?.FindFirstValue("email");
        if (string.IsNullOrWhiteSpace(email) ||
            string.IsNullOrWhiteSpace(user?.FindFirstValue("sub")) ||
            !bool.TryParse(user?.FindFirstValue("email_verified"), out var verified) ||
            !verified)
            return null;

        if (IsConfigured(configuration, "AdminEmails", email)) return "admin";
        var stored = invitations is null ? null : await invitations.FindRoleAsync(email, ct);
        if (stored == "admin") return "admin";
        if (stored == "player" || IsConfigured(configuration, "PlayerEmails", email)) return "player";
        return null;
    }

    /// <summary>Normalized emails in the bootstrap lists: both, or one of "PlayerEmails" and "AdminEmails".</summary>
    public static string[] ConfiguredEmails(IConfiguration configuration, params string[] groups) =>
        (groups.Length == 0 ? ["PlayerEmails", "AdminEmails"] : groups)
            .SelectMany(group => configuration.GetSection($"Authentication:Google:{group}").GetChildren())
            .Select(entry => entry.Value is null ? null : ClubInvitations.Normalize(entry.Value))
            .OfType<string>()
            .Where(email => email.Length > 0)
            .Distinct(StringComparer.Ordinal)
            .ToArray();

    private static bool IsConfigured(IConfiguration configuration, string group, string email) =>
        configuration.GetSection($"Authentication:Google:{group}").GetChildren()
            .Any(entry => string.Equals(entry.Value?.Trim(), email.Trim(), StringComparison.OrdinalIgnoreCase));
}

internal static class InvitationEndpoints
{
    public static void Map(WebApplication app)
    {
        var admin = app.MapGroup("/v1/admin/invitations").WithTags("Members")
            .RequireAuthorization(GoogleSignIn.AdminPolicy);
        admin.AddEndpointFilter(async (context, next) =>
        {
            context.HttpContext.Response.Headers.CacheControl = "no-store";
            return await next(context);
        });

        admin.MapGet("/", async (ClubInvitations invitations, CancellationToken ct) =>
                Results.Ok(await invitations.ListAsync(ct)))
            .WithSummary("List invited members and their roles")
            .Produces<List<ClubInvitation>>().Produces(401).Produces(403);

        admin.MapPut("/{email}", async (string email, InvitationRequest request, ClaimsPrincipal user,
                ClubInvitations invitations, CancellationToken ct) =>
            {
                var normalized = ClubInvitations.Normalize(email);
                if (!ClubInvitations.IsValidEmail(normalized) || !ClubInvitations.Roles.Contains(request.Role))
                    return Results.BadRequest(new { error = "Provide a valid email and a role of player or admin." });
                if (IsSelf(user, normalized) && request.Role != "admin")
                    return Results.Conflict(new { error = "You can't remove your own admin role." });

                await invitations.UpsertAsync(normalized, request.Role!, user.FindFirstValue("email"), ct);
                return Results.Ok(new { email = normalized, role = request.Role });
            })
            .AddEndpointFilter(SameOrigin)
            .WithSummary("Invite a member or change their role")
            .Produces(200).Produces(400).Produces(401).Produces(403).Produces(409);

        admin.MapDelete("/{email}", async (string email, ClaimsPrincipal user, ClubInvitations invitations,
                CancellationToken ct) =>
            {
                var normalized = ClubInvitations.Normalize(email);
                if (IsSelf(user, normalized))
                    return Results.Conflict(new { error = "You can't remove your own invitation." });
                return await invitations.RemoveAsync(normalized, ct) ? Results.NoContent() : Results.NotFound();
            })
            .AddEndpointFilter(SameOrigin)
            .WithSummary("Remove a member's invitation")
            .Produces(204).Produces(401).Produces(403).Produces(404).Produces(409);
    }

    private static bool IsSelf(ClaimsPrincipal user, string email) =>
        string.Equals(user.FindFirstValue("email")?.Trim(), email, StringComparison.OrdinalIgnoreCase);

    private static ValueTask<object?> SameOrigin(EndpointFilterInvocationContext context, EndpointFilterDelegate next) =>
        SameOriginGuard.Filter(context, next);
}
