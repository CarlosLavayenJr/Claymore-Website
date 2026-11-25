using System.Security.Claims;
using System.Security.Cryptography;
using Npgsql;

/// <param name="Token">The secret part of the link. Admin views only.</param>
/// <param name="Uses">How many people joined with it.</param>
internal sealed record InviteLink(Guid Id, string Token, string? CreatedBy, DateTimeOffset CreatedAt,
    DateTimeOffset ExpiresAt, DateTimeOffset? RevokedAt, int Uses)
{
    public bool Active => RevokedAt is null && ExpiresAt > DateTimeOffset.UtcNow;
}

/// <param name="ExpiresInDays">1 to 90; 30 when left out.</param>
internal sealed record CreateInviteLink(int? ExpiresInDays);

internal sealed record RedeemInviteLink(string? IdToken, string? InviteToken);

internal enum RedeemResult { Joined, AlreadyMember, InvalidLink }

/// <summary>
/// "Anyone with the link" invitations (club_invite_links). Opening the link and signing in with
/// Google invites that email as a player. Links never make admins, expire, and can be turned off.
/// </summary>
internal sealed class InviteLinks(NpgsqlDataSource dataSource, ClubInvitations invitations)
{
    internal const int DefaultDays = 30;
    internal const int MaxDays = 90;
    private const string Columns = """
        l.id, l.token, l.created_by, l.created_at, l.expires_at, l.revoked_at,
        (SELECT count(*)::int FROM club_invite_link_uses u WHERE u.link_id = l.id)
        """;

    /// <summary>A URL-safe random token (22 characters, 128 bits).</summary>
    internal static string NewToken() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(16)).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    public async Task<InviteLink> CreateAsync(int days, string? admin, CancellationToken ct)
    {
        await using var command = dataSource.CreateCommand($"""
            WITH l AS (
                INSERT INTO club_invite_links (id, token, created_by, expires_at)
                VALUES (@id, @token, @by, now() + make_interval(days => @days)) RETURNING *)
            SELECT {Columns} FROM l
            """);
        command.Parameters.AddWithValue("id", Guid.NewGuid());
        command.Parameters.AddWithValue("token", NewToken());
        command.Parameters.Add("by", NpgsqlTypes.NpgsqlDbType.Text).Value = (object?)admin ?? DBNull.Value;
        command.Parameters.AddWithValue("days", days);
        await using var reader = await command.ExecuteReaderAsync(ct);
        await reader.ReadAsync(ct);
        return Read(reader);
    }

    /// <summary>Links that still work, newest first, plus ones that ended in the last 30 days.</summary>
    public async Task<List<InviteLink>> ListAsync(CancellationToken ct)
    {
        await using var command = dataSource.CreateCommand($"""
            SELECT {Columns} FROM club_invite_links l
            WHERE COALESCE(l.revoked_at, l.expires_at) > now() - interval '30 days'
            ORDER BY l.created_at DESC
            """);
        await using var reader = await command.ExecuteReaderAsync(ct);
        var links = new List<InviteLink>();
        while (await reader.ReadAsync(ct)) links.Add(Read(reader));
        return links;
    }

    public async Task<bool> RevokeAsync(Guid id, string? admin, CancellationToken ct)
    {
        await using var command = dataSource.CreateCommand("""
            UPDATE club_invite_links SET revoked_at = COALESCE(revoked_at, now()), revoked_by = COALESCE(revoked_by, @by)
            WHERE id = @id
            """);
        command.Parameters.AddWithValue("id", id);
        command.Parameters.Add("by", NpgsqlTypes.NpgsqlDbType.Text).Value = (object?)admin ?? DBNull.Value;
        return await command.ExecuteNonQueryAsync(ct) == 1;
    }

    /// <summary>Invites <paramref name="email"/> as a player if the token belongs to a working link.</summary>
    public async Task<RedeemResult> RedeemAsync(string token, string email, bool alreadyMember, CancellationToken ct)
    {
        await using var connection = await dataSource.OpenConnectionAsync(ct);
        await using var transaction = await connection.BeginTransactionAsync(ct);
        Guid linkId;
        await using (var find = new NpgsqlCommand("""
            SELECT id FROM club_invite_links WHERE token = @token AND revoked_at IS NULL AND expires_at > now()
            """, connection, transaction))
        {
            find.Parameters.AddWithValue("token", token);
            if (await find.ExecuteScalarAsync(ct) is not Guid id) return RedeemResult.InvalidLink;
            linkId = id;
        }
        if (alreadyMember) return RedeemResult.AlreadyMember;

        await ClubInvitations.UpsertAsync(connection, transaction, email, "player", "invite link", keepAdmin: true, ct);
        await using (var use = new NpgsqlCommand("""
            INSERT INTO club_invite_link_uses (link_id, email) VALUES (@link, @email) ON CONFLICT DO NOTHING
            """, connection, transaction))
        {
            use.Parameters.AddWithValue("link", linkId);
            use.Parameters.AddWithValue("email", ClubInvitations.Normalize(email));
            await use.ExecuteNonQueryAsync(ct);
        }
        await transaction.CommitAsync(ct);
        invitations.Forget(email);
        return RedeemResult.Joined;
    }

    private static InviteLink Read(NpgsqlDataReader r) => new(
        r.GetGuid(0), r.GetString(1), r.IsDBNull(2) ? null : r.GetString(2), r.GetFieldValue<DateTimeOffset>(3),
        r.GetFieldValue<DateTimeOffset>(4), r.IsDBNull(5) ? null : r.GetFieldValue<DateTimeOffset>(5), r.GetInt32(6));
}

