using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Claymores.Api.Tests;

/// <summary>Records Apple REST calls instead of making them.</summary>
internal sealed class FakeAppleAuth : IAppleAuthClient
{
    public ConcurrentQueue<(string ClientId, string Secret, string Code)> Exchanges { get; } = new();
    public ConcurrentQueue<(string ClientId, string Secret, string Token, string Hint)> Revocations { get; } = new();
    public bool Fail { get; set; }

    public Task<AppleTokenResponse> ExchangeCodeAsync(string clientId, string clientSecret, string code, CancellationToken ct)
    {
        Exchanges.Enqueue((clientId, clientSecret, code));
        return Fail
            ? Task.FromException<AppleTokenResponse>(new HttpRequestException("invalid_grant", null, HttpStatusCode.BadRequest))
            : Task.FromResult(new AppleTokenResponse("apple-access-" + code, "apple-refresh-" + code));
    }

    public Task RevokeAsync(string clientId, string clientSecret, string token, string tokenTypeHint, CancellationToken ct)
    {
        Revocations.Enqueue((clientId, clientSecret, token, tokenTypeHint));
        return Task.CompletedTask;
    }
}

internal static class AppleKeys
{
    public static readonly ECDsa Key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
    public static readonly string Pem = Key.ExportPkcs8PrivateKeyPem();
}

public sealed class AccountDeletionTests(PostgresDatabase database) : IClassFixture<PostgresDatabase>, IAsyncLifetime
{
    private const string BundleId = "com.claymoresrfc.claymores";
    private ApiFactory? _factory;
    private readonly FakeAppleAuth _apple = new();

    internal static Dictionary<string, string?> Settings(string connectionString) => new()
    {
        ["ConnectionStrings:Claymores"] = connectionString,
        ["Authentication:Google:ClientId"] = "web-client.apps.googleusercontent.com",
        ["Authentication:Google:ClientSecret"] = "test-secret",
        ["Authentication:Google:PlayerEmails:0"] = "config-player@example.com",
        ["Authentication:Tokens:SigningKey"] = Convert.ToBase64String(Enumerable.Range(1, 32).Select(i => (byte)i).ToArray()),
        ["Authentication:Apple:ClientIds:0"] = BundleId,
        ["Authentication:Apple:TeamId"] = "57539PPNC3",
        ["Authentication:Apple:KeyId"] = "TESTKEY123",
        // As pasted into a dashboard that keeps literal \n escapes.
        ["Authentication:Apple:PrivateKey"] = AppleKeys.Pem.Replace("\n", "\\n"),
        ["MobileAuth:Enabled"] = "true",
        ["Dues:Enabled"] = "true",
    };

    public ValueTask InitializeAsync()
    {
        if (database.ConnectionString is not null)
            _factory = ApiFactory.With(Settings(database.ConnectionString), services =>
            {
                services.AddSingleton<IGoogleIdTokenValidator, FakeGoogleValidator>();
                services.AddSingleton<IAppleIdentityTokenValidator, FakeAppleValidator>();
                services.AddSingleton<IAppleAuthClient>(_apple);
            });
        return ValueTask.CompletedTask;
    }

