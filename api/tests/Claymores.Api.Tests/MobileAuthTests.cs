using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Npgsql;

namespace Claymores.Api.Tests;

/// <summary>Google ID tokens look like "google|subject|email|verified|name" in these tests.</summary>
internal sealed class FakeGoogleValidator : IGoogleIdTokenValidator
{
    public static string Token(string subject, string email, bool verified = true, string name = "Test Player") =>
        $"google|{subject}|{email}|{(verified ? "true" : "false")}|{name}";

    public Task<GoogleIdentity?> ValidateAsync(string idToken, CancellationToken ct)
    {
        var parts = idToken.Split('|');
        return Task.FromResult(parts is ["google", var subject, var email, var verified, var name]
            ? new GoogleIdentity(subject, email, verified == "true", name)
            : null);
    }
}

/// <summary>Apple identity tokens look like "apple|subject|email|verified|nonce" in these tests.</summary>
internal sealed class FakeAppleValidator : IAppleIdentityTokenValidator
{
    public static string Token(string subject, string email, string nonce, bool verified = true) =>
        $"apple|{subject}|{email}|{(verified ? "true" : "false")}|{nonce}";

    public Task<AppleIdentity?> ValidateAsync(string identityToken, string rawNonce, CancellationToken ct)
    {
        var parts = identityToken.Split('|');
        return Task.FromResult(parts is ["apple", var subject, var email, var verified, var nonce] && nonce == rawNonce
            ? new AppleIdentity(subject, email, verified == "true")
            : null);
    }
}

/// <summary>Stands in for Stripe's Checkout Sessions API at the HTTP layer.</summary>
internal sealed class FakeStripe : HttpMessageHandler
{
    private readonly ConcurrentDictionary<string, string> _sessions = new();
    public ConcurrentQueue<Dictionary<string, string>> Creates { get; } = new();

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        var path = request.RequestUri!.AbsolutePath;
        if (request.Method == HttpMethod.Post && path == "/v1/checkout/sessions")
        {
            var form = QueryHelpers.ParseQuery(await request.Content!.ReadAsStringAsync(ct))
                .ToDictionary(pair => pair.Key, pair => pair.Value.ToString());
            Creates.Enqueue(form);
            var id = "cs_test_" + Guid.NewGuid().ToString("N");
            var json = JsonSerializer.Serialize(new Dictionary<string, object?>
            {
                ["id"] = id,
                ["object"] = "checkout.session",
                ["livemode"] = false,
                ["mode"] = "payment",
                ["currency"] = "usd",
                ["amount_total"] = long.Parse(form["line_items[0][price_data][unit_amount]"]),
                ["metadata"] = new Dictionary<string, string> { ["purpose"] = form["metadata[purpose]"] },
                ["client_reference_id"] = form["client_reference_id"],
                ["status"] = "open",
                ["url"] = $"https://checkout.stripe.com/c/pay/{id}",
            });
            _sessions[id] = json;
            return Json(json);
        }
        if (request.Method == HttpMethod.Get && path.StartsWith("/v1/checkout/sessions/", StringComparison.Ordinal) &&
            _sessions.TryGetValue(path["/v1/checkout/sessions/".Length..], out var stored))
            return Json(stored);
        return new HttpResponseMessage(HttpStatusCode.NotFound)
        {
            Content = new StringContent("""{"error":{"type":"invalid_request_error","message":"No such session"}}""",
                Encoding.UTF8, "application/json")
        };
    }

    private static HttpResponseMessage Json(string json) =>
        new(HttpStatusCode.OK) { Content = new StringContent(json, Encoding.UTF8, "application/json") };
}

public sealed class MobileAuthTests(PostgresDatabase database) : IClassFixture<PostgresDatabase>, IAsyncLifetime
{
    private ApiFactory? _factory;
    private readonly FakeStripe _stripe = new();

    private static readonly string SigningKey = Convert.ToBase64String(Enumerable.Range(1, 32).Select(i => (byte)i).ToArray());

