using System.Buffers.Text;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;
using Npgsql;

/// <summary>
/// Sign-in for the Flutter app. The app sends the Google ID token from native Google
/// sign-in; the API checks it, resolves the club role, and issues its own short-lived
/// access token (HMAC JWT) plus a rotating refresh token stored hashed in Postgres.
/// </summary>
internal static class MobileAuth
{
    /// <summary>Authentication scheme for access tokens this API issues.</summary>
    internal const string Scheme = "ClubToken";
    /// <summary>Default scheme: forwards bearer tokens to <see cref="Scheme"/> or the external authority.</summary>
    internal const string ApiBearer = "ApiBearer";
    internal const string Issuer = "claymores-api";
    internal const string RoleClaim = "role";

    public static bool IsEnabled(IConfiguration configuration) => configuration.GetValue<bool>("MobileAuth:Enabled");

    public static void Configure(AuthenticationBuilder authentication, IConfiguration configuration)
    {
        var settings = MobileAuthSettings.Read(configuration);
        var services = authentication.Services;
        services.AddSingleton(settings);
        services.AddSingleton<MobileTokens>();
        services.AddSingleton<MobileSessionStore>();
        services.AddSingleton<IGoogleIdTokenValidator, GoogleIdTokenValidator>();

        authentication.AddJwtBearer(Scheme, options =>
        {
            options.MapInboundClaims = false;
            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidIssuer = Issuer,
                ValidAudience = Issuer,
                IssuerSigningKey = new SymmetricSecurityKey(settings.SigningKey),
                ValidAlgorithms = [SecurityAlgorithms.HmacSha256],
                RequireExpirationTime = true,
                NameClaimType = "name",
                RoleClaimType = RoleClaim,
                ClockSkew = TimeSpan.FromSeconds(30),
            };
            options.Events = new JwtBearerEvents
            {
                // Like the cookie's OnValidatePrincipal: re-check the invitation on every request
                // (ClubInvitations caches lookups for 30 seconds).
                OnTokenValidated = async context =>
                {
                    var identity = context.Principal?.Identity as ClaimsIdentity;
                    var role = await ClubRoles.ResolveAsync(context.Principal, configuration,
                        context.HttpContext.RequestServices.GetService<ClubInvitations>(), context.HttpContext.RequestAborted);
                    if (identity is null || role is null)
                    {
                        context.Fail("This account is no longer invited.");
                        return;
                    }
                    foreach (var stale in identity.FindAll(RoleClaim).ToArray())
                        identity.RemoveClaim(stale);
                    identity.AddClaim(new Claim(RoleClaim, role));
                }
            };
        });