    public async ValueTask DisposeAsync()
    {
        if (_factory is not null) await _factory.DisposeAsync();
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private HttpClient Client() => _factory!.CreateClient(new WebApplicationFactoryClientOptions
    {
        HandleCookies = false, AllowAutoRedirect = false
    });

    private Task InviteAsync(string email, string role = "player") =>
        _factory!.Services.GetRequiredService<ClubInvitations>().UpsertAsync(email, role, "test", Ct);

    private async Task<(string Access, string Refresh)> SignInAsync(string subject, string email)
    {
        var response = await Client().PostAsJsonAsync("/v1/auth/mobile/google",
            new { idToken = FakeGoogleValidator.Token(subject, email) }, Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(Ct));
        return (json.RootElement.GetProperty("accessToken").GetString()!, json.RootElement.GetProperty("refreshToken").GetString()!);
    }

    private static HttpRequestMessage Delete(string? token, object? body = null)
    {
        var request = new HttpRequestMessage(HttpMethod.Delete, "/v1/me");
        if (token is not null) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        if (body is not null) request.Content = JsonContent.Create(body);
        return request;
    }

    private async Task<T?> ScalarAsync<T>(string sql, object? value = null)
    {
        await using var dataSource = database.CreateDataSource();
        await using var command = dataSource.CreateCommand(sql);
        if (value is not null) command.Parameters.AddWithValue("v", value);
        var result = await command.ExecuteScalarAsync(Ct);
        return result is DBNull or null ? default : (T)result;
    }

    private async Task ExecuteAsync(string sql, params (string Name, object Value)[] parameters)
    {
        await using var dataSource = database.CreateDataSource();
        await using var command = dataSource.CreateCommand(sql);
        foreach (var (name, value) in parameters) command.Parameters.AddWithValue(name, value);
        await command.ExecuteNonQueryAsync(Ct);
    }

    [Fact]
    public async Task Bearer_deletion_removes_member_data_and_keeps_dues_records()
    {
        database.SkipIfUnavailable();
        await InviteAsync("leaver@example.com");
        var (access, refresh) = await SignInAsync("sub-leaver", "leaver@example.com");
        var second = await SignInAsync("sub-leaver", "leaver@example.com"); // another device

        // The same email also asked to join with Apple earlier (a pending request from another identity).
        await ExecuteAsync("""
            INSERT INTO join_requests (id, provider, subject, email, name) VALUES (@id, 'apple', 'apple|leaver', 'Leaver@Example.com', 'L')
            """, ("id", Guid.NewGuid()));

        // Dues: one assessment with a payment, a pending checkout that never reached Stripe, and a
        // pending checkout bound to a Stripe session (it may still complete, so it stays).
        var ledger = _factory!.Services.GetRequiredService<DuesLedger>();
        var paid = Guid.NewGuid();
        var unbound = Guid.NewGuid();
        var bound = Guid.NewGuid();
        foreach (var id in new[] { paid, unbound, bound })
            Assert.True(await ledger.CreateAsync(new CreateAssessment(id, "sub-leaver", "Season dues", 10000, null), Ct));
        Assert.Equal(PaymentResult.Recorded, await ledger.RecordAsync(paid, new RecordDuesPayment(Guid.NewGuid(), 2500), "treasurer", Ct));
        var unboundCheckout = Guid.NewGuid();
        var boundCheckout = Guid.NewGuid();
        await ExecuteAsync("""
            INSERT INTO dues_checkouts (id, assessment_id, amount_cents, status, return_to, stripe_mode)
            VALUES (@u, @ua, 2500, 'pending', 'app', 'test');
            INSERT INTO dues_checkouts (id, assessment_id, amount_cents, status, stripe_session_id, return_to, stripe_mode)
            VALUES (@b, @ba, 2500, 'pending', 'cs_test_leaver', 'app', 'test');
            """, ("u", unboundCheckout), ("ua", unbound), ("b", boundCheckout), ("ba", bound));

        // Missing auth is 401; a malformed body is 400 and deletes nothing.
        Assert.Equal(HttpStatusCode.Unauthorized, (await Client().SendAsync(Delete(null), Ct)).StatusCode);
        var malformed = Delete(access);
        malformed.Content = new StringContent("{not json", System.Text.Encoding.UTF8, "application/json");
        Assert.Equal(HttpStatusCode.BadRequest, (await Client().SendAsync(malformed, Ct)).StatusCode);

        var deleted = await Client().SendAsync(Delete(access), Ct);
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);
        Assert.Equal("no-store", deleted.Headers.CacheControl?.ToString());

        // Signed out everywhere.
        Assert.Equal(HttpStatusCode.Unauthorized, (await Client().PostAsJsonAsync("/v1/auth/mobile/refresh",
            new { refreshToken = refresh }, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Client().PostAsJsonAsync("/v1/auth/mobile/refresh",
            new { refreshToken = second.Refresh }, Ct)).StatusCode);
        var me = new HttpRequestMessage(HttpMethod.Get, "/v1/me");
        me.Headers.Authorization = new AuthenticationHeaderValue("Bearer", access);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Client().SendAsync(me, Ct)).StatusCode);
        Assert.Equal(0L, await ScalarAsync<long>(
            "SELECT count(*) FROM mobile_refresh_tokens WHERE google_subject = 'sub-leaver' AND revoked_at IS NULL"));