    public ValueTask InitializeAsync()
    {
        if (database.ConnectionString is null) return ValueTask.CompletedTask;
        _factory = ApiFactory.With(new Dictionary<string, string?>
        {
            ["ConnectionStrings:Claymores"] = database.ConnectionString,
            ["Authentication:Google:ClientId"] = "web-client.apps.googleusercontent.com",
            ["Authentication:Google:ClientSecret"] = "test-secret",
            ["Authentication:Google:MobileClientIds:0"] = "ios-client.apps.googleusercontent.com",
            ["Authentication:Tokens:SigningKey"] = SigningKey,
            ["Authentication:Apple:ClientIds:0"] = "com.claymoresrfc.claymores",
            ["MobileAuth:Enabled"] = "true",
            ["Dues:Enabled"] = "true",
            ["Stripe:CheckoutEnabled"] = "true",
            ["Stripe:SecretKey"] = "sk_test_fake",
            ["Stripe:WebhookSecret"] = "whsec_fake",
            ["Stripe:ReturnOrigin"] = "https://api.example.test",
            ["Stripe:AppReturnUrl"] = "claymores://dues",
        }, services =>
        {
            services.AddSingleton<IGoogleIdTokenValidator, FakeGoogleValidator>();
            services.AddSingleton<IAppleIdentityTokenValidator, FakeAppleValidator>();
            services.AddSingleton(new Stripe.Checkout.SessionService(new Stripe.StripeClient("sk_test_fake",
                httpClient: new Stripe.SystemNetHttpClient(new HttpClient(_stripe)))));
        });
        return ValueTask.CompletedTask;
    }

