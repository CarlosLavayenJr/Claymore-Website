using System.Security.Cryptography;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace Claymores.Api.Tests;

/// <summary>The real Google ID-token validator, with a local RSA key standing in for Google's JWKS.</summary>
public sealed class GoogleIdTokenValidatorTests
{
    private static readonly RsaSecurityKey GoogleKey = new(RSA.Create(2048)) { KeyId = "google-test" };
    private static readonly MobileAuthSettings Settings = new(new byte[32], ["ios-client", "web-client"], []);

    private static GoogleIdTokenValidator Validator()
    {
        var metadata = new OpenIdConnectConfiguration { Issuer = "https://accounts.google.com" };
        metadata.SigningKeys.Add(GoogleKey);
        return new GoogleIdTokenValidator(Settings, new StaticConfigurationManager<OpenIdConnectConfiguration>(metadata));
    }

    private static string Token(string audience = "ios-client", string issuer = "https://accounts.google.com",
        object? emailVerified = null, DateTime? expires = null, SecurityKey? key = null, string algorithm = SecurityAlgorithms.RsaSha256)
    {
        var expiry = expires ?? DateTime.UtcNow.AddHours(1);
        return new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = issuer,
            Audience = audience,
            IssuedAt = expiry.AddHours(-1),
            NotBefore = expiry.AddHours(-1),
            Expires = expiry,
            Claims = new Dictionary<string, object>
            {
                ["sub"] = "1234567890",
                ["email"] = "player@example.com",
                ["email_verified"] = emailVerified ?? true,
                ["name"] = "Pat Player",
            },
            SigningCredentials = new SigningCredentials(key ?? GoogleKey, algorithm),
        });
    }

    [Theory]
    [InlineData("ios-client", "https://accounts.google.com")]
    [InlineData("web-client", "accounts.google.com")]
    public async Task Accepts_google_tokens_for_configured_clients(string audience, string issuer)
    {
        var identity = await Validator().ValidateAsync(Token(audience, issuer), TestContext.Current.CancellationToken);
        Assert.Equal(new GoogleIdentity("1234567890", "player@example.com", true, "Pat Player"), identity);
    }

    [Fact]
    public async Task Reports_unverified_email()
    {
        var ct = TestContext.Current.CancellationToken;
        Assert.False((await Validator().ValidateAsync(Token(emailVerified: false), ct))!.EmailVerified);
        Assert.True((await Validator().ValidateAsync(Token(emailVerified: "true"), ct))!.EmailVerified);
    }

    [Fact]
    public async Task Rejects_wrong_audience_issuer_key_algorithm_or_expiry()
    {
        var ct = TestContext.Current.CancellationToken;
        var validator = Validator();
        Assert.Null(await validator.ValidateAsync(Token(audience: "someone-elses-client"), ct));
        Assert.Null(await validator.ValidateAsync(Token(issuer: "https://evil.example.com"), ct));
        Assert.Null(await validator.ValidateAsync(Token(expires: DateTime.UtcNow.AddMinutes(-10)), ct));
        Assert.Null(await validator.ValidateAsync(
            Token(key: new RsaSecurityKey(RSA.Create(2048)) { KeyId = "google-test" }), ct));
        Assert.Null(await validator.ValidateAsync(
            Token(key: new SymmetricSecurityKey(new byte[32]), algorithm: SecurityAlgorithms.HmacSha256), ct));
        Assert.Null(await validator.ValidateAsync("not-a-jwt", ct));
    }
}
