using System.Globalization;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using Npgsql;

internal sealed record JoinRequest(
    Guid Id, string Provider, string Email, string Name, string? Phone, string? Message, string Status,
    DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);

internal sealed record GoogleJoinRequest(string? IdToken, string? Name, string? Phone, string? Message);
internal sealed record AppleJoinRequest(string? IdentityToken, string? RawNonce, string? Name, string? Phone, string? Message);
internal sealed record JoinApproval(string? Role);
internal sealed record JoinDenial(string? Reason);

internal enum JoinSubmitResult { Created, Updated, DeniedRecently }
internal enum JoinDecisionResult { Done, NotFound, NotPending, Self }

/// <summary>
/// "Request to join": a signed-in but uninvited Google or Apple user asks for access, and an
/// admin approves (creating the club_invitations row) or denies it. Rows live in <c>join_requests</c>,
/// one per identity. Apple subjects are stored as <c>apple|{sub}</c>, like sign-in does.
/// </summary>
internal sealed class JoinRequestStore(NpgsqlDataSource dataSource, ClubInvitations invitations)
{
    /// <summary>A denied identity can ask again after this long.</summary>
    internal static readonly TimeSpan DeniedCooldown = TimeSpan.FromHours(24);
    internal static readonly string[] Statuses = ["pending", "approved", "denied"];
    private const string Columns = "id, provider, email, name, phone, message, status, created_at, updated_at";