    public async ValueTask DisposeAsync()
    {
        if (_factory is not null) await _factory.DisposeAsync();
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private HttpClient Client() => _factory!.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false });

    private Task InviteAsync(string email, string role = "player") =>
        _factory!.Services.GetRequiredService<ClubInvitations>().UpsertAsync(email, role, "test", Ct);

    private async Task<TokenBody> SignInAsync(string subject, string email)
    {
        var response = await Client().PostAsJsonAsync("/v1/auth/mobile/google",
            new { idToken = FakeGoogleValidator.Token(subject, email) }, Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<TokenBody>(Ct))!;
    }

    private async Task<HttpResponseMessage> RefreshAsync(string refreshToken) =>
        await Client().PostAsJsonAsync("/v1/auth/mobile/refresh", new { refreshToken }, Ct);

    private HttpRequestMessage Bearer(HttpMethod method, string path, string accessToken, object? body = null)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        if (body is not null) request.Content = JsonContent.Create(body);
        return request;
    }

    private async Task<Guid> AssignDuesAsync(string subject, int amountCents)
    {
        var id = Guid.NewGuid();
        Assert.True(await _factory!.Services.GetRequiredService<DuesLedger>()
            .CreateAsync(new CreateAssessment(id, subject, "Season dues", amountCents, null), Ct));
        return id;
    }

    [Fact]
    public async Task Google_sign_in_issues_tokens_and_records_the_member()
    {
        database.SkipIfUnavailable();
        await InviteAsync("issue@example.com");

        var response = await Client().PostAsJsonAsync("/v1/auth/mobile/google",
            new { idToken = FakeGoogleValidator.Token("sub-issue", "issue@example.com", name: "Issue Player") }, Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("no-store", response.Headers.CacheControl?.ToString());
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(Ct));
        var root = json.RootElement;
        Assert.Equal(["accessToken", "accessTokenExpiresAt", "refreshToken", "user"],
            root.EnumerateObject().Select(p => p.Name).ToArray());
        Assert.Equal(["subject", "name", "email", "role"],
            root.GetProperty("user").EnumerateObject().Select(p => p.Name).ToArray());
        Assert.Equal("player", root.GetProperty("user").GetProperty("role").GetString());

        var expires = root.GetProperty("accessTokenExpiresAt").GetDateTimeOffset();
        Assert.InRange(expires - DateTimeOffset.UtcNow, TimeSpan.FromMinutes(59), TimeSpan.FromMinutes(61));

        var me = await Client().SendAsync(Bearer(HttpMethod.Get, "/v1/me", root.GetProperty("accessToken").GetString()!), Ct);
        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
        var identity = await me.Content.ReadFromJsonAsync<Dictionary<string, string>>(Ct);
        Assert.Equal("sub-issue", identity!["subject"]);
        Assert.Equal("Issue Player", identity["name"]);
        Assert.Equal("issue@example.com", identity["email"]);
        Assert.Equal("player", identity["role"]);

        await using var dataSource = database.CreateDataSource();
        await using var member = dataSource.CreateCommand("SELECT email FROM club_members WHERE google_subject = 'sub-issue'");
        Assert.Equal("issue@example.com", await member.ExecuteScalarAsync(Ct));

        // Only the SHA-256 hash of the refresh token is stored.
        var refresh = root.GetProperty("refreshToken").GetString()!;
        Assert.Equal(43, refresh.Length);
        await using var stored = dataSource.CreateCommand("SELECT token_hash FROM mobile_refresh_tokens WHERE google_subject = 'sub-issue'");
        Assert.Equal(MobileSessionStore.Hash(refresh), (byte[])(await stored.ExecuteScalarAsync(Ct))!);
    }

    [Fact]
    public async Task Uninvited_accounts_get_not_invited()
    {
        database.SkipIfUnavailable();
        var response = await Client().PostAsJsonAsync("/v1/auth/mobile/google",
            new { idToken = FakeGoogleValidator.Token("sub-stranger", "stranger@example.com") }, Ct);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("""{"error":"not_invited"}""", await response.Content.ReadAsStringAsync(Ct));
    }

    [Theory]
    [InlineData("not-a-google-token")]
    [InlineData("")]
    [InlineData("google|sub-unverified|unverified@example.com|false|Name")]
    public async Task Invalid_or_unverified_google_tokens_get_401(string idToken)
    {
        database.SkipIfUnavailable();
        await InviteAsync("unverified@example.com");
        var response = await Client().PostAsJsonAsync("/v1/auth/mobile/google", new { idToken }, Ct);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("""{"error":"invalid_token"}""", await response.Content.ReadAsStringAsync(Ct));
    }

    [Fact]
    public async Task Refresh_rotates_and_reuse_revokes_the_family()
    {
        database.SkipIfUnavailable();
        await InviteAsync("rotate@example.com");
        var first = await SignInAsync("sub-rotate", "rotate@example.com");

        var rotated = await RefreshAsync(first.RefreshToken);
        Assert.Equal(HttpStatusCode.OK, rotated.StatusCode);
        var second = (await rotated.Content.ReadFromJsonAsync<TokenBody>(Ct))!;
        Assert.NotEqual(first.RefreshToken, second.RefreshToken);
        Assert.Equal("player", second.User.Role);

        // Reusing the rotated token is treated as theft: it fails and the newer token dies with it.
        Assert.Equal(HttpStatusCode.Unauthorized, (await RefreshAsync(first.RefreshToken)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await RefreshAsync(second.RefreshToken)).StatusCode);

        // A fresh sign-in starts a new family.
        var third = await SignInAsync("sub-rotate", "rotate@example.com");
        Assert.Equal(HttpStatusCode.OK, (await RefreshAsync(third.RefreshToken)).StatusCode);
    }

    [Fact]
    public async Task Logout_revokes_the_refresh_token()
    {
        database.SkipIfUnavailable();
        await InviteAsync("logout@example.com");
        var tokens = await SignInAsync("sub-logout", "logout@example.com");

        var logout = await Client().PostAsJsonAsync("/v1/auth/mobile/logout", new { refreshToken = tokens.RefreshToken }, Ct);
        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await RefreshAsync(tokens.RefreshToken)).StatusCode);

        var unknown = await Client().PostAsJsonAsync("/v1/auth/mobile/logout", new { refreshToken = "unknown" }, Ct);
        Assert.Equal(HttpStatusCode.NoContent, unknown.StatusCode);
    }

    [Fact]
    public async Task Expired_refresh_tokens_are_rejected()
    {
        database.SkipIfUnavailable();
        await InviteAsync("expired@example.com");
        var tokens = await SignInAsync("sub-expired", "expired@example.com");

        await using var dataSource = database.CreateDataSource();
        await using var expire = dataSource.CreateCommand(
            "UPDATE mobile_refresh_tokens SET expires_at = now() - interval '1 minute' WHERE google_subject = 'sub-expired'");
        await expire.ExecuteNonQueryAsync(Ct);

        Assert.Equal(HttpStatusCode.Unauthorized, (await RefreshAsync(tokens.RefreshToken)).StatusCode);
    }

    [Fact]
    public async Task Bearer_tokens_read_my_dues_only()
    {
        database.SkipIfUnavailable();
        await InviteAsync("dues@example.com");
        var tokens = await SignInAsync("sub-dues", "dues@example.com");
        var mine = await AssignDuesAsync("sub-dues", 10000);
        var theirs = await AssignDuesAsync("sub-someone-else", 10000);

        var list = await Client().SendAsync(Bearer(HttpMethod.Get, "/v1/dues/mine", tokens.AccessToken), Ct);
        Assert.Equal(HttpStatusCode.OK, list.StatusCode);
        var assessments = await list.Content.ReadFromJsonAsync<List<JsonElement>>(Ct);
        Assert.Equal(mine, Assert.Single(assessments!).GetProperty("id").GetGuid());

        Assert.Equal(HttpStatusCode.OK,
            (await Client().SendAsync(Bearer(HttpMethod.Get, $"/v1/dues/mine/{mine}", tokens.AccessToken), Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await Client().SendAsync(Bearer(HttpMethod.Get, $"/v1/dues/mine/{theirs}", tokens.AccessToken), Ct)).StatusCode);

        // Players can't use admin routes with a bearer token, and a tampered token is rejected.
        Assert.Equal(HttpStatusCode.Forbidden,
            (await Client().SendAsync(Bearer(HttpMethod.Get, "/v1/admin/dues", tokens.AccessToken), Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await Client().SendAsync(Bearer(HttpMethod.Get, "/v1/dues/mine", tokens.AccessToken + "x"), Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Client().GetAsync("/v1/dues/mine", Ct)).StatusCode);
    }

    [Fact]
    public async Task Removing_the_invitation_cuts_off_bearer_access_and_refresh()
    {
        database.SkipIfUnavailable();
        await InviteAsync("removed@example.com");
        var tokens = await SignInAsync("sub-removed", "removed@example.com");
        Assert.Equal(HttpStatusCode.OK,
            (await Client().SendAsync(Bearer(HttpMethod.Get, "/v1/dues/mine", tokens.AccessToken), Ct)).StatusCode);

        // RemoveAsync clears the 30-second role cache, so the next request sees the change.
        await _factory!.Services.GetRequiredService<ClubInvitations>().RemoveAsync("removed@example.com", Ct);

        Assert.Equal(HttpStatusCode.Unauthorized,
            (await Client().SendAsync(Bearer(HttpMethod.Get, "/v1/dues/mine", tokens.AccessToken), Ct)).StatusCode);
        var refresh = await RefreshAsync(tokens.RefreshToken);
        Assert.Equal(HttpStatusCode.Forbidden, refresh.StatusCode);
        Assert.Equal("""{"error":"not_invited"}""", await refresh.Content.ReadAsStringAsync(Ct));

        // Re-inviting does not revive the old session family.
        await InviteAsync("removed@example.com");
        Assert.Equal(HttpStatusCode.Unauthorized, (await RefreshAsync(tokens.RefreshToken)).StatusCode);
    }

    [Fact]
    public async Task Role_changes_apply_to_existing_bearer_tokens()
    {
        database.SkipIfUnavailable();
        await InviteAsync("promoted@example.com");
        var tokens = await SignInAsync("sub-promoted", "promoted@example.com");
        Assert.Equal(HttpStatusCode.Forbidden,
            (await Client().SendAsync(Bearer(HttpMethod.Get, "/v1/admin/dues", tokens.AccessToken), Ct)).StatusCode);

        await InviteAsync("promoted@example.com", "admin");
        Assert.Equal(HttpStatusCode.OK,
            (await Client().SendAsync(Bearer(HttpMethod.Get, "/v1/admin/dues", tokens.AccessToken), Ct)).StatusCode);
    }

    [Fact]
    public async Task Cookie_sessions_work_as_before()
    {
        database.SkipIfUnavailable();
        await InviteAsync("cookie@example.com");
        var mine = await AssignDuesAsync("sub-cookie", 5000);
        var cookie = SessionCookie("sub-cookie", "cookie@example.com");

        var list = new HttpRequestMessage(HttpMethod.Get, "/v1/dues/mine");
        list.Headers.Add("Cookie", cookie);
        var response = await Client().SendAsync(list, Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(mine, Assert.Single((await response.Content.ReadFromJsonAsync<List<JsonElement>>(Ct))!)
            .GetProperty("id").GetGuid());

        var session = new HttpRequestMessage(HttpMethod.Get, "/auth/session");
        session.Headers.Add("Cookie", cookie);
        Assert.Equal(HttpStatusCode.OK, (await Client().SendAsync(session, Ct)).StatusCode);

        // The cookie is not an API bearer identity.
        var me = new HttpRequestMessage(HttpMethod.Get, "/v1/me");
        me.Headers.Add("Cookie", cookie);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Client().SendAsync(me, Ct)).StatusCode);

        // The browser checkout form still requires same-origin.
        var form = new HttpRequestMessage(HttpMethod.Post, $"/auth/dues/{mine}/checkout")
        {
            Content = new FormUrlEncodedContent([new("amount", "10.00")])
        };
        form.Headers.Add("Cookie", cookie);
        Assert.Equal(HttpStatusCode.Forbidden, (await Client().SendAsync(form, Ct)).StatusCode);

        // A removed invitation ends the cookie session too.
        await _factory!.Services.GetRequiredService<ClubInvitations>().RemoveAsync("cookie@example.com", Ct);
        var after = new HttpRequestMessage(HttpMethod.Get, "/v1/dues/mine");
        after.Headers.Add("Cookie", cookie);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Client().SendAsync(after, Ct)).StatusCode);
    }

    [Fact]
    public async Task Checkout_session_validates_and_returns_a_stripe_url()
    {
        database.SkipIfUnavailable();
        await InviteAsync("pay@example.com");
        var tokens = await SignInAsync("sub-pay", "pay@example.com");
        var dues = await AssignDuesAsync("sub-pay", 10000);
        var theirs = await AssignDuesAsync("sub-not-pay", 10000);

        Task<HttpResponseMessage> Checkout(Guid id, int amountCents) => Client().SendAsync(
            Bearer(HttpMethod.Post, $"/v1/dues/{id}/checkout-session", tokens.AccessToken, new { amountCents }), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, (await Checkout(dues, 49)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Checkout(dues, 10001)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Checkout(theirs, 2500)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Checkout(Guid.NewGuid(), 2500)).StatusCode);
        Assert.Empty(_stripe.Creates);

        var created = await Checkout(dues, 2500);
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);
        var body = (await created.Content.ReadFromJsonAsync<Dictionary<string, string>>(Ct))!;
        Assert.Equal(["url"], body.Keys.ToArray());
        Assert.StartsWith("https://checkout.stripe.com/", body["url"]);

        var create = Assert.Single(_stripe.Creates);
        Assert.Equal("claymores://dues?checkout=returned", create["success_url"]);
        Assert.Equal("claymores://dues?checkout=cancelled", create["cancel_url"]);
        Assert.Equal("2500", create["line_items[0][price_data][unit_amount]"]);

        // A retry resumes the pending checkout (same session, original amount) instead of creating another.
        var resumed = await Checkout(dues, 3000);
        Assert.Equal(body["url"], (await resumed.Content.ReadFromJsonAsync<Dictionary<string, string>>(Ct))!["url"]);
        Assert.Single(_stripe.Creates);

        var dueList = await Client().SendAsync(Bearer(HttpMethod.Get, "/v1/dues/mine", tokens.AccessToken), Ct);
        var assessment = Assert.Single((await dueList.Content.ReadFromJsonAsync<List<JsonElement>>(Ct))!);
        Assert.Equal(2500, assessment.GetProperty("pendingCheckoutCents").GetInt64());
    }

    [Fact]
    public async Task Checkout_session_with_a_cookie_requires_same_origin()
    {
        database.SkipIfUnavailable();
        await InviteAsync("cookiepay@example.com");
        var dues = await AssignDuesAsync("sub-cookiepay", 10000);
        var cookie = SessionCookie("sub-cookiepay", "cookiepay@example.com");

        HttpRequestMessage Request(bool sameOrigin)
        {
            var request = new HttpRequestMessage(HttpMethod.Post, $"/v1/dues/{dues}/checkout-session")
            {
                Content = JsonContent.Create(new { amountCents = 1000 })
            };
            request.Headers.Add("Cookie", cookie);
            if (sameOrigin) request.Headers.Add("Sec-Fetch-Site", "same-origin");
            return request;
        }

        Assert.Equal(HttpStatusCode.Forbidden, (await Client().SendAsync(Request(sameOrigin: false), Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Client().SendAsync(Request(sameOrigin: true), Ct)).StatusCode);
    }

    private Task<HttpResponseMessage> AppleAsync(string subject, string email, string? fullName = null,
        bool verified = true, string nonce = "nonce-1", string? rawNonce = null) =>
        Client().PostAsJsonAsync("/v1/auth/mobile/apple", new
        {
            identityToken = FakeAppleValidator.Token(subject, email, nonce, verified),
            rawNonce = rawNonce ?? nonce,
            fullName,
        }, Ct);

    private async Task<string?> StoredNameAsync(string subject)
    {
        await using var dataSource = database.CreateDataSource();
        await using var command = dataSource.CreateCommand("SELECT display_name FROM club_members WHERE google_subject = @s");
        command.Parameters.AddWithValue("s", subject);
        return await command.ExecuteScalarAsync(Ct) as string;
    }

    [Fact]
    public async Task Apple_sign_in_issues_tokens_with_a_prefixed_subject()
    {
        database.SkipIfUnavailable();
        await InviteAsync("apple@example.com");

        var response = await AppleAsync("000123.apple", "apple@example.com", fullName: "Apple Player");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("no-store", response.Headers.CacheControl?.ToString());
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(Ct));
        var root = json.RootElement;
        Assert.Equal(["accessToken", "accessTokenExpiresAt", "refreshToken", "user"],
            root.EnumerateObject().Select(p => p.Name).ToArray());
        var user = root.GetProperty("user");
        Assert.Equal("apple|000123.apple", user.GetProperty("subject").GetString());
        Assert.Equal("Apple Player", user.GetProperty("name").GetString());
        Assert.Equal("player", user.GetProperty("role").GetString());

        var me = await Client().SendAsync(Bearer(HttpMethod.Get, "/v1/me", root.GetProperty("accessToken").GetString()!), Ct);
        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
        var identity = (await me.Content.ReadFromJsonAsync<Dictionary<string, string>>(Ct))!;
        Assert.Equal("apple|000123.apple", identity["subject"]);

        // The session keeps the email, so refresh can re-check the invitation.
        await using var dataSource = database.CreateDataSource();
        await using var session = dataSource.CreateCommand(
            "SELECT email FROM mobile_refresh_tokens WHERE google_subject = 'apple|000123.apple'");
        Assert.Equal("apple@example.com", await session.ExecuteScalarAsync(Ct));
    }

    [Fact]
    public async Task Apple_and_google_subjects_never_collide()
    {
        database.SkipIfUnavailable();
        await InviteAsync("collide@example.com");
        var google = await SignInAsync("same-sub", "collide@example.com");
        var apple = await AppleAsync("same-sub", "collide@example.com");
        Assert.Equal(HttpStatusCode.OK, apple.StatusCode);
        Assert.Equal("same-sub", google.User.Subject);
        Assert.Equal("apple|same-sub", (await apple.Content.ReadFromJsonAsync<TokenBody>(Ct))!.User.Subject);

        await using var dataSource = database.CreateDataSource();
        await using var count = dataSource.CreateCommand(
            "SELECT count(*) FROM club_members WHERE google_subject IN ('same-sub', 'apple|same-sub')");
        Assert.Equal(2L, await count.ExecuteScalarAsync(Ct));
    }

    [Fact]
    public async Task Apple_name_is_stored_on_first_sign_in_and_kept_after()
    {
        database.SkipIfUnavailable();
        await InviteAsync("named@example.com");

        Assert.Equal(HttpStatusCode.OK, (await AppleAsync("named", "named@example.com", fullName: "  First Name  ")).StatusCode);
        Assert.Equal("First Name", await StoredNameAsync("apple|named"));

        // Later sign-ins don't include the name: keep the stored one and return it.
        var again = await AppleAsync("named", "named@example.com");
        Assert.Equal("First Name", (await again.Content.ReadFromJsonAsync<TokenBody>(Ct))!.User.Name);
        Assert.Equal("First Name", await StoredNameAsync("apple|named"));
        Assert.Equal(HttpStatusCode.OK, (await AppleAsync("named", "named@example.com", fullName: " ")).StatusCode);
        Assert.Equal("First Name", await StoredNameAsync("apple|named"));

        // A new name (after the member re-authorizes the app) replaces it.
        Assert.Equal(HttpStatusCode.OK, (await AppleAsync("named", "named@example.com", fullName: "New Name")).StatusCode);
        Assert.Equal("New Name", await StoredNameAsync("apple|named"));
    }

    [Fact]
    public async Task Apple_relay_email_not_invited_returns_the_address()
    {
        database.SkipIfUnavailable();
        var relay = await AppleAsync("relay", "abc123xyz@privaterelay.appleid.com");
        Assert.Equal(HttpStatusCode.Forbidden, relay.StatusCode);
        Assert.Equal("""{"error":"not_invited","email":"abc123xyz@privaterelay.appleid.com"}""",
            await relay.Content.ReadAsStringAsync(Ct));

        var plain = await AppleAsync("plain", "stranger-apple@example.com");
        Assert.Equal(HttpStatusCode.Forbidden, plain.StatusCode);
        Assert.Equal("""{"error":"not_invited"}""", await plain.Content.ReadAsStringAsync(Ct));

        // Once an admin invites the relay address, it signs in.
        await InviteAsync("abc123xyz@privaterelay.appleid.com");
        Assert.Equal(HttpStatusCode.OK, (await AppleAsync("relay", "abc123xyz@privaterelay.appleid.com")).StatusCode);
    }

    [Fact]
    public async Task Apple_invalid_tokens_nonce_mismatch_and_unverified_email_get_401()
    {
        database.SkipIfUnavailable();
        await InviteAsync("apple401@example.com");

        async Task Assert401(Task<HttpResponseMessage> call)
        {
            var response = await call;
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
            Assert.Equal("""{"error":"invalid_token"}""", await response.Content.ReadAsStringAsync(Ct));
        }

        await Assert401(AppleAsync("a401", "apple401@example.com", nonce: "n1", rawNonce: "n2"));
        await Assert401(AppleAsync("a401", "apple401@example.com", verified: false));
        await Assert401(Client().PostAsJsonAsync("/v1/auth/mobile/apple",
            new { identityToken = "not-a-token", rawNonce = "n" }, Ct));
        await Assert401(Client().PostAsJsonAsync("/v1/auth/mobile/apple",
            new { identityToken = FakeAppleValidator.Token("a401", "apple401@example.com", "") }, Ct));
    }

    [Fact]
    public async Task Apple_sessions_refresh_and_follow_the_invitation()
    {
        database.SkipIfUnavailable();
        await InviteAsync("applerefresh@example.com");
        var first = (await (await AppleAsync("refresh", "applerefresh@example.com", fullName: "Refresh Player"))
            .Content.ReadFromJsonAsync<TokenBody>(Ct))!;

        var rotated = await RefreshAsync(first.RefreshToken);
        Assert.Equal(HttpStatusCode.OK, rotated.StatusCode);
        var second = (await rotated.Content.ReadFromJsonAsync<TokenBody>(Ct))!;
        Assert.NotEqual(first.RefreshToken, second.RefreshToken);
        Assert.Equal(new TokenUser("apple|refresh", "Refresh Player", "applerefresh@example.com", "player"), second.User);

        // A promotion applies on refresh; removing the invitation ends the session.
        await InviteAsync("applerefresh@example.com", "admin");
        var third = (await (await RefreshAsync(second.RefreshToken)).Content.ReadFromJsonAsync<TokenBody>(Ct))!;
        Assert.Equal("admin", third.User.Role);

        await _factory!.Services.GetRequiredService<ClubInvitations>().RemoveAsync("applerefresh@example.com", Ct);
        Assert.Equal(HttpStatusCode.Forbidden, (await RefreshAsync(third.RefreshToken)).StatusCode);
    }

    /// <summary>A session cookie as the Google sign-in flow would issue it.</summary>
    private string SessionCookie(string subject, string email)
    {
        var options = _factory!.Services.GetRequiredService<IOptionsMonitor<CookieAuthenticationOptions>>()
            .Get(GoogleSignIn.Session);
        var identity = new ClaimsIdentity(
        [
            new Claim("sub", subject),
            new Claim("email", email),
            new Claim("email_verified", "true"),
            new Claim("name", "Cookie Player"),
            new Claim(ClaimsIdentity.DefaultRoleClaimType, "player"),
        ], "ClubGoogle");
        var ticket = new AuthenticationTicket(new ClaimsPrincipal(identity), new AuthenticationProperties
        {
            IssuedUtc = DateTimeOffset.UtcNow,
            ExpiresUtc = DateTimeOffset.UtcNow.AddHours(1),
        }, GoogleSignIn.Session);
        return $"{options.Cookie.Name}={options.TicketDataFormat.Protect(ticket)}";
    }

    private sealed record TokenUser(string Subject, string? Name, string Email, string Role);
    private sealed record TokenBody(string AccessToken, DateTimeOffset AccessTokenExpiresAt, string RefreshToken, TokenUser User);
}