        authentication.AddPolicyScheme(ApiBearer, null, options => options.ForwardDefaultSelector = SelectBearerScheme);
        services.Configure<AuthenticationOptions>(options => options.DefaultScheme = ApiBearer);
    }

    private static string SelectBearerScheme(HttpContext context)
    {
        var header = context.Request.Headers.Authorization.ToString();
        if (header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            var token = header["Bearer ".Length..].Trim();
            var handler = new JsonWebTokenHandler();
            try
            {
                if (handler.CanReadToken(token) && handler.ReadJsonWebToken(token).Issuer == Issuer)
                    return Scheme;
            }
            catch (ArgumentException)
            {
            }
        }
        return JwtBearerDefaults.AuthenticationScheme;
    }

    internal static ClaimsPrincipal VerifiedPrincipal(ClubMember member) => new(new ClaimsIdentity(
    [
        new Claim("sub", member.Subject),
        new Claim("email", member.Email),
        new Claim("email_verified", "true"),
    ], "mobile"));

    public static void Map(WebApplication app)
    {
        var group = app.MapGroup("/v1/auth/mobile").WithTags("Mobile sign-in").AllowAnonymous();
        group.AddEndpointFilter(async (context, next) =>
        {
            context.HttpContext.Response.Headers.CacheControl = "no-store";
            return await next(context);
        });

        group.MapPost("/google", async (MobileGoogleSignInRequest request, IGoogleIdTokenValidator validator,
                ClubMemberDirectory directory, MobileSessionStore sessions, MobileTokens tokens,
                IConfiguration configuration, HttpContext context, CancellationToken ct) =>
            {
                var google = string.IsNullOrWhiteSpace(request.IdToken) ? null : await validator.ValidateAsync(request.IdToken, ct);
                if (google is null || !google.EmailVerified)
                    return InvalidToken();

                var member = new ClubMember(google.Subject, google.Email, google.Name);
                var role = await ClubRoles.ResolveAsync(VerifiedPrincipal(member), configuration,
                    context.RequestServices.GetService<ClubInvitations>(), ct);
                if (role is null)
                    return NotInvited();

                await directory.ObserveSignInAsync(member, ct);
                var refresh = await sessions.StartAsync(member, ct);
                return Results.Ok(tokens.Issue(member, role, refresh));
            })
            .WithSummary("Exchange a Google ID token from the app for API tokens")
            .Produces<MobileTokenResponse>().Produces(401).Produces(403);

        group.MapPost("/refresh", async (MobileRefreshRequest request, MobileSessionStore sessions, MobileTokens tokens,
                IConfiguration configuration, HttpContext context, ILogger<MobileSessionStore> logger, CancellationToken ct) =>
            {
                if (string.IsNullOrWhiteSpace(request.RefreshToken))
                    return InvalidToken();
                var rotation = await sessions.RotateAsync(request.RefreshToken, ct);
                if (rotation.ReuseDetected)
                    logger.LogWarning("A revoked refresh token was reused; its session family was revoked.");
                if (rotation.Session is not { } session)
                    return InvalidToken();

                var role = await ClubRoles.ResolveAsync(VerifiedPrincipal(session.Member), configuration,
                    context.RequestServices.GetService<ClubInvitations>(), ct);
                if (role is null)
                {
                    await sessions.RevokeFamilyAsync(session.FamilyId, ct);
                    return NotInvited();
                }
                return Results.Ok(tokens.Issue(session.Member, role, session.RefreshToken));
            })
            .WithSummary("Rotate a refresh token and get a new access token")
            .Produces<MobileTokenResponse>().Produces(401).Produces(403);

        group.MapPost("/logout", async (MobileRefreshRequest request, MobileSessionStore sessions, CancellationToken ct) =>
            {
                if (!string.IsNullOrWhiteSpace(request.RefreshToken))
                    await sessions.RevokeAsync(request.RefreshToken, ct);
                return Results.NoContent();
            })
            .WithSummary("Sign the app out by revoking its refresh token")
            .Produces(204);
    }

    private static IResult InvalidToken() => Results.Json(new { error = "invalid_token" }, statusCode: 401);
    private static IResult NotInvited() => Results.Json(new { error = "not_invited" }, statusCode: 403);
}

internal sealed record MobileGoogleSignInRequest(string? IdToken);
internal sealed record MobileRefreshRequest(string? RefreshToken);
internal sealed record MobileUser(string Subject, string? Name, string Email, string Role);
internal sealed record MobileTokenResponse(
    string AccessToken, DateTimeOffset AccessTokenExpiresAt, string RefreshToken, MobileUser User);

internal sealed record MobileAuthSettings(byte[] SigningKey, string[] GoogleAudiences)
{
    public static MobileAuthSettings Read(IConfiguration configuration)
    {
        byte[] key;
        try
        {
            key = Convert.FromBase64String(configuration["Authentication:Tokens:SigningKey"] ?? "");
        }
        catch (FormatException)
        {
            key = [];
        }
        if (key.Length < 32)
            throw new InvalidOperationException(
                "Mobile sign-in needs Authentication:Tokens:SigningKey: base64 for at least 32 random bytes.");

        var audiences = configuration.GetSection("Authentication:Google:MobileClientIds").GetChildren()
            .Select(entry => entry.Value?.Trim())
            .Append(configuration["Authentication:Google:ClientId"]?.Trim())
            .OfType<string>()
            .Where(id => id.Length > 0)
            .Distinct(StringComparer.Ordinal)
            .ToArray();
        if (audiences.Length == 0)
            throw new InvalidOperationException("Mobile sign-in needs at least one Google client ID.");
        return new(key, audiences);
    }
}

/// <summary>Issues API access tokens.</summary>
internal sealed class MobileTokens(MobileAuthSettings settings)
{
    internal static readonly TimeSpan AccessTokenLifetime = TimeSpan.FromHours(1);
    private readonly JsonWebTokenHandler _handler = new();
    private readonly SigningCredentials _credentials =
        new(new SymmetricSecurityKey(settings.SigningKey), SecurityAlgorithms.HmacSha256);