    /// <summary>Creates the request, or updates it and puts it back to pending (unless denied in the last 24 hours).</summary>
    public async Task<JoinSubmitResult> SubmitAsync(string provider, string subject, string email, string name,
        string? phone, string? message, CancellationToken ct)
    {
        await using var command = dataSource.CreateCommand("""
            WITH previous AS (SELECT status FROM join_requests WHERE provider = @provider AND subject = @subject)
            INSERT INTO join_requests (id, provider, subject, email, name, phone, message)
            VALUES (@id, @provider, @subject, @email, @name, @phone, @message)
            ON CONFLICT (provider, subject) DO UPDATE SET
                email = EXCLUDED.email, name = EXCLUDED.name, phone = EXCLUDED.phone, message = EXCLUDED.message,
                status = 'pending', updated_at = now(), decided_by = NULL, decided_at = NULL, deny_reason = NULL
            WHERE join_requests.status <> 'denied' OR join_requests.decided_at <= now() - @cooldown
            RETURNING (SELECT status FROM previous)
            """);
        command.Parameters.AddWithValue("id", Guid.NewGuid());
        command.Parameters.AddWithValue("provider", provider);
        command.Parameters.AddWithValue("subject", subject);
        command.Parameters.AddWithValue("email", email.Trim());
        command.Parameters.AddWithValue("name", name);
        command.Parameters.Add("phone", NpgsqlTypes.NpgsqlDbType.Text).Value = (object?)phone ?? DBNull.Value;
        command.Parameters.Add("message", NpgsqlTypes.NpgsqlDbType.Text).Value = (object?)message ?? DBNull.Value;
        command.Parameters.AddWithValue("cooldown", DeniedCooldown);
        await using var reader = await command.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct))
            return JoinSubmitResult.DeniedRecently;
        return reader.IsDBNull(0) || reader.GetString(0) != "pending" ? JoinSubmitResult.Created : JoinSubmitResult.Updated;
    }

    /// <returns>"none", "pending", "approved", or "denied".</returns>
    public async Task<string> StatusAsync(string provider, string subject, CancellationToken ct)
    {
        await using var command = dataSource.CreateCommand(
            "SELECT status FROM join_requests WHERE provider = @provider AND subject = @subject");
        command.Parameters.AddWithValue("provider", provider);
        command.Parameters.AddWithValue("subject", subject);
        return await command.ExecuteScalarAsync(ct) as string ?? "none";
    }

    public async Task<List<JoinRequest>> ListAsync(string? status, CancellationToken ct)
    {
        await using var command = dataSource.CreateCommand($"""
            SELECT {Columns} FROM join_requests
            WHERE @status::text IS NULL OR status = @status
            ORDER BY created_at, id
            """);
        command.Parameters.Add("status", NpgsqlTypes.NpgsqlDbType.Text).Value = (object?)status ?? DBNull.Value;
        await using var reader = await command.ExecuteReaderAsync(ct);
        var requests = new List<JoinRequest>();
        while (await reader.ReadAsync(ct))
            requests.Add(Read(reader));
        return requests;
    }

    public async Task<JoinRequest?> FindAsync(Guid id, CancellationToken ct)
    {
        await using var command = dataSource.CreateCommand($"SELECT {Columns} FROM join_requests WHERE id = @id");
        command.Parameters.AddWithValue("id", id);
        await using var reader = await command.ExecuteReaderAsync(ct);
        return await reader.ReadAsync(ct) ? Read(reader) : null;
    }

    /// <summary>Invites the request's email with <paramref name="role"/> and marks the request approved.</summary>
    public async Task<(JoinDecisionResult Result, JoinRequest? Request)> ApproveAsync(Guid id, string role,
        string? adminEmail, CancellationToken ct)
    {
        if (await FindAsync(id, ct) is not { } request)
            return (JoinDecisionResult.NotFound, null);
        if (IsSelf(adminEmail, request.Email) && role != "admin")
            return (JoinDecisionResult.Self, request);

        await invitations.UpsertAsync(request.Email, role, adminEmail, ct);
        return (JoinDecisionResult.Done, await DecideAsync(id, "approved", adminEmail, null, null, ct));
    }

    /// <summary>Denies a pending request.</summary>
    public async Task<(JoinDecisionResult Result, JoinRequest? Request)> DenyAsync(Guid id, string? reason,
        string? adminEmail, CancellationToken ct)
    {
        if (await FindAsync(id, ct) is null)
            return (JoinDecisionResult.NotFound, null);
        var denied = await DecideAsync(id, "denied", adminEmail, reason, "pending", ct);
        return denied is null ? (JoinDecisionResult.NotPending, null) : (JoinDecisionResult.Done, denied);
    }

    private async Task<JoinRequest?> DecideAsync(Guid id, string status, string? adminEmail, string? reason,
        string? requiredStatus, CancellationToken ct)
    {
        await using var command = dataSource.CreateCommand($"""
            UPDATE join_requests SET status = @status, decided_by = @by, decided_at = now(),
                deny_reason = @reason, updated_at = now()
            WHERE id = @id AND (@required::text IS NULL OR status = @required)
            RETURNING {Columns}
            """);
        command.Parameters.AddWithValue("id", id);
        command.Parameters.AddWithValue("status", status);
        command.Parameters.Add("by", NpgsqlTypes.NpgsqlDbType.Text).Value = (object?)adminEmail ?? DBNull.Value;
        command.Parameters.Add("reason", NpgsqlTypes.NpgsqlDbType.Text).Value = (object?)reason ?? DBNull.Value;
        command.Parameters.Add("required", NpgsqlTypes.NpgsqlDbType.Text).Value = (object?)requiredStatus ?? DBNull.Value;
        await using var reader = await command.ExecuteReaderAsync(ct);
        return await reader.ReadAsync(ct) ? Read(reader) : null;
    }

    private static bool IsSelf(string? adminEmail, string email) =>
        adminEmail is not null && ClubInvitations.Normalize(adminEmail) == ClubInvitations.Normalize(email);

    private static JoinRequest Read(NpgsqlDataReader reader) => new(
        reader.GetGuid(0), reader.GetString(1), reader.GetString(2), reader.GetString(3),
        reader.IsDBNull(4) ? null : reader.GetString(4), reader.IsDBNull(5) ? null : reader.GetString(5),
        reader.GetString(6), reader.GetFieldValue<DateTimeOffset>(7), reader.GetFieldValue<DateTimeOffset>(8));

    /// <summary>Trims and checks the applicant's details.</summary>
    /// <returns>The name of the first invalid field, or null.</returns>
    internal static string? Validate(ref string? name, ref string? phone, ref string? message)
    {
        name = name?.Trim();
        phone = string.IsNullOrWhiteSpace(phone) ? null : phone.Trim();
        message = string.IsNullOrWhiteSpace(message) ? null : message.Trim();
        if (name is null || name.Length is < 1 or > 80 || name.Any(char.IsControl))
            return "name";
        if (phone is not null && (phone.Length > 30 || !phone.All(c => char.IsAsciiDigit(c) || "+()-. ".Contains(c))))
            return "phone";
        if (message is not null && message.Length > 500)
            return "message";
        return null;
    }
}