/// <summary>Startup checks that need no database.</summary>
public sealed class MobileAuthConfigurationTests
{
    private static Dictionary<string, string?> Settings(string? signingKey, string? connection = "Host=127.0.0.1;Port=1;Database=none;Username=none")
        => new()
        {
            ["ConnectionStrings:Claymores"] = connection,
            ["Database:MigrateOnStartup"] = "false",
            ["Authentication:Google:ClientId"] = "web-client",
            ["Authentication:Google:ClientSecret"] = "secret",
            ["Authentication:Tokens:SigningKey"] = signingKey,
            ["MobileAuth:Enabled"] = "true",
        };

    [Theory]
    [InlineData(null)]
    [InlineData("not base64!")]
    [InlineData("c2hvcnQta2V5")] // "short-key"
    public void Missing_or_short_signing_keys_fail_at_startup(string? key)
    {
        using var factory = ApiFactory.With(Settings(key));
        var error = Assert.ThrowsAny<Exception>(() => factory.CreateClient());
        Assert.Contains("SigningKey", error.ToString());
    }

    [Fact]
    public void Mobile_sign_in_requires_postgres()
    {
        using var factory = ApiFactory.With(Settings(Convert.ToBase64String(new byte[32]), connection: ""));
        var error = Assert.ThrowsAny<Exception>(() => factory.CreateClient());
        Assert.Contains("Mobile sign-in requires", error.ToString());
    }