        // Member data gone.
        Assert.Equal(0L, await ScalarAsync<long>("SELECT count(*) FROM club_members WHERE google_subject = 'sub-leaver'"));
        Assert.Equal(0L, await ScalarAsync<long>("SELECT count(*) FROM club_invitations WHERE email = 'leaver@example.com'"));
        Assert.Equal(0L, await ScalarAsync<long>("SELECT count(*) FROM join_requests WHERE lower(email) = 'leaver@example.com'"));
        Assert.Equal(HttpStatusCode.Forbidden, (await Client().PostAsJsonAsync("/v1/auth/mobile/google",
            new { idToken = FakeGoogleValidator.Token("sub-leaver", "leaver@example.com") }, Ct)).StatusCode);

        // Financial records kept; only the unbound checkout is cancelled.
        Assert.Equal(3L, await ScalarAsync<long>("SELECT count(*) FROM dues_assessments WHERE player_subject = 'sub-leaver'"));
        Assert.Equal(1L, await ScalarAsync<long>("SELECT count(*) FROM dues_payments WHERE assessment_id = @v", paid));
        Assert.Equal("expired", await ScalarAsync<string>("SELECT status FROM dues_checkouts WHERE id = @v", unboundCheckout));
        Assert.Equal(AccountDeletion.ReleasedBy,
            await ScalarAsync<string>("SELECT released_by FROM dues_checkouts WHERE id = @v", unboundCheckout));
        Assert.Equal("pending", await ScalarAsync<string>("SELECT status FROM dues_checkouts WHERE id = @v", boundCheckout));

