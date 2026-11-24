using System.Net.Http.Headers;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using Npgsql;

internal sealed record DeleteAccountRequest(string? AppleAuthorizationCode);

internal enum DeletionResult { Deleted, LastAdmin }

/// <summary>
/// Account deletion (App Store guideline 5.1.1(v)) for the signed-in member, from the app
/// (<c>DELETE /v1/me</c> with the bearer token) or the API-hosted account page.
/// </summary>
/// <remarks>
/// In one transaction: revokes every mobile refresh token of the subject, deletes the email's
/// <c>club_invitations</c> row, the join requests for the subject or email, and the
/// <c>club_members</c> row, and cancels the member's pending checkouts that have no Stripe session.
/// Dues assessments, payments and checkouts are kept: they are the club's financial records.
/// An email in the configured bootstrap lists (<c>Authentication:Google:AdminEmails</c> or
/// <c>PlayerEmails</c>) can still sign in afterwards; only the owner can remove it from configuration.
/// </remarks>
internal sealed class AccountDeletion(NpgsqlDataSource dataSource, ClubInvitations invitations,
    IConfiguration configuration, ILogger<AccountDeletion> logger)
{
    /// <summary>Recorded as released_by on checkouts cancelled by a deletion.</summary>
    internal const string ReleasedBy = "account deletion";

    public async Task<DeletionResult> DeleteAsync(string subject, string email, bool isAdmin, CancellationToken ct)
    {
        var normalized = ClubInvitations.Normalize(email);
        await using var connection = await dataSource.OpenConnectionAsync(ct);
        await using var transaction = await connection.BeginTransactionAsync(ct);

        // Serialize deletions so two admins deleting at once can't both pass the last-admin check.
        await using (var serialize = new NpgsqlCommand(
            "SELECT pg_advisory_xact_lock(hashtext('claymores-account-deletion'))", connection, transaction))
            await serialize.ExecuteNonQueryAsync(ct);

        if (isAdmin)
        {
            var configuredAdmins = ClubRoles.ConfiguredEmails(configuration, "AdminEmails")
                .Count(admin => admin != normalized);
            await using var others = new NpgsqlCommand(
                "SELECT count(*) FROM club_invitations WHERE role = 'admin' AND email <> @email", connection, transaction);
            others.Parameters.AddWithValue("email", normalized);
            if (configuredAdmins + (long)(await others.ExecuteScalarAsync(ct))! == 0)
                return DeletionResult.LastAdmin;
        }

        await using (var batch = new NpgsqlBatch(connection, transaction))
        {
            NpgsqlBatchCommand Add(string sql)
            {
                var command = new NpgsqlBatchCommand(sql);
                command.Parameters.AddWithValue("subject", subject);
                command.Parameters.AddWithValue("email", normalized);
                batch.BatchCommands.Add(command);
                return command;
            }
            Add("UPDATE mobile_refresh_tokens SET revoked_at = now() WHERE google_subject = @subject AND revoked_at IS NULL");
            Add("DELETE FROM club_invitations WHERE email = @email");
            Add("DELETE FROM join_requests WHERE subject = @subject OR lower(btrim(email)) = @email");
            Add("DELETE FROM club_members WHERE google_subject = @subject");
            Add("DELETE FROM member_identities WHERE member_subject = @subject");
            Add("""
                UPDATE dues_checkouts SET status = 'expired', released_by = @released_by, released_at = now()
                WHERE status = 'pending' AND stripe_session_id IS NULL
                  AND assessment_id IN (SELECT id FROM dues_assessments WHERE player_subject = @subject)
                """).Parameters.AddWithValue("released_by", ReleasedBy);
            await batch.ExecuteNonQueryAsync(ct);
        }
        await transaction.CommitAsync(ct);
        invitations.Forget(normalized);

        logger.LogInformation("Deleted the club account for {Subject}.", subject);
        if (ClubRoles.ConfiguredEmails(configuration).Contains(normalized))
            logger.LogWarning("{Email} deleted their account but is still in the configured invitation lists " +
                "(Authentication:Google:AdminEmails or PlayerEmails). Remove it from configuration to stop it signing in.",
                normalized);
        return DeletionResult.Deleted;
    }

    public static void Map(WebApplication app)
    {
        app.MapDelete("/v1/me", async (HttpContext context, AccountDeletion deletion, AppleTokenRevocation apple,
                CancellationToken ct) =>
            {
                context.Response.Headers.CacheControl = "no-store";
                DeleteAccountRequest? request = null;
                if (context.Request.ContentLength is > 0 ||
                    (context.Request.ContentLength is null && context.Request.HasJsonContentType()))
                {
                    try
                    {
                        request = await context.Request.ReadFromJsonAsync<DeleteAccountRequest>(ct);
                    }
                    catch (Exception error) when (error is JsonException or InvalidOperationException or BadHttpRequestException)
                    {
                        return Results.Json(new { error = "invalid_request" }, statusCode: 400);
                    }
                }
                return await DeleteAsync(context, deletion, apple, request?.AppleAuthorizationCode, ct) == DeletionResult.LastAdmin
                    ? Results.Json(new { error = "last_admin" }, statusCode: StatusCodes.Status409Conflict)
                    : Results.NoContent();
            })
            .RequireAuthorization(GoogleSignIn.RolePolicy)
            .AddEndpointFilter(SameOriginGuard.Filter)
            .WithTags("Identity")
            .WithSummary("Delete my club account")
            .WithDescription("Revokes every app sign-in and deletes the member record, invitation and join requests. " +
                "Dues records are kept. Optional body: {\"appleAuthorizationCode\":\"...\"} from a fresh Sign in with Apple " +
                "authorization, used to revoke the Apple tokens. 409 last_admin when no other admin would remain.")
            .Accepts<DeleteAccountRequest>("application/json")
            .Produces(204).Produces(400).Produces(401).Produces(403).Produces(409);

        app.MapPost("/auth/account/delete", async (HttpContext context, AccountDeletion deletion,
                AppleTokenRevocation apple, CancellationToken ct) =>
            {
                context.Response.Headers.CacheControl = "no-store";
                var form = context.Request.HasFormContentType ? await context.Request.ReadFormAsync(ct) : null;
                if (form?["confirm"].ToString() != "delete")
                    return SeeOther(context, "/auth/account?deletion=confirm");
                return await DeleteAsync(context, deletion, apple, null, ct) == DeletionResult.LastAdmin
                    ? SeeOther(context, "/auth/account?deletion=last-admin")
                    : SeeOther(context, "/auth/account-deleted");
            })
            .RequireAuthorization(GoogleSignIn.RolePolicy)
            .AddEndpointFilter(SameOriginGuard.Filter)
            .ExcludeFromDescription();

        app.MapGet("/auth/account-deleted", (HttpContext context) =>
            {
                GoogleSignIn.SetPageHeaders(context);
                return GoogleSignIn.RenderPage("Account deleted", """
                    <section class="account-header">
                      <div>
                        <h1>Account deleted</h1>
                        <p>Your club account and app sign-ins are gone. The club keeps its records of dues you were charged and paid.</p>
                      </div>
                    </section>
                    """);
            })
            .ExcludeFromDescription();
    }

    private static async Task<DeletionResult> DeleteAsync(HttpContext context, AccountDeletion deletion,
        AppleTokenRevocation apple, string? appleAuthorizationCode, CancellationToken ct)
    {
        var user = context.User;
        var subject = user.FindFirstValue("sub")!;
        var email = user.FindFirstValue("email")!;
        // Read before deleting: a Google member may have an Apple account linked (migration 016).
        var directory = context.RequestServices.GetService<ClubMemberDirectory>();
        var hasApple = subject.StartsWith(AppleSignIn.SubjectPrefix, StringComparison.Ordinal) ||
                       (directory is not null && (await directory.ProvidersAsync(subject, ct)).Contains("apple"));
        var result = await deletion.DeleteAsync(subject, email, user.IsInRole("admin"), ct);
        if (result == DeletionResult.LastAdmin)
            return result;

        // A browser session cookie, if it authenticated this request, ends here too.
        if ((await context.AuthenticateAsync(GoogleSignIn.Session)).Succeeded)
            await context.SignOutAsync(GoogleSignIn.Session);

        if (hasApple)
            await apple.RevokeAsync(appleAuthorizationCode, CancellationToken.None);
        return result;
    }

    private static IResult SeeOther(HttpContext context, string location)
    {
        context.Response.Headers.Location = location;
        return Results.StatusCode(StatusCodes.Status303SeeOther);
    }
}