internal static class JoinRequestEndpoints
{
    internal const string RateLimitPolicy = "join-requests";

    /// <summary>Per-IP limit for the public request-access and request-status endpoints.</summary>
    public static void AddRateLimiting(IServiceCollection services, IConfiguration configuration)
    {
        var permits = configuration.GetValue("JoinRequests:PermitsPerMinute", 10);
        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.OnRejected = (context, ct) =>
            {
                if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
                    context.HttpContext.Response.Headers.RetryAfter =
                        ((int)Math.Ceiling(retryAfter.TotalSeconds)).ToString(CultureInfo.InvariantCulture);
                context.HttpContext.Response.ContentType = "application/json; charset=utf-8";
                return new ValueTask(context.HttpContext.Response.WriteAsync("""{"error":"rate_limited"}""", ct));
            };
            options.AddPolicy(RateLimitPolicy, context => RateLimitPartition.GetFixedWindowLimiter(
                context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = permits,
                    Window = TimeSpan.FromMinutes(1),
                    QueueLimit = 0,
                }));
        });
    }

    public static void Map(WebApplication app, bool mobileAuthEnabled)
    {
        MapAdmin(app);
        JoinRequestAdminPage.Map(app);
        if (!mobileAuthEnabled)
            return;

        var mobile = app.MapGroup("/v1/auth/mobile").WithTags("Request to join").AllowAnonymous()
            .RequireRateLimiting(RateLimitPolicy);
        mobile.AddEndpointFilter(NoStore);

        mobile.MapPost("/google/request-access", async (GoogleJoinRequest request, IGoogleIdTokenValidator validator,
                JoinRequestStore store, IConfiguration configuration, HttpContext context, ILogger<JoinRequestStore> logger,
                CancellationToken ct) =>
            {
                var identity = await GoogleAsync(request.IdToken, validator, ct);
                return identity is null
                    ? InvalidToken()
                    : await SubmitAsync(identity.Value, request.Name, request.Phone, request.Message, store, configuration,
                        context, logger, ct);
            })
            .WithSummary("Ask to join the club with a Google ID token")
            .WithDescription("For an account that sign-in rejected with not_invited. Admins approve or deny the request.")
            .Produces(202).Produces(400).Produces(401).Produces(409).Produces(429);

        mobile.MapPost("/google/request-status", async (GoogleJoinRequest request, IGoogleIdTokenValidator validator,
                JoinRequestStore store, CancellationToken ct) =>
            {
                var identity = await GoogleAsync(request.IdToken, validator, ct);
                return identity is null ? InvalidToken() : await StatusAsync(identity.Value, store, ct);
            })
            .WithSummary("Get the join request status for a Google ID token")
            .Produces(200).Produces(401).Produces(429);

        if (app.Services.GetRequiredService<MobileAuthSettings>().AppleAudiences.Length == 0)
            return;

        mobile.MapPost("/apple/request-access", async (AppleJoinRequest request, IAppleIdentityTokenValidator validator,
                JoinRequestStore store, IConfiguration configuration, HttpContext context, ILogger<JoinRequestStore> logger,
                CancellationToken ct) =>
            {
                var identity = await AppleAsync(request.IdentityToken, request.RawNonce, validator, ct);
                return identity is null
                    ? InvalidToken()
                    : await SubmitAsync(identity.Value, request.Name, request.Phone, request.Message, store, configuration,
                        context, logger, ct);
            })
            .WithSummary("Ask to join the club with an Apple identity token")
            .WithDescription("For an account that sign-in rejected with not_invited. Admins approve or deny the request.")
            .Produces(202).Produces(400).Produces(401).Produces(409).Produces(429);

        mobile.MapPost("/apple/request-status", async (AppleJoinRequest request, IAppleIdentityTokenValidator validator,
                JoinRequestStore store, CancellationToken ct) =>
            {
                var identity = await AppleAsync(request.IdentityToken, request.RawNonce, validator, ct);
                return identity is null ? InvalidToken() : await StatusAsync(identity.Value, store, ct);
            })
            .WithSummary("Get the join request status for an Apple identity token")
            .Produces(200).Produces(401).Produces(429);
    }

    private static void MapAdmin(WebApplication app)
    {
        var admin = app.MapGroup("/v1/admin/join-requests").WithTags("Members")
            .RequireAuthorization(GoogleSignIn.AdminPolicy);
        admin.AddEndpointFilter(NoStore);

        admin.MapGet("/", async (string? status, JoinRequestStore store, CancellationToken ct) =>
                status is not null && !JoinRequestStore.Statuses.Contains(status)
                    ? InvalidRequest("status")
                    : Results.Ok(await store.ListAsync(status, ct)))
            .WithSummary("List join requests, optionally by status (pending, approved, or denied)")
            .Produces<List<JoinRequest>>().Produces(400).Produces(401).Produces(403);

        admin.MapPost("/{id:guid}/approve", async (Guid id, JoinApproval? request, ClaimsPrincipal user,
                JoinRequestStore store, CancellationToken ct) =>
            {
                if (request?.Role is not { } role || !ClubInvitations.Roles.Contains(role))
                    return InvalidRequest("role");
                var (result, approved) = await store.ApproveAsync(id, role, user.FindFirstValue("email"), ct);
                return Decision(result, approved);
            })
            .AddEndpointFilter(SameOriginGuard.Filter)
            .WithSummary("Approve a join request: invites its email with the given role")
            .Produces<JoinRequest>().Produces(400).Produces(401).Produces(403).Produces(404).Produces(409);

        admin.MapPost("/{id:guid}/deny", async (Guid id, JoinDenial? request, ClaimsPrincipal user,
                JoinRequestStore store, CancellationToken ct) =>
            {
                var reason = string.IsNullOrWhiteSpace(request?.Reason) ? null : request.Reason.Trim();
                if (reason is { Length: > 500 })
                    return InvalidRequest("reason");
                var (result, denied) = await store.DenyAsync(id, reason, user.FindFirstValue("email"), ct);
                return Decision(result, denied);
            })
            .AddEndpointFilter(SameOriginGuard.Filter)
            .WithSummary("Deny a pending join request (the person can ask again after 24 hours)")
            .Produces<JoinRequest>().Produces(400).Produces(401).Produces(403).Produces(404).Produces(409);
    }

    private static IResult Decision(JoinDecisionResult result, JoinRequest? request) => result switch
    {
        JoinDecisionResult.Done => Results.Ok(request),
        JoinDecisionResult.NotFound => Results.NotFound(),
        JoinDecisionResult.Self => Results.Conflict(new { error = "You can't remove your own admin role." }),
        _ => Results.Conflict(new { error = "not_pending" })
    };

    private readonly record struct Applicant(string Provider, string Subject, string Email);

    private static async Task<Applicant?> GoogleAsync(string? idToken, IGoogleIdTokenValidator validator, CancellationToken ct)
    {
        var google = string.IsNullOrWhiteSpace(idToken) ? null : await validator.ValidateAsync(idToken, ct);
        return google is null || !google.EmailVerified ? null : new Applicant("google", google.Subject, google.Email);
    }

    private static async Task<Applicant?> AppleAsync(string? identityToken, string? rawNonce,
        IAppleIdentityTokenValidator validator, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(identityToken) || string.IsNullOrEmpty(rawNonce) || rawNonce.Length > 512)
            return null;
        var apple = await validator.ValidateAsync(identityToken, rawNonce, ct);
        return apple is null || !apple.EmailVerified
            ? null
            : new Applicant("apple", AppleSignIn.SubjectPrefix + apple.Subject, apple.Email);
    }

    private static async Task<IResult> SubmitAsync(Applicant applicant, string? name, string? phone, string? message,
        JoinRequestStore store, IConfiguration configuration, HttpContext context, ILogger logger, CancellationToken ct)
    {
        var role = await ClubRoles.ResolveAsync(
            MobileAuth.VerifiedPrincipal(new ClubMember(applicant.Subject, applicant.Email, null)), configuration,
            context.RequestServices.GetService<ClubInvitations>(), ct);
        if (role is not null)
            return Results.Json(new { status = "already_member" }, statusCode: StatusCodes.Status409Conflict);

        if (JoinRequestStore.Validate(ref name, ref phone, ref message) is { } field)
            return InvalidRequest(field);

        var result = await store.SubmitAsync(applicant.Provider, applicant.Subject, applicant.Email, name!, phone, message, ct);
        if (result == JoinSubmitResult.DeniedRecently)
            return Results.Json(new { status = "denied_recently" }, statusCode: StatusCodes.Status429TooManyRequests);
        // Email notification is a later step (Resend); until then admins check /auth/admin/join-requests.
        if (result == JoinSubmitResult.Created)
            logger.LogInformation("New join request from {Email}", applicant.Email);
        return Results.Json(new { status = "pending", email = applicant.Email }, statusCode: StatusCodes.Status202Accepted);
    }

    private static async Task<IResult> StatusAsync(Applicant applicant, JoinRequestStore store, CancellationToken ct) =>
        Results.Ok(new { status = await store.StatusAsync(applicant.Provider, applicant.Subject, ct) });

    private static IResult InvalidToken() => Results.Json(new { error = "invalid_token" }, statusCode: 401);

    private static IResult InvalidRequest(string field) =>
        Results.Json(new { error = "invalid_request", field }, statusCode: 400);

    private static ValueTask<object?> NoStore(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        context.HttpContext.Response.Headers.CacheControl = "no-store";
        return next(context);
    }
}

