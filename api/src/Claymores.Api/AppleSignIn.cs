using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Tokens;

/// <summary>
/// Sign in with Apple for the Flutter app (App Store guideline 4.8). The app sends the
/// identity token from native Apple sign-in and the raw nonce it hashed for Apple; the
/// API checks both, resolves the club role by email, and issues the same API tokens as
/// Google sign-in. Apple subjects are stored as <c>apple|{sub}</c>.
/// </summary>
internal static class AppleSignIn
{
    internal const string SubjectPrefix = "apple|";
    internal const string RelayDomain = "@privaterelay.appleid.com";
    private const int MaxNameLength = 200;

    public static void Map(RouteGroupBuilder group)
    {
        group.MapPost("/apple", async (MobileAppleSignInRequest request, IAppleIdentityTokenValidator validator,
                ClubMemberDirectory directory, MobileSessionStore sessions, MobileTokens tokens,
                IConfiguration configuration, HttpContext context, CancellationToken ct) =>
            {
                if (string.IsNullOrWhiteSpace(request.IdentityToken) || string.IsNullOrEmpty(request.RawNonce) ||
                    request.RawNonce.Length > 512)
                    return InvalidToken();
                var apple = await validator.ValidateAsync(request.IdentityToken, request.RawNonce, ct);
                if (apple is null || !apple.EmailVerified)
                    return InvalidToken();

                var member = new ClubMember(SubjectPrefix + apple.Subject, apple.Email, CleanName(request.FullName));
                var role = await ClubRoles.ResolveAsync(MobileAuth.VerifiedPrincipal(member), configuration,
                    context.RequestServices.GetService<ClubInvitations>(), ct);
                if (role is null)
                {
                    // A "Hide My Email" relay address can't match an invitation for the member's
                    // real address. Return it so the app can show it and an admin can invite it.
                    return IsRelayEmail(apple.Email)
                        ? Results.Json(new { error = "not_invited", email = apple.Email }, statusCode: 403)
                        : Results.Json(new { error = "not_invited" }, statusCode: 403);
                }

                // Apple only sends the name on the first authorization: keep the stored one otherwise.
                var name = await directory.ObserveSignInAsync(member, ct, keepExistingName: true);
                member = member with { Name = name };
                var refresh = await sessions.StartAsync(member, ct);
                return Results.Ok(tokens.Issue(member, role, refresh));
            })
            .WithSummary("Exchange an Apple identity token from the app for API tokens")
            .Produces<MobileTokenResponse>().Produces(401).Produces(403);
    }

    internal static bool IsRelayEmail(string email) =>
        email.Trim().EndsWith(RelayDomain, StringComparison.OrdinalIgnoreCase);

    /// <summary>Lowercase hex SHA-256 of the raw nonce, as the app passes it to Apple.</summary>
    internal static string HashNonce(string rawNonce) =>
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(rawNonce)));

    private static string? CleanName(string? fullName)
    {
        var name = fullName?.Trim();
        if (string.IsNullOrEmpty(name)) return null;
        return name.Length > MaxNameLength ? name[..MaxNameLength] : name;
    }

    private static IResult InvalidToken() => Results.Json(new { error = "invalid_token" }, statusCode: 401);
}

internal sealed record MobileAppleSignInRequest(string? IdentityToken, string? RawNonce, string? FullName);

/// <param name="Subject">Apple's subject, without the <c>apple|</c> prefix.</param>
internal sealed record AppleIdentity(string Subject, string Email, bool EmailVerified);

/// <summary>Validates Apple identity tokens. Replaced with a fake in tests.</summary>
internal interface IAppleIdentityTokenValidator
{
    /// <returns>
    /// The identity, or null when the token isn't a valid Apple identity token for a configured
    /// client or its nonce isn't the SHA-256 of <paramref name="rawNonce"/>.
    /// </returns>
    Task<AppleIdentity?> ValidateAsync(string identityToken, string rawNonce, CancellationToken ct);
}

internal sealed class AppleIdentityTokenValidator : IAppleIdentityTokenValidator
{
    internal const string AppleIssuer = "https://appleid.apple.com";
    private readonly IConfigurationManager<JsonWebKeySet> _keys;
    private readonly JsonWebTokenHandler _handler = new();
    private readonly MobileAuthSettings _settings;

    public AppleIdentityTokenValidator(MobileAuthSettings settings) : this(settings,
        new ConfigurationManager<JsonWebKeySet>(
            "https://appleid.apple.com/auth/keys",
            new JwksRetriever(),
            new HttpDocumentRetriever { RequireHttps = true }))
    {
    }

    /// <summary>Tests pass their own signing keys.</summary>
    internal AppleIdentityTokenValidator(MobileAuthSettings settings, IConfigurationManager<JsonWebKeySet> keys)
    {
        _settings = settings;
        _keys = keys;
    }

    public async Task<AppleIdentity?> ValidateAsync(string identityToken, string rawNonce, CancellationToken ct)
    {
        if (_settings.AppleAudiences.Length == 0 || identityToken.Length > 16 * 1024 ||
            !_handler.CanReadToken(identityToken))
            return null;

        var result = await ValidateWithKeysAsync(identityToken, ct);
        if (result.Exception is SecurityTokenSignatureKeyNotFoundException)
        {
            // Apple rotated its keys since we cached them.
            _keys.RequestRefresh();
            result = await ValidateWithKeysAsync(identityToken, ct);
        }
        if (!result.IsValid)
            return null;

        object? Claim(string name) => result.Claims.TryGetValue(name, out var value) ? value : null;
        if (Claim("nonce") is not string nonce ||
            !string.Equals(nonce, AppleSignIn.HashNonce(rawNonce), StringComparison.OrdinalIgnoreCase))
            return null;
        if (Claim("sub") is not string subject || subject.Length is < 1 or > 200 ||
            Claim("email") is not string email || email.Length is < 3 or > 320)
            return null;
        var verified = Claim("email_verified") switch
        {
            bool value => value,
            string text => bool.TryParse(text, out var parsed) && parsed,
            _ => false
        };
        return new(subject, email, verified);
    }

    private async Task<TokenValidationResult> ValidateWithKeysAsync(string identityToken, CancellationToken ct)
    {
        JsonWebKeySet keys;
        try
        {
            keys = await _keys.GetConfigurationAsync(ct);
        }
        catch (InvalidOperationException error)
        {
            throw new HttpRequestException("Apple signing keys are unavailable.", error);
        }
        return await _handler.ValidateTokenAsync(identityToken, new TokenValidationParameters
        {
            ValidIssuer = AppleIssuer,
            ValidAudiences = _settings.AppleAudiences,
            IssuerSigningKeys = keys.GetSigningKeys(),
            ValidAlgorithms = [SecurityAlgorithms.RsaSha256],
            RequireSignedTokens = true,
            RequireExpirationTime = true,
            ClockSkew = TimeSpan.FromMinutes(2),
        });
    }

    /// <summary>Reads a bare JWKS document (Apple publishes its keys at /auth/keys).</summary>
    private sealed class JwksRetriever : IConfigurationRetriever<JsonWebKeySet>
    {
        public async Task<JsonWebKeySet> GetConfigurationAsync(string address, IDocumentRetriever retriever,
            CancellationToken cancel) =>
            new(await retriever.GetDocumentAsync(address, cancel));
    }
}
