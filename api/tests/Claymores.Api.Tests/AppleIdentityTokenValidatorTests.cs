using System.Security.Cryptography;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Tokens;

namespace Claymores.Api.Tests;

/// <summary>The real Apple identity-token validator, with a local RSA key standing in for Apple's JWKS.</summary>
public sealed class AppleIdentityTokenValidatorTests
{
    private const string BundleId = "com.claymoresrfc.claymores";
    private const string RawNonce = "raw-nonce-0123456789";
    private static readonly RsaSecurityKey AppleKey = new(RSA.Create(2048)) { KeyId = "apple-test" };
    private static readonly MobileAuthSettings Settings = new(new byte[32], ["google-client"], [BundleId]);

    private static AppleIdentityTokenValidator Validator(MobileAuthSettings? settings = null)
    {
        var keys = new JsonWebKeySet();
        keys.Keys.Add(JsonWebKeyConverter.ConvertFromRSASecurityKey(AppleKey));
        return new AppleIdentityTokenValidator(settings ?? Settings, new StaticConfigurationManager<JsonWebKeySet>(keys));
    }

    private static string Token(string audience = BundleId, string issuer = "https://appleid.apple.com",
        object? emailVerified = null, string? nonce = null, DateTime? expires = null, SecurityKey? key = null,
        string algorithm = SecurityAlgorithms.RsaSha256, string email = "player@example.com")
    {
        var expiry = expires ?? DateTime.UtcNow.AddMinutes(10);
        return new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = issuer,
            Audience = audience,
            IssuedAt = expiry.AddMinutes(-10),
            NotBefore = expiry.AddMinutes(-10),
            Expires = expiry,
            Claims = new Dictionary<string, object>
            {
                ["sub"] = "001234.abcdef0123456789.0123",
                ["email"] = email,
                ["email_verified"] = emailVerified ?? "true",
                ["nonce"] = nonce ?? AppleSignIn.HashNonce(RawNonce),
                ["nonce_supported"] = true,
            },
            SigningCredentials = new SigningCredentials(key ?? AppleKey, algorithm),
        });
    }

    [Fact]
    public void Nonce_hash_is_lowercase_hex_sha256()
    {
        // Same as sha256.convert(utf8.encode(rawNonce)).toString() in Dart.
        Assert.Equal("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824", AppleSignIn.HashNonce("hello"));
    }

    [Fact]
    public async Task Accepts_apple_tokens_for_the_bundle_id()
    {
        var identity = await Validator().ValidateAsync(Token(), RawNonce, TestContext.Current.CancellationToken);
        Assert.Equal(new AppleIdentity("001234.abcdef0123456789.0123", "player@example.com", true), identity);
    }

    [Fact]
    public async Task Reads_email_verified_as_string_or_bool()
    {
        var ct = TestContext.Current.CancellationToken;
        Assert.True((await Validator().ValidateAsync(Token(emailVerified: true), RawNonce, ct))!.EmailVerified);
        Assert.True((await Validator().ValidateAsync(Token(emailVerified: "true"), RawNonce, ct))!.EmailVerified);
        Assert.False((await Validator().ValidateAsync(Token(emailVerified: false), RawNonce, ct))!.EmailVerified);
        Assert.False((await Validator().ValidateAsync(Token(emailVerified: "false"), RawNonce, ct))!.EmailVerified);
    }

    [Fact]
    public async Task Rejects_wrong_audience_issuer_key_algorithm_or_expiry()
    {
        var ct = TestContext.Current.CancellationToken;
        var validator = Validator();
        Assert.Null(await validator.ValidateAsync(Token(audience: "com.someone.else"), RawNonce, ct));
        Assert.Null(await validator.ValidateAsync(Token(issuer: "https://accounts.google.com"), RawNonce, ct));
        Assert.Null(await validator.ValidateAsync(Token(expires: DateTime.UtcNow.AddMinutes(-10)), RawNonce, ct));
        Assert.Null(await validator.ValidateAsync(
            Token(key: new RsaSecurityKey(RSA.Create(2048)) { KeyId = "apple-test" }), RawNonce, ct));
        Assert.Null(await validator.ValidateAsync(
            Token(key: new RsaSecurityKey(RSA.Create(2048)) { KeyId = "unknown-kid" }), RawNonce, ct));
        Assert.Null(await validator.ValidateAsync(
            Token(key: new SymmetricSecurityKey(new byte[32]), algorithm: SecurityAlgorithms.HmacSha256), RawNonce, ct));
        Assert.Null(await validator.ValidateAsync("not-a-jwt", RawNonce, ct));
    }

    [Fact]
    public async Task Rejects_nonce_mismatch()
    {
        var ct = TestContext.Current.CancellationToken;
        var validator = Validator();
        Assert.Null(await validator.ValidateAsync(Token(), "some-other-nonce", ct));
        // The raw nonce itself in the token (not its hash) is a mismatch too.
        Assert.Null(await validator.ValidateAsync(Token(nonce: RawNonce), RawNonce, ct));
    }

    [Fact]
    public async Task Rejects_everything_without_configured_client_ids()
    {
        var validator = Validator(new MobileAuthSettings(new byte[32], ["google-client"], []));
        Assert.Null(await validator.ValidateAsync(Token(), RawNonce, TestContext.Current.CancellationToken));
    }

    [Fact]
    public async Task Refreshes_keys_once_for_an_unknown_kid()
    {
        var ct = TestContext.Current.CancellationToken;
        var rotated = new RsaSecurityKey(RSA.Create(2048)) { KeyId = "apple-rotated" };
        var keys = new RotatingKeys(AppleKey, rotated);
        var validator = new AppleIdentityTokenValidator(Settings, keys);

        Assert.NotNull(await validator.ValidateAsync(Token(key: rotated), RawNonce, ct));
        Assert.Equal(1, keys.Refreshes);
    }

    /// <summary>Serves the old key until a refresh is requested, then the new one.</summary>
    private sealed class RotatingKeys(RsaSecurityKey before, RsaSecurityKey after) : IConfigurationManager<JsonWebKeySet>
    {
        public int Refreshes { get; private set; }

        public Task<JsonWebKeySet> GetConfigurationAsync(CancellationToken cancel)
        {
            var set = new JsonWebKeySet();
            set.Keys.Add(JsonWebKeyConverter.ConvertFromRSASecurityKey(Refreshes == 0 ? before : after));
            return Task.FromResult(set);
        }

        public void RequestRefresh() => Refreshes++;
    }
}