/// <summary>Admin page on the API origin for reviewing join requests (cookie session).</summary>
internal static class JoinRequestAdminPage
{
    internal const string Path = "/auth/admin/join-requests";
    private static readonly CultureInfo DisplayCulture = CultureInfo.GetCultureInfo("en-US");

    public static void Map(WebApplication app)
    {
        var routes = app.MapGroup(Path)
            .RequireAuthorization(GoogleSignIn.AdminPolicy)
            .ExcludeFromDescription();

        routes.MapGet("", ShowAsync);
        routes.MapPost("/{id:guid}/approve", ApproveAsync).AddEndpointFilter(SameOriginGuard.Filter);
        routes.MapPost("/{id:guid}/deny", DenyAsync).AddEndpointFilter(SameOriginGuard.Filter);
    }

    private static async Task<IResult> ShowAsync(HttpContext context, JoinRequestStore store, CancellationToken ct)
    {
        GoogleSignIn.SetPageHeaders(context);
        var all = await store.ListAsync(null, ct);
        var pending = all.Where(request => request.Status == "pending").ToList();
        var decided = all.Where(request => request.Status != "pending")
            .OrderByDescending(request => request.UpdatedAt).Take(25).ToList();
        var duesLink = context.RequestServices.GetService<DuesLedger>() is null
            ? ""
            : $""" · <a href="{DuesAdminPage.Path}">Manage dues</a>""";
        var pendingList = pending.Count == 0
            ? """<p class="empty">No pending requests.</p>"""
            : $"""<ul class="assessment-list">{string.Concat(pending.Select(request => RenderRequest(request, true)))}</ul>""";
        var decidedList = decided.Count == 0
            ? """<p class="empty">No decisions yet.</p>"""
            : $"""<ul class="assessment-list">{string.Concat(decided.Select(request => RenderRequest(request, false)))}</ul>""";

        return GoogleSignIn.RenderPage("Join requests", $"""
            <div class="admin-back"><a href="/auth/account">Back to club account</a>{duesLink}</div>
            <section class="account-header">
              <div>
                <h1>Join requests</h1>
                <p>People who signed in to the app without an invitation and asked to join.</p>
              </div>
              <span class="role">Admin</span>
            </section>
            {RenderNotice(context.Request.Query["notice"])}
            <section class="dues">
              <h2>Pending</h2>
              {pendingList}
            </section>
            <section class="dues">
              <h2>Recently decided</h2>
              {decidedList}
            </section>
            """);
    }