        // Not an Apple subject: no Apple calls.
        Assert.Empty(_apple.Exchanges);
    }

    [Fact]
    public async Task Config_invited_members_can_delete_their_data_but_the_entry_stays()
    {
        database.SkipIfUnavailable();
        var (access, refresh) = await SignInAsync("sub-config", "config-player@example.com");
        Assert.Equal(HttpStatusCode.NoContent, (await Client().SendAsync(Delete(access), Ct)).StatusCode);
        Assert.Equal(0L, await ScalarAsync<long>("SELECT count(*) FROM club_members WHERE google_subject = 'sub-config'"));
        Assert.Equal(HttpStatusCode.Unauthorized, (await Client().PostAsJsonAsync("/v1/auth/mobile/refresh",
            new { refreshToken = refresh }, Ct)).StatusCode);
        // The configuration list still lets them in; the owner has to remove it (see the README).
        await SignInAsync("sub-config", "config-player@example.com");
    }

    [Fact]
    public async Task Cookie_deletion_needs_same_origin_and_signs_out()
    {
        database.SkipIfUnavailable();
        await InviteAsync("cookie-leaver@example.com");
        await _factory!.Services.GetRequiredService<ClubMemberDirectory>()
            .ObserveSignInAsync(new ClubMember("sub-cookie-leaver", "cookie-leaver@example.com", "Cookie"), Ct);
        var cookie = SessionCookie(_factory, "sub-cookie-leaver", "cookie-leaver@example.com", "player");

        var crossSite = Delete(null);
        crossSite.Headers.Add("Cookie", cookie);
        Assert.Equal(HttpStatusCode.Forbidden, (await Client().SendAsync(crossSite, Ct)).StatusCode);

        // The account page offers the form.
        var page = new HttpRequestMessage(HttpMethod.Get, "/auth/account");
        page.Headers.Add("Cookie", cookie);
        var html = await (await Client().SendAsync(page, Ct)).Content.ReadAsStringAsync(Ct);
        Assert.Contains("""action="/auth/account/delete" method="post""", html);
        Assert.Contains("""name="confirm" value="delete" required""", html);

        HttpRequestMessage Form(Dictionary<string, string> fields, bool sameOrigin)
        {
            var request = new HttpRequestMessage(HttpMethod.Post, "/auth/account/delete")
            {
                Content = new FormUrlEncodedContent(fields)
            };
            request.Headers.Add("Cookie", cookie);
            if (sameOrigin) request.Headers.Add("Sec-Fetch-Site", "same-origin");
            return request;
        }

        Assert.Equal(HttpStatusCode.Forbidden, (await Client().SendAsync(Form(new() { ["confirm"] = "delete" }, false), Ct)).StatusCode);
        var unconfirmed = await Client().SendAsync(Form(new(), true), Ct);
        Assert.Equal("/auth/account?deletion=confirm", unconfirmed.Headers.Location?.ToString());
        Assert.Equal("cookie-leaver@example.com",
            await ScalarAsync<string>("SELECT email FROM club_invitations WHERE email = 'cookie-leaver@example.com'"));

        var deleted = await Client().SendAsync(Form(new() { ["confirm"] = "delete" }, true), Ct);
        Assert.Equal(HttpStatusCode.SeeOther, deleted.StatusCode);
        Assert.Equal("/auth/account-deleted", deleted.Headers.Location?.ToString());
        Assert.Contains(deleted.Headers.GetValues("Set-Cookie"), value => value.StartsWith("__Host-claymores-session=;"));
        Assert.Equal(0L, await ScalarAsync<long>("SELECT count(*) FROM club_members WHERE google_subject = 'sub-cookie-leaver'"));
        Assert.Equal(0L, await ScalarAsync<long>("SELECT count(*) FROM club_invitations WHERE email = 'cookie-leaver@example.com'"));
        Assert.Equal(HttpStatusCode.OK, (await Client().GetAsync("/auth/account-deleted", Ct)).StatusCode);

        // A same-origin cookie DELETE works too (and signs out).
        await InviteAsync("cookie-leaver2@example.com");
        var cookie2 = SessionCookie(_factory, "sub-cookie-leaver2", "cookie-leaver2@example.com", "player");
        var sameOrigin = Delete(null);
        sameOrigin.Headers.Add("Cookie", cookie2);
        sameOrigin.Headers.Add("Sec-Fetch-Site", "same-origin");
        var response = await Client().SendAsync(sameOrigin, Ct);
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Contains(response.Headers.GetValues("Set-Cookie"), value => value.StartsWith("__Host-claymores-session=;"));
    }

    [Fact]
    public async Task Apple_members_get_their_apple_tokens_revoked()
    {
        database.SkipIfUnavailable();
        await InviteAsync("apple-leaver@example.com");
        var signIn = await Client().PostAsJsonAsync("/v1/auth/mobile/apple", new
        {
            identityToken = FakeAppleValidator.Token("a-leaver", "apple-leaver@example.com", "n"),
            rawNonce = "n",
        }, Ct);
        using var json = JsonDocument.Parse(await signIn.Content.ReadAsStringAsync(Ct));
        var access = json.RootElement.GetProperty("accessToken").GetString()!;

        Assert.Equal(HttpStatusCode.NoContent,
            (await Client().SendAsync(Delete(access, new { appleAuthorizationCode = "code-1" }), Ct)).StatusCode);
        Assert.Equal(0L, await ScalarAsync<long>("SELECT count(*) FROM club_members WHERE google_subject = 'apple|a-leaver'"));

        var exchange = Assert.Single(_apple.Exchanges);
        Assert.Equal((BundleId, "code-1"), (exchange.ClientId, exchange.Code));
        var revoke = Assert.Single(_apple.Revocations);
        Assert.Equal((BundleId, "apple-refresh-code-1", "refresh_token"), (revoke.ClientId, revoke.Token, revoke.Hint));

        // The client secret is an ES256 JWT signed with the configured key, as Apple requires.
        var secret = new JsonWebToken(exchange.Secret);
        Assert.Equal(("ES256", "TESTKEY123"), (secret.Alg, secret.Kid));
        var result = await new JsonWebTokenHandler().ValidateTokenAsync(exchange.Secret, new TokenValidationParameters
        {
            ValidIssuer = "57539PPNC3",
            ValidAudience = "https://appleid.apple.com",
            IssuerSigningKey = new ECDsaSecurityKey(ECDsa.Create(AppleKeys.Key.ExportParameters(false))),
            RequireExpirationTime = true,
        });
        Assert.True(result.IsValid, result.Exception?.Message);
        Assert.Equal(BundleId, result.Claims["sub"]);
        Assert.InRange(secret.ValidTo - secret.IssuedAt, TimeSpan.FromMinutes(4), TimeSpan.FromMinutes(6));
    }

    [Fact]
    public async Task Apple_failures_do_not_block_deletion()
    {
        database.SkipIfUnavailable();
        _apple.Fail = true;
        await InviteAsync("apple-fail@example.com");
        var signIn = await Client().PostAsJsonAsync("/v1/auth/mobile/apple", new
        {
            identityToken = FakeAppleValidator.Token("a-fail", "apple-fail@example.com", "n"),
            rawNonce = "n",
        }, Ct);
        using var json = JsonDocument.Parse(await signIn.Content.ReadAsStringAsync(Ct));
        var access = json.RootElement.GetProperty("accessToken").GetString()!;

        Assert.Equal(HttpStatusCode.NoContent,
            (await Client().SendAsync(Delete(access, new { appleAuthorizationCode = "bad-code" }), Ct)).StatusCode);
        Assert.Single(_apple.Exchanges);
        Assert.Empty(_apple.Revocations);
        Assert.Equal(0L, await ScalarAsync<long>("SELECT count(*) FROM club_members WHERE google_subject = 'apple|a-fail'"));
    }

    [Fact]
    public async Task Apple_revocation_is_skipped_when_not_configured_or_without_a_code()
    {
        var apple = new FakeAppleAuth();
        var unconfigured = new AppleTokenRevocation(new ConfigurationBuilder().AddInMemoryCollection(
            new Dictionary<string, string?> { ["Authentication:Apple:ClientIds:0"] = BundleId }).Build(),
            apple, NullLogger<AppleTokenRevocation>.Instance);
        Assert.Equal(AppleRevocationOutcome.NotConfigured, await unconfigured.RevokeAsync("code", Ct));

        var configured = new AppleTokenRevocation(new ConfigurationBuilder().AddInMemoryCollection(
            Settings("Host=unused")).Build(), apple, NullLogger<AppleTokenRevocation>.Instance);
        Assert.Equal(AppleRevocationOutcome.NoCode, await configured.RevokeAsync(null, Ct));
        Assert.Empty(apple.Exchanges);

        // A broken key is logged as a failure, not thrown.
        var broken = new AppleTokenRevocation(new ConfigurationBuilder().AddInMemoryCollection(
            new Dictionary<string, string?>(Settings("Host=unused")) { ["Authentication:Apple:PrivateKey"] = "not a key" }).Build(),
            apple, NullLogger<AppleTokenRevocation>.Instance);
        Assert.Equal(AppleRevocationOutcome.Failed, await broken.RevokeAsync("code", Ct));
    }

    /// <summary>A session cookie as the Google sign-in flow would issue it.</summary>
    internal static string SessionCookie(ApiFactory factory, string subject, string email, string role)
    {
        var options = factory.Services.GetRequiredService<IOptionsMonitor<CookieAuthenticationOptions>>()
            .Get(GoogleSignIn.Session);
        var identity = new ClaimsIdentity(
        [
            new Claim("sub", subject),
            new Claim("email", email),
            new Claim("email_verified", "true"),
            new Claim(ClaimsIdentity.DefaultRoleClaimType, role),
        ], "ClubGoogle");
        var ticket = new AuthenticationTicket(new ClaimsPrincipal(identity), new AuthenticationProperties
        {
            IssuedUtc = DateTimeOffset.UtcNow,
            ExpiresUtc = DateTimeOffset.UtcNow.AddHours(1),
        }, GoogleSignIn.Session);
        return $"{options.Cookie.Name}={options.TicketDataFormat.Protect(ticket)}";
    }
}