internal static class InviteLinkEndpoints
{
    public static void Map(WebApplication app, bool mobileAuthEnabled)
    {
        var admin = app.MapGroup("/v1/admin/invite-links").WithTags("Members")
            .RequireAuthorization(GoogleSignIn.AdminPolicy);
        admin.AddEndpointFilter(NoStore);
        admin.MapGet("/", async (InviteLinks links, CancellationToken ct) =>
                Results.Ok((await links.ListAsync(ct)).Select(Shape)))
            .WithSummary("List invite links (working ones, and ones that ended in the last 30 days)")
            .Produces(200).Produces(401).Produces(403);
        admin.MapPost("/", async (CreateInviteLink? request, ClaimsPrincipal user, InviteLinks links, CancellationToken ct) =>
            {
                var days = request?.ExpiresInDays ?? InviteLinks.DefaultDays;
                if (days is < 1 or > InviteLinks.MaxDays)
                    return Results.BadRequest(new { error = $"A link lasts 1 to {InviteLinks.MaxDays} days." });
                var link = await links.CreateAsync(days, user.FindFirstValue("email"), ct);
                return Results.Created($"/v1/admin/invite-links/{link.Id}", Shape(link));
            })
            .AddEndpointFilter(SameOriginGuard.Filter)
            .WithSummary("Make an invite link: anyone who opens it and signs in with Google joins as a player")
            .Produces(201).Produces(400).Produces(401).Produces(403);
        admin.MapDelete("/{id:guid}", async (Guid id, ClaimsPrincipal user, InviteLinks links, CancellationToken ct) =>
                await links.RevokeAsync(id, user.FindFirstValue("email"), ct) ? Results.NoContent() : Results.NotFound())
            .AddEndpointFilter(SameOriginGuard.Filter)
            .WithSummary("Turn an invite link off").Produces(204).Produces(401).Produces(403).Produces(404);

        if (!mobileAuthEnabled) return;
        app.MapPost("/v1/auth/mobile/google/redeem-invite", async (RedeemInviteLink request,
                IGoogleIdTokenValidator validator, InviteLinks links, IConfiguration configuration,
                ClubInvitations invitations, CancellationToken ct) =>
            {
                var token = request.InviteToken?.Trim();
                if (string.IsNullOrEmpty(token) || token.Length > 64)
                    return Results.Json(new { error = "invite_link_invalid" }, statusCode: StatusCodes.Status410Gone);
                var google = string.IsNullOrWhiteSpace(request.IdToken) ? null : await validator.ValidateAsync(request.IdToken, ct);
                if (google is null || !google.EmailVerified)
                    return Results.Json(new { error = "invalid_token" }, statusCode: StatusCodes.Status401Unauthorized);
                var role = await ClubRoles.ResolveAsync(
                    MobileAuth.VerifiedPrincipal(new ClubMember(google.Subject, google.Email, null)), configuration, invitations, ct);
                return await links.RedeemAsync(token, google.Email, role is not null, ct) switch
                {
                    RedeemResult.Joined => Results.Ok(new { status = "joined", email = google.Email }),
                    RedeemResult.AlreadyMember => Results.Ok(new { status = "already_member", email = google.Email }),
                    _ => Results.Json(new { error = "invite_link_invalid" }, statusCode: StatusCodes.Status410Gone),
                };
            })
            .WithTags("Request to join").AllowAnonymous().RequireRateLimiting(JoinRequestEndpoints.RateLimitPolicy)
            .AddEndpointFilter(NoStore)
            .WithSummary("Join with an invite link and a Google ID token (invites that email as a player)")
            .Produces(200).Produces(401).Produces(410).Produces(429);
    }

    private static object Shape(InviteLink l) => new
    {
        id = l.Id, token = l.Token, createdBy = l.CreatedBy, createdAt = l.CreatedAt, expiresAt = l.ExpiresAt,
        revokedAt = l.RevokedAt, uses = l.Uses, active = l.Active,
    };

    private static ValueTask<object?> NoStore(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        context.HttpContext.Response.Headers.CacheControl = "no-store";
        return next(context);
    }
}