/// <summary>Sign in with Apple REST settings for token revocation. Null when not configured.</summary>
/// <param name="ClientId">The app's bundle ID (<c>Authentication:Apple:ClientIds:0</c>).</param>
/// <param name="PrivateKey">The .p8 key contents (PEM). A secret, set only in the Render dashboard.</param>
internal sealed record AppleRevocationSettings(string TeamId, string KeyId, string PrivateKey, string ClientId)
{
    public static AppleRevocationSettings? Read(IConfiguration configuration)
    {
        string? Value(string key) => configuration[key] is { } value && !string.IsNullOrWhiteSpace(value) ? value.Trim() : null;
        var clientId = configuration.GetSection("Authentication:Apple:ClientIds").GetChildren()
            .Select(entry => entry.Value?.Trim()).FirstOrDefault(id => !string.IsNullOrEmpty(id));
        return Value("Authentication:Apple:TeamId") is { } team && Value("Authentication:Apple:KeyId") is { } key &&
               Value("Authentication:Apple:PrivateKey") is { } pem && clientId is not null
            // Dashboard values sometimes arrive with literal \n instead of line breaks.
            ? new(team, key, pem.Replace("\\n", "\n"), clientId)
            : null;
    }
}

internal sealed record AppleTokenResponse(
    [property: JsonPropertyName("access_token")] string? AccessToken,
    [property: JsonPropertyName("refresh_token")] string? RefreshToken);