    public MobileTokenResponse Issue(ClubMember member, string role, string refreshToken)
    {
        var now = DateTime.UtcNow;
        var expires = now.Add(AccessTokenLifetime);
        var claims = new Dictionary<string, object>
        {
            ["sub"] = member.Subject,
            ["email"] = member.Email,
            ["email_verified"] = true,
            [MobileAuth.RoleClaim] = role,
            ["jti"] = Guid.NewGuid().ToString("N"),
        };
        if (member.Name is not null)
            claims["name"] = member.Name;

        var token = _handler.CreateToken(new SecurityTokenDescriptor
        {
            Issuer = MobileAuth.Issuer,
            Audience = MobileAuth.Issuer,
            IssuedAt = now,
            NotBefore = now,
            Expires = expires,
            Claims = claims,
            SigningCredentials = _credentials,
        });
        return new(token, new DateTimeOffset(expires, TimeSpan.Zero), refreshToken,
            new MobileUser(member.Subject, member.Name, member.Email, role));
    }
}

internal sealed record GoogleIdentity(string Subject, string Email, bool EmailVerified, string? Name);

/// <summary>Validates Google ID tokens. Replaced with a fake in tests.</summary>
internal interface IGoogleIdTokenValidator
{
    /// <returns>The identity, or null when the token is not a valid Google ID token for a configured client.</returns>
    Task<GoogleIdentity?> ValidateAsync(string idToken, CancellationToken ct);
}

internal sealed class GoogleIdTokenValidator : IGoogleIdTokenValidator
{
    private readonly IConfigurationManager<OpenIdConnectConfiguration> _metadata;
    private readonly JsonWebTokenHandler _handler = new();
    private readonly MobileAuthSettings _settings;

    public GoogleIdTokenValidator(MobileAuthSettings settings) : this(settings,
        new ConfigurationManager<OpenIdConnectConfiguration>(
            "https://accounts.google.com/.well-known/openid-configuration",
            new OpenIdConnectConfigurationRetriever(),
            new HttpDocumentRetriever { RequireHttps = true }))
    {
    }

    /// <summary>Tests pass Google-shaped metadata with their own signing key.</summary>
    internal GoogleIdTokenValidator(MobileAuthSettings settings, IConfigurationManager<OpenIdConnectConfiguration> metadata)
    {
        _settings = settings;
        _metadata = metadata;
    }

    public async Task<GoogleIdentity?> ValidateAsync(string idToken, CancellationToken ct)
    {
        if (idToken.Length > 16 * 1024 || !_handler.CanReadToken(idToken))
            return null;

        var result = await ValidateWithKeysAsync(idToken, ct);
        if (result.Exception is SecurityTokenSignatureKeyNotFoundException)
        {
            // Google rotated its keys since we cached them.
            _metadata.RequestRefresh();
            result = await ValidateWithKeysAsync(idToken, ct);
        }
        if (!result.IsValid)
            return null;

        object? Claim(string name) => result.Claims.TryGetValue(name, out var value) ? value : null;
        if (Claim("sub") is not string subject || subject.Length is < 1 or > 255 ||
            Claim("email") is not string email || email.Length is < 3 or > 320)
            return null;
        var verified = Claim("email_verified") switch
        {
            bool value => value,
            string text => bool.TryParse(text, out var parsed) && parsed,
            _ => false
        };
        return new(subject, email, verified, Claim("name") as string);
    }

    private async Task<TokenValidationResult> ValidateWithKeysAsync(string idToken, CancellationToken ct)
    {
        OpenIdConnectConfiguration configuration;
        try
        {
            configuration = await _metadata.GetConfigurationAsync(ct);
        }
        catch (InvalidOperationException error)
        {
            throw new HttpRequestException("Google signing keys are unavailable.", error);
        }
        return await _handler.ValidateTokenAsync(idToken, new TokenValidationParameters
        {
            ValidIssuers = ["https://accounts.google.com", "accounts.google.com"],
            ValidAudiences = _settings.GoogleAudiences,
            IssuerSigningKeys = configuration.SigningKeys,
            ValidAlgorithms = [SecurityAlgorithms.RsaSha256],
            RequireSignedTokens = true,
            RequireExpirationTime = true,
            ClockSkew = TimeSpan.FromMinutes(2),
        });
    }
}

internal sealed record RefreshSession(ClubMember Member, Guid FamilyId, string RefreshToken);
internal sealed record RefreshRotation(RefreshSession? Session, bool ReuseDetected = false);

/// <summary>
/// Refresh tokens: 32 random bytes (base64url), stored as SHA-256 hashes in
/// <c>mobile_refresh_tokens</c>. Each use rotates the token; presenting an already
/// rotated or revoked token revokes its whole family.
/// </summary>
internal sealed class MobileSessionStore(NpgsqlDataSource dataSource)
{
    internal static readonly TimeSpan RefreshTokenLifetime = TimeSpan.FromDays(60);

    public async Task<string> StartAsync(ClubMember member, CancellationToken ct)
    {
        var token = NewToken();
        await using var connection = await dataSource.OpenConnectionAsync(ct);
        await InsertAsync(connection, null, Guid.NewGuid(), Guid.NewGuid(), token, member, ct);
        return token;
    }