    private static async Task<IResult> ApproveAsync(Guid id, HttpContext context, JoinRequestStore store, CancellationToken ct)
    {
        if (!context.Request.HasFormContentType)
            return ReturnToPage(context, "invalid");
        var form = await context.Request.ReadFormAsync(ct);
        var role = form["role"].ToString();
        if (!ClubInvitations.Roles.Contains(role))
            return ReturnToPage(context, "invalid");
        var (result, _) = await store.ApproveAsync(id, role, context.User.FindFirstValue("email"), ct);
        return ReturnToPage(context, Notice(result, "approved"));
    }

    private static async Task<IResult> DenyAsync(Guid id, HttpContext context, JoinRequestStore store, CancellationToken ct)
    {
        if (!context.Request.HasFormContentType)
            return ReturnToPage(context, "invalid");
        var form = await context.Request.ReadFormAsync(ct);
        var reason = form["reason"].ToString().Trim();
        if (reason.Length > 500)
            return ReturnToPage(context, "invalid");
        var (result, _) = await store.DenyAsync(id, reason.Length == 0 ? null : reason,
            context.User.FindFirstValue("email"), ct);
        return ReturnToPage(context, Notice(result, "denied"));
    }

    private static string Notice(JoinDecisionResult result, string done) => result switch
    {
        JoinDecisionResult.Done => done,
        JoinDecisionResult.NotFound => "missing",
        JoinDecisionResult.Self => "self",
        _ => "not-pending"
    };