/// <summary>Apple's Sign in with Apple REST endpoints. Replaced with a fake in tests.</summary>
internal interface IAppleAuthClient
{
    /// <summary>POST https://appleid.apple.com/auth/token (grant_type=authorization_code).</summary>
    Task<AppleTokenResponse> ExchangeCodeAsync(string clientId, string clientSecret, string code, CancellationToken ct);

    /// <summary>POST https://appleid.apple.com/auth/revoke.</summary>
    Task RevokeAsync(string clientId, string clientSecret, string token, string tokenTypeHint, CancellationToken ct);
}

internal sealed class AppleAuthClient(HttpClient client) : IAppleAuthClient
{
    public static void Configure(HttpClient client)
    {
        client.BaseAddress = new Uri("https://appleid.apple.com");
        client.Timeout = TimeSpan.FromSeconds(10);
        client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
    }

    public async Task<AppleTokenResponse> ExchangeCodeAsync(string clientId, string clientSecret, string code, CancellationToken ct)
    {
        using var response = await client.PostAsync("/auth/token", new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["client_id"] = clientId,
            ["client_secret"] = clientSecret,
            ["code"] = code,
            ["grant_type"] = "authorization_code",
        }), ct);
        if (!response.IsSuccessStatusCode)
            throw new HttpRequestException($"Apple /auth/token returned {(int)response.StatusCode}.", null, response.StatusCode);
        return await response.Content.ReadFromJsonAsync<AppleTokenResponse>(ct)
               ?? throw new HttpRequestException("Apple /auth/token returned no body.");
    }

    public async Task RevokeAsync(string clientId, string clientSecret, string token, string tokenTypeHint, CancellationToken ct)
    {
        using var response = await client.PostAsync("/auth/revoke", new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["client_id"] = clientId,
            ["client_secret"] = clientSecret,
            ["token"] = token,
            ["token_type_hint"] = tokenTypeHint,
        }), ct);
        if (!response.IsSuccessStatusCode)
            throw new HttpRequestException($"Apple /auth/revoke returned {(int)response.StatusCode}.", null, response.StatusCode);
    }
}