    [Fact]
    public async Task Apple_route_is_not_mapped_without_apple_client_ids()
    {
        await using var factory = ApiFactory.With(Settings(Convert.ToBase64String(new byte[32])));
        var client = factory.CreateClient();
        var ct = TestContext.Current.CancellationToken;
        var apple = await client.PostAsJsonAsync("/v1/auth/mobile/apple", new { identityToken = "x", rawNonce = "y" }, ct);
        Assert.Equal(HttpStatusCode.NotFound, apple.StatusCode);
        // Google is mapped in the same configuration (an empty token fails validation instead).
        var google = await client.PostAsJsonAsync("/v1/auth/mobile/google", new { idToken = "" }, ct);
        Assert.Equal(HttpStatusCode.Unauthorized, google.StatusCode);
    }

    [Fact]
    public async Task Mobile_routes_are_not_mapped_when_disabled()
    {
        await using var factory = new ApiFactory();
        var response = await factory.CreateClient().PostAsJsonAsync("/v1/auth/mobile/google", new { idToken = "x" },
            TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Theory]
    [InlineData("claymores://dues", true)]
    [InlineData("https://app.example.com/dues", true)]
    [InlineData("claymores://dues?x=1", false)]
    [InlineData("http://example.com/dues", false)]
    [InlineData("javascript:alert(1)", false)]
    [InlineData("not a url", false)]
    public void App_return_urls_are_validated(string url, bool valid)
    {
        if (valid)
            Assert.Equal(url, CheckoutSettings.ReadAppReturnUrl(url));
        else
            Assert.Throws<InvalidOperationException>(() => CheckoutSettings.ReadAppReturnUrl(url));
    }
}