    private static IResult ReturnToPage(HttpContext context, string notice)
    {
        context.Response.Headers.Location = $"{Path}?notice={notice}";
        return Results.StatusCode(StatusCodes.Status303SeeOther);
    }

    private static string RenderRequest(JoinRequest request, bool actions)
    {
        var clubZone = TimeZoneInfo.FindSystemTimeZoneById("America/New_York");
        var asked = TimeZoneInfo.ConvertTime(request.CreatedAt, clubZone).ToString("MMM d, yyyy 'at' h:mm tt 'ET'", DisplayCulture);
        var provider = request.Provider == "apple" ? "Apple" : "Google";
        var phone = request.Phone is null ? "" : $"<div><dt>Phone</dt><dd>{Encode(request.Phone)}</dd></div>";
        var message = request.Message is null ? "" : $"<div><dt>Message</dt><dd>{Encode(request.Message)}</dd></div>";
        var status = actions ? "" : $" · {(request.Status == "approved" ? "Approved" : "Denied")}";
        var forms = !actions ? "" : $"""
            <div class="join-actions">
              <form action="{Path}/{request.Id:D}/approve" method="post">
                <label class="admin-field">Role
                  <select name="role">
                    <option value="player" selected>Player</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>
                <button class="button" type="submit">Approve</button>
              </form>
              <form action="{Path}/{request.Id:D}/deny" method="post">
                <label class="admin-field">Reason (optional, not shown to them)
                  <input name="reason" type="text" maxlength="500">
                </label>
                <button class="button button-secondary" type="submit">Deny</button>
              </form>
            </div>
            """;
        return $"""
            <li class="assessment">
              <h3>{Encode(request.Name)}</h3>
              <p class="due-date">{Encode(request.Email)} · {provider} · Asked {asked}{status}</p>
              <dl class="join-details">{phone}{message}</dl>
              {forms}
            </li>
            """;
    }

    private static string RenderNotice(string? notice)
    {
        var message = notice switch
        {
            "approved" => "Request approved. They can sign in now.",
            "denied" => "Request denied. They can ask again after 24 hours.",
            "invalid" => "Choose a role, and keep the reason under 500 characters.",
            "missing" => "This request no longer exists.",
            "not-pending" => "This request was already decided.",
            "self" => "You can't remove your own admin role.",
            _ => ""
        };
        if (message.Length == 0)
            return "";
        var style = notice is "approved" or "denied" ? "" : " notice-error";
        return $"""<p class="checkout-note{style}" role="status">{message}</p>""";
    }

    private static string Encode(string value) => HtmlEncoder.Default.Encode(value);
}