internal enum AppleRevocationOutcome { Revoked, NotConfigured, NoCode, Failed }

/// <summary>
/// Revokes a deleted member's Sign in with Apple tokens: exchanges the authorization code the app
/// sends (from a fresh Apple authorization) for tokens, then revokes the refresh token (or the access
/// token if Apple returned none). Failures are logged and never block the deletion.
/// </summary>
internal sealed class AppleTokenRevocation(IConfiguration configuration, IAppleAuthClient client,
    ILogger<AppleTokenRevocation> logger)
{
    internal const string Audience = "https://appleid.apple.com";
    private readonly AppleRevocationSettings? _settings = AppleRevocationSettings.Read(configuration);

    public async Task<AppleRevocationOutcome> RevokeAsync(string? authorizationCode, CancellationToken ct)
    {
        if (_settings is null)
        {
            logger.LogInformation("Apple token revocation skipped: set Authentication:Apple:TeamId, KeyId and PrivateKey to enable it.");
            return AppleRevocationOutcome.NotConfigured;
        }
        if (string.IsNullOrWhiteSpace(authorizationCode) || authorizationCode.Length > 4096)
        {
            logger.LogInformation("Apple token revocation skipped: the request had no Apple authorization code.");
            return AppleRevocationOutcome.NoCode;
        }

        try
        {
            var secret = ClientSecret(_settings, DateTimeOffset.UtcNow);
            var tokens = await client.ExchangeCodeAsync(_settings.ClientId, secret, authorizationCode, ct);
            var (token, hint) = tokens.RefreshToken is { Length: > 0 } refresh
                ? (refresh, "refresh_token")
                : tokens.AccessToken is { Length: > 0 } access
                    ? (access, "access_token")
                    : throw new HttpRequestException("Apple /auth/token returned no token.");
            await client.RevokeAsync(_settings.ClientId, secret, token, hint, ct);
            logger.LogInformation("Revoked the deleted member's Apple {Hint}.", hint);
            return AppleRevocationOutcome.Revoked;
        }
        catch (Exception error) when (error is HttpRequestException or TaskCanceledException or JsonException
                                          or CryptographicException or ArgumentException or SecurityTokenException)
        {
            logger.LogWarning(error, "Apple token revocation failed; the account was deleted anyway.");
            return AppleRevocationOutcome.Failed;
        }
    }

    /// <summary>
    /// The client_secret Apple's REST API expects: an ES256 JWT signed with the Sign in with Apple key,
    /// <c>kid</c> = key ID, <c>iss</c> = team ID, <c>sub</c> = client ID, <c>aud</c> = https://appleid.apple.com,
    /// valid for five minutes.
    /// </summary>
    internal static string ClientSecret(AppleRevocationSettings settings, DateTimeOffset now)
    {
        using var ecdsa = ECDsa.Create();
        ecdsa.ImportFromPem(settings.PrivateKey);
        var handler = new JsonWebTokenHandler { SetDefaultTimesOnTokenCreation = false };
        return handler.CreateToken(new SecurityTokenDescriptor
        {
            Issuer = settings.TeamId,
            Audience = Audience,
            IssuedAt = now.UtcDateTime,
            Expires = now.AddMinutes(5).UtcDateTime,
            Claims = new Dictionary<string, object> { ["sub"] = settings.ClientId },
            // No provider caching: the ECDsa instance is disposed after this call.
            SigningCredentials = new SigningCredentials(new ECDsaSecurityKey(ecdsa)
            {
                KeyId = settings.KeyId,
                CryptoProviderFactory = new CryptoProviderFactory { CacheSignatureProviders = false },
            }, SecurityAlgorithms.EcdsaSha256),
        });
    }
}