    public async Task<RefreshRotation> RotateAsync(string token, CancellationToken ct)
    {
        await using var connection = await dataSource.OpenConnectionAsync(ct);
        await using var tx = await connection.BeginTransactionAsync(ct);
        Guid id, family;
        ClubMember member;
        bool revoked, expired;
        await using (var find = new NpgsqlCommand("""
            SELECT id, family_id, google_subject, email, display_name,
                   revoked_at IS NOT NULL, expires_at <= now()
            FROM mobile_refresh_tokens WHERE token_hash = @hash FOR UPDATE
            """, connection, tx))
        {
            find.Parameters.AddWithValue("hash", Hash(token));
            await using var reader = await find.ExecuteReaderAsync(ct);
            if (!await reader.ReadAsync(ct))
                return new(null);
            id = reader.GetGuid(0);
            family = reader.GetGuid(1);
            member = new ClubMember(reader.GetString(2), reader.GetString(3), reader.IsDBNull(4) ? null : reader.GetString(4));
            revoked = reader.GetBoolean(5);
            expired = reader.GetBoolean(6);
        }

        if (revoked)
        {
            await RevokeFamilyAsync(connection, tx, family, ct);
            await tx.CommitAsync(ct);
            return new(null, ReuseDetected: true);
        }
        if (expired)
            return new(null);

        var next = Guid.NewGuid();
        await using (var revoke = new NpgsqlCommand(
            "UPDATE mobile_refresh_tokens SET revoked_at = now(), replaced_by = @next WHERE id = @id", connection, tx))
        {
            revoke.Parameters.AddWithValue("id", id);
            revoke.Parameters.AddWithValue("next", next);
            await revoke.ExecuteNonQueryAsync(ct);
        }
        var nextToken = NewToken();
        await InsertAsync(connection, tx, next, family, nextToken, member, ct);
        await tx.CommitAsync(ct);
        return new(new RefreshSession(member, family, nextToken));
    }

    /// <summary>Revokes the family the token belongs to (sign-out). Unknown tokens are ignored.</summary>
    public async Task RevokeAsync(string token, CancellationToken ct)
    {
        await using var command = dataSource.CreateCommand("""
            UPDATE mobile_refresh_tokens SET revoked_at = now()
            WHERE revoked_at IS NULL AND family_id =
                (SELECT family_id FROM mobile_refresh_tokens WHERE token_hash = @hash)
            """);
        command.Parameters.AddWithValue("hash", Hash(token));
        await command.ExecuteNonQueryAsync(ct);
    }

    public async Task RevokeFamilyAsync(Guid family, CancellationToken ct)
    {
        await using var connection = await dataSource.OpenConnectionAsync(ct);
        await RevokeFamilyAsync(connection, null, family, ct);
    }

    private static async Task RevokeFamilyAsync(NpgsqlConnection connection, NpgsqlTransaction? tx, Guid family,
        CancellationToken ct)
    {
        await using var command = new NpgsqlCommand(
            "UPDATE mobile_refresh_tokens SET revoked_at = now() WHERE family_id = @family AND revoked_at IS NULL",
            connection, tx);
        command.Parameters.AddWithValue("family", family);
        await command.ExecuteNonQueryAsync(ct);
    }

    private static async Task InsertAsync(NpgsqlConnection connection, NpgsqlTransaction? tx, Guid id, Guid family,
        string token, ClubMember member, CancellationToken ct)
    {
        await using var insert = new NpgsqlCommand("""
            INSERT INTO mobile_refresh_tokens (id, family_id, token_hash, google_subject, email, display_name, expires_at)
            VALUES (@id, @family, @hash, @subject, @email, @name, now() + @lifetime)
            """, connection, tx);
        insert.Parameters.AddWithValue("id", id);
        insert.Parameters.AddWithValue("family", family);
        insert.Parameters.AddWithValue("hash", Hash(token));
        insert.Parameters.AddWithValue("subject", member.Subject);
        insert.Parameters.AddWithValue("email", member.Email.Trim());
        insert.Parameters.Add("name", NpgsqlTypes.NpgsqlDbType.Text).Value = (object?)member.Name ?? DBNull.Value;
        insert.Parameters.AddWithValue("lifetime", RefreshTokenLifetime);
        await insert.ExecuteNonQueryAsync(ct);
    }

    internal static byte[] Hash(string token) => SHA256.HashData(Encoding.UTF8.GetBytes(token));

    private static string NewToken() => Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(32));
}