/// <summary>The last-admin rule, in its own database so other tests' admins don't count.</summary>
public sealed class AccountDeletionLastAdminTests(PostgresDatabase database) : IClassFixture<PostgresDatabase>
{
    [Fact]
    public async Task The_last_admin_cannot_delete_their_account()
    {
        database.SkipIfUnavailable();
        var ct = TestContext.Current.CancellationToken;
        var settings = AccountDeletionTests.Settings(database.ConnectionString!);
        await using var factory = ApiFactory.With(settings, services =>
            services.AddSingleton<IGoogleIdTokenValidator, FakeGoogleValidator>());
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false, AllowAutoRedirect = false });
        var invitations = factory.Services.GetRequiredService<ClubInvitations>();

        async Task<string> AccessAsync(string subject, string email)
        {
            var response = await client.PostAsJsonAsync("/v1/auth/mobile/google",
                new { idToken = FakeGoogleValidator.Token(subject, email) }, ct);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
            return json.RootElement.GetProperty("accessToken").GetString()!;
        }
        Task<HttpResponseMessage> DeleteAsync(string token)
        {
            var request = new HttpRequestMessage(HttpMethod.Delete, "/v1/me");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            return client.SendAsync(request, ct);
        }

        await invitations.UpsertAsync("only-admin@example.com", "admin", "test", ct);
        var only = await AccessAsync("sub-only-admin", "only-admin@example.com");
        var refused = await DeleteAsync(only);
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Equal("""{"error":"last_admin"}""", await refused.Content.ReadAsStringAsync(ct));
        Assert.Equal("admin", await invitations.FindRoleAsync("only-admin@example.com", ct));

        // A player can always delete.
        await invitations.UpsertAsync("plain-player@example.com", "player", "test", ct);
        Assert.Equal(HttpStatusCode.NoContent, (await DeleteAsync(await AccessAsync("sub-plain", "plain-player@example.com"))).StatusCode);

        // With a second admin, the first can leave; then the second is the last one.
        await invitations.UpsertAsync("second-admin@example.com", "admin", "test", ct);
        var second = await AccessAsync("sub-second-admin", "second-admin@example.com");
        Assert.Equal(HttpStatusCode.NoContent, (await DeleteAsync(only)).StatusCode);
        Assert.Null(await invitations.FindRoleAsync("only-admin@example.com", ct));
        Assert.Equal(HttpStatusCode.Conflict, (await DeleteAsync(second)).StatusCode);

        // A configured bootstrap admin counts as another admin.
        settings["Authentication:Google:AdminEmails:0"] = "Owner@Example.com";
        await using var withOwner = ApiFactory.With(settings, services =>
            services.AddSingleton<IGoogleIdTokenValidator, FakeGoogleValidator>());
        var deletion = withOwner.Services.GetRequiredService<AccountDeletion>();
        Assert.Equal(DeletionResult.Deleted, await deletion.DeleteAsync("sub-second-admin", "second-admin@example.com", true, ct));
        // ...but the configured owner is then the only admin and can't delete either.
        Assert.Equal(DeletionResult.LastAdmin, await deletion.DeleteAsync("sub-owner", "owner@example.com", true, ct));
    }
}
