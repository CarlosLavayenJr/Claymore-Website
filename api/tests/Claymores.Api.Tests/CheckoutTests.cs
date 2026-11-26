using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

namespace Claymores.Api.Tests;

/// <summary>Signed Stripe webhook payloads for tests.</summary>
internal static class StripeEvents
{
    public const string WebhookSecret = "whsec_fake";

    public static string Session(string type, string sessionId, Guid attempt, long amount, bool live,
        IReadOnlyDictionary<string, string> metadata)
    {
        var paid = type == "checkout.session.completed";
        return JsonSerializer.Serialize(new Dictionary<string, object?>
        {
            ["id"] = "evt_" + Guid.NewGuid().ToString("N"),
            ["object"] = "event",
            ["api_version"] = Stripe.StripeConfiguration.ApiVersion,
            ["created"] = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
            ["livemode"] = live,
            ["type"] = type,
            ["data"] = new Dictionary<string, object?>
            {
                ["object"] = new Dictionary<string, object?>
                {
                    ["id"] = sessionId,
                    ["object"] = "checkout.session",
                    ["livemode"] = live,
                    ["mode"] = "payment",
                    ["currency"] = "usd",
                    ["amount_total"] = amount,
                    ["metadata"] = metadata,
                    ["client_reference_id"] = attempt.ToString("D"),
                    ["status"] = paid ? "complete" : "expired",
                    ["payment_status"] = paid ? "paid" : "unpaid",
                }
            }
        });
    }

    public static string Signature(string payload, string secret = WebhookSecret)
    {
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var signature = Convert.ToHexStringLower(
            HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes($"{timestamp}.{payload}")));
        return $"t={timestamp},v1={signature}";
    }

    public static Dictionary<string, string> Current(string mode) => new() { ["purpose"] = "claymores-dues", ["mode"] = mode };
    public static Dictionary<string, string> Legacy() => new() { ["purpose"] = "claymores-test-dues" };
}

/// <summary>Return targets, idempotency across surfaces, and webhooks in test mode, against Postgres.</summary>
public sealed class CheckoutTests(PostgresDatabase database) : IClassFixture<PostgresDatabase>, IAsyncLifetime
{
    private const string WebReturnUrl = "https://www.example.test/account?tab=dues";
    private ApiFactory? _factory;
    private readonly FakeStripe _stripe = new();

    public ValueTask InitializeAsync()
    {
        if (database.ConnectionString is null) return ValueTask.CompletedTask;
        _factory = ApiFactory.With(new Dictionary<string, string?>
        {
            ["ConnectionStrings:Claymores"] = database.ConnectionString,
            ["Authentication:Google:ClientId"] = "web-client.apps.googleusercontent.com",
            ["Authentication:Google:ClientSecret"] = "test-secret",
            ["Authentication:Tokens:SigningKey"] = Convert.ToBase64String(Enumerable.Range(1, 32).Select(i => (byte)i).ToArray()),
            ["MobileAuth:Enabled"] = "true",
            ["Dues:Enabled"] = "true",
            ["Stripe:CheckoutEnabled"] = "true",
            ["Stripe:SecretKey"] = "sk_test_fake",
            ["Stripe:WebhookSecret"] = StripeEvents.WebhookSecret,
            ["Stripe:ReturnOrigin"] = "https://api.example.test",
            ["Stripe:AppReturnUrl"] = "claymores://dues",
            ["Stripe:WebReturnUrl"] = WebReturnUrl,
        }, services =>
        {
            services.AddSingleton<IGoogleIdTokenValidator, FakeGoogleValidator>();
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

    private HttpClient Client() => _factory!.CreateClient(new WebApplicationFactoryClientOptions
    {
        HandleCookies = false, AllowAutoRedirect = false
    });

    private async Task<string> SignInAsync(string name)
    {
        var email = $"{name}@example.com";
        await _factory!.Services.GetRequiredService<ClubInvitations>().UpsertAsync(email, "player", "test", Ct);
        var response = await Client().PostAsJsonAsync("/v1/auth/mobile/google",
            new { idToken = FakeGoogleValidator.Token("sub-" + name, email) }, Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(Ct));
        return json.RootElement.GetProperty("accessToken").GetString()!;
    }

    private async Task<Guid> AssignDuesAsync(string subject, int amountCents)
    {
        var id = Guid.NewGuid();
        Assert.True(await _factory!.Services.GetRequiredService<DuesLedger>()
            .CreateAsync(new CreateAssessment(id, subject, "Season dues", amountCents, null), Ct));
        return id;
    }

    private Task<HttpResponseMessage> CheckoutAsync(string token, Guid dues, object body)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, $"/v1/dues/{dues}/checkout-session")
        {
            Content = JsonContent.Create(body)
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return Client().SendAsync(request, Ct);
    }

    private async Task<string> UrlAsync(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<Dictionary<string, string>>(Ct))!["url"];
    }

    private async Task<HttpResponseMessage> WebhookAsync(string payload)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/v1/webhooks/stripe")
        {
            Content = new StringContent(payload, Encoding.UTF8, "application/json")
        };
        request.Headers.Add("Stripe-Signature", StripeEvents.Signature(payload));
        return await Client().SendAsync(request, Ct);
    }

    private async Task<T?> ScalarAsync<T>(string sql, Guid id)
    {
        await using var dataSource = database.CreateDataSource();
        await using var command = dataSource.CreateCommand(sql);
        command.Parameters.AddWithValue("id", id);
        var value = await command.ExecuteScalarAsync(Ct);
        return value is DBNull or null ? default : (T)value;
    }

    private async Task<Guid> AttemptAsync(Guid dues) =>
        (await ScalarAsync<Guid>("SELECT id FROM dues_checkouts WHERE assessment_id = @id AND status = 'pending'", dues));

    [Fact]
    public async Task Return_target_defaults_to_the_app()
    {
        database.SkipIfUnavailable();
        var token = await SignInAsync("target-default");
        var dues = await AssignDuesAsync("sub-target-default", 10000);

        await UrlAsync(await CheckoutAsync(token, dues, new { amountCents = 2500 }));
        var create = Assert.Single(_stripe.Creates);
        Assert.Equal("claymores://dues?checkout=returned", create["success_url"]);
        Assert.Equal("claymores://dues?checkout=cancelled", create["cancel_url"]);
        Assert.Equal("claymores-dues", create["metadata[purpose]"]);
        Assert.Equal("test", create["metadata[mode]"]);
        Assert.Equal("Claymores RFC dues (test)", create["line_items[0][price_data][product_data][name]"]);
        Assert.Equal("card", create["allowed_payment_method_types[0]"]);
        Assert.DoesNotContain(create.Keys, key => key.StartsWith("payment_method_types", StringComparison.Ordinal));
        var attempt = await AttemptAsync(dues);
        Assert.Equal($"claymores-dues-test-app-{attempt:D}", Assert.Single(_stripe.IdempotencyKeys));
        Assert.Equal("app", await ScalarAsync<string>("SELECT return_to FROM dues_checkouts WHERE id = @id", attempt));
        Assert.Equal("test", await ScalarAsync<string>("SELECT stripe_mode FROM dues_checkouts WHERE id = @id", attempt));
    }

    [Fact]
    public async Task Return_target_app_and_web_use_their_configured_urls()
    {
        database.SkipIfUnavailable();
        var token = await SignInAsync("target-both");
        var app = await AssignDuesAsync("sub-target-both", 10000);
        var web = await AssignDuesAsync("sub-target-both", 10000);

        await UrlAsync(await CheckoutAsync(token, app, new { amountCents = 2500, returnTo = "app" }));
        await UrlAsync(await CheckoutAsync(token, web, new { amountCents = 2500, returnTo = "web" }));

        var creates = _stripe.Creates.ToArray();
        Assert.Equal("claymores://dues?checkout=returned", creates[0]["success_url"]);
        // The configured query is kept.
        Assert.Equal("https://www.example.test/account?tab=dues&checkout=returned", creates[1]["success_url"]);
        Assert.Equal("https://www.example.test/account?tab=dues&checkout=cancelled", creates[1]["cancel_url"]);
        Assert.Equal($"claymores-dues-test-web-{await AttemptAsync(web):D}", _stripe.IdempotencyKeys.Last());
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("garbage")]
    [InlineData("t=1,v1=00")]
    public async Task Unsigned_or_badly_signed_webhooks_are_rejected(string? signature)
    {
        database.SkipIfUnavailable();
        var request = new HttpRequestMessage(HttpMethod.Post, "/v1/webhooks/stripe")
        {
            Content = new StringContent("{}", Encoding.UTF8, "application/json")
        };
        if (signature is not null) request.Headers.TryAddWithoutValidation("Stripe-Signature", signature);
        var response = await Client().SendAsync(request, Ct);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Theory]
    [InlineData("desktop")]
    [InlineData("APP")]
    [InlineData("")]
    public async Task Unknown_return_targets_are_rejected(string returnTo)
    {
        database.SkipIfUnavailable();
        var token = await SignInAsync("target-bad");
        var dues = await AssignDuesAsync("sub-target-bad", 10000);

        var response = await CheckoutAsync(token, dues, new { amountCents = 2500, returnTo });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("""{"error":"invalid_request","field":"returnTo"}""", await response.Content.ReadAsStringAsync(Ct));
        Assert.Empty(_stripe.Creates);
    }

    [Fact]
    public async Task A_checkout_resumed_from_another_surface_keeps_its_original_target_and_key()
    {
        database.SkipIfUnavailable();
        var token = await SignInAsync("target-resume");
        var dues = await AssignDuesAsync("sub-target-resume", 10000);

        // The app's create reaches Stripe, but the response is lost.
        _stripe.DropResponses = true;
        Assert.Equal(HttpStatusCode.BadGateway, (await CheckoutAsync(token, dues, new { amountCents = 2500 })).StatusCode);
        _stripe.DropResponses = false;
        var attempt = await AttemptAsync(dues);
        Assert.Null(await ScalarAsync<string>("SELECT stripe_session_id FROM dues_checkouts WHERE id = @id", attempt));

        // The website retries: same key and parameters, so Stripe replays the original session.
        var url = await UrlAsync(await CheckoutAsync(token, dues, new { amountCents = 4000, returnTo = "web" }));
        Assert.Equal(1, _stripe.SessionCount);
        Assert.All(_stripe.IdempotencyKeys, key => Assert.Equal($"claymores-dues-test-app-{attempt:D}", key));
        var create = Assert.Single(_stripe.Creates);
        Assert.Equal("claymores://dues?checkout=returned", create["success_url"]);
        Assert.Equal("2500", create["line_items[0][price_data][unit_amount]"]);

        // Once bound, every surface gets the same open session's URL.
        Assert.Equal(url, await UrlAsync(await CheckoutAsync(token, dues, new { amountCents = 2500, returnTo = "web" })));
        Assert.Equal(url, await UrlAsync(await CheckoutAsync(token, dues, new { amountCents = 2500, returnTo = "app" })));
        Assert.Equal(1, _stripe.SessionCount);
    }

    [Fact]
    public async Task Webhook_records_a_test_payment_and_rejects_live_events()
    {
        database.SkipIfUnavailable();
        var token = await SignInAsync("hook-test");
        var dues = await AssignDuesAsync("sub-hook-test", 10000);
        var url = await UrlAsync(await CheckoutAsync(token, dues, new { amountCents = 2500, returnTo = "web" }));
        var attempt = await AttemptAsync(dues);
        var session = url[(url.LastIndexOf('/') + 1)..];

        // A live event never applies in test mode.
        var live = StripeEvents.Session("checkout.session.completed", session, attempt, 2500, live: true,
            StripeEvents.Current("test"));
        Assert.Equal(HttpStatusCode.BadRequest, (await WebhookAsync(live)).StatusCode);
        // Nor does a session whose metadata names another mode.
        var otherMode = StripeEvents.Session("checkout.session.completed", session, attempt, 2500, live: false,
            StripeEvents.Current("live"));
        Assert.Equal(HttpStatusCode.BadRequest, (await WebhookAsync(otherMode)).StatusCode);
        Assert.Equal("pending", await ScalarAsync<string>("SELECT status FROM dues_checkouts WHERE id = @id", attempt));

        var paid = StripeEvents.Session("checkout.session.completed", session, attempt, 2500, live: false,
            StripeEvents.Current("test"));
        Assert.Equal(HttpStatusCode.OK, (await WebhookAsync(paid)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await WebhookAsync(paid)).StatusCode);
        Assert.Equal("paid", await ScalarAsync<string>("SELECT status FROM dues_checkouts WHERE id = @id", attempt));
        Assert.Equal("stripe-test",
            await ScalarAsync<string>("SELECT recorded_by FROM dues_payments WHERE checkout_id = @id", attempt));
        Assert.Equal(1L, await ScalarAsync<long>("SELECT count(*) FROM dues_payments WHERE assessment_id = @id", dues));
    }

    /// <summary>Inserts a pending row the way the API created them before Stripe:Mode and return targets.</summary>
    private async Task<Guid> LegacyPendingAsync(Guid dues, int amount, string? sessionId, TimeSpan? age = null)
    {
        var id = Guid.NewGuid();
        await using var dataSource = database.CreateDataSource();
        await using var insert = dataSource.CreateCommand("""
            INSERT INTO dues_checkouts (id, assessment_id, amount_cents, status, stripe_session_id, created_at)
            VALUES (@id, @dues, @amount, 'pending', @session, now() - @age)
            """);
        insert.Parameters.AddWithValue("id", id);
        insert.Parameters.AddWithValue("dues", dues);
        insert.Parameters.AddWithValue("amount", amount);
        insert.Parameters.AddWithValue("session", (object?)sessionId ?? DBNull.Value);
        insert.Parameters.AddWithValue("age", age ?? TimeSpan.Zero);
        await insert.ExecuteNonQueryAsync(Ct);
        return id;
    }

    [Fact]
    public async Task Legacy_pending_rows_are_completed_and_expired_by_the_webhook()
    {
        database.SkipIfUnavailable();
        await SignInAsync("hook-legacy");
        var paidDues = await AssignDuesAsync("sub-hook-legacy", 10000);
        var expiredDues = await AssignDuesAsync("sub-hook-legacy", 10000);
        var paidSession = "cs_test_legacy" + Guid.NewGuid().ToString("N");
        var expiredSession = "cs_test_legacy" + Guid.NewGuid().ToString("N");
        var paidAttempt = await LegacyPendingAsync(paidDues, 2500, paidSession);
        var expiredAttempt = await LegacyPendingAsync(expiredDues, 3000, expiredSession);

        Assert.Equal(HttpStatusCode.OK, (await WebhookAsync(StripeEvents.Session("checkout.session.completed",
            paidSession, paidAttempt, 2500, live: false, StripeEvents.Legacy()))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await WebhookAsync(StripeEvents.Session("checkout.session.expired",
            expiredSession, expiredAttempt, 3000, live: false, StripeEvents.Legacy()))).StatusCode);

        Assert.Equal("paid", await ScalarAsync<string>("SELECT status FROM dues_checkouts WHERE id = @id", paidAttempt));
        Assert.Equal("stripe-test",
            await ScalarAsync<string>("SELECT recorded_by FROM dues_payments WHERE checkout_id = @id", paidAttempt));
        Assert.Equal("expired", await ScalarAsync<string>("SELECT status FROM dues_checkouts WHERE id = @id", expiredAttempt));
        Assert.Equal(0L, await ScalarAsync<long>("SELECT count(*) FROM dues_payments WHERE assessment_id = @id", expiredDues));
    }

    [Fact]
    public async Task Legacy_unbound_rows_resume_with_their_original_key_and_metadata()
    {
        database.SkipIfUnavailable();
        var token = await SignInAsync("legacy-resume");
        var dues = await AssignDuesAsync("sub-legacy-resume", 10000);
        var attempt = await LegacyPendingAsync(dues, 2500, null);

        await UrlAsync(await CheckoutAsync(token, dues, new { amountCents = 2500 }));
        Assert.Equal($"claymores-dues-test-{attempt:D}", Assert.Single(_stripe.IdempotencyKeys));
        var create = Assert.Single(_stripe.Creates);
        Assert.Equal("claymores-test-dues", create["metadata[purpose]"]);
        Assert.False(create.ContainsKey("metadata[mode]"));
        Assert.Equal("Claymores RFC dues (test)", create["line_items[0][price_data][product_data][name]"]);

        // The session it created still completes through the webhook.
        var session = (await ScalarAsync<string>("SELECT stripe_session_id FROM dues_checkouts WHERE id = @id", attempt))!;
        Assert.Equal(HttpStatusCode.OK, (await WebhookAsync(StripeEvents.Session("checkout.session.completed",
            session, attempt, 2500, live: false, StripeEvents.Legacy()))).StatusCode);
        Assert.Equal("paid", await ScalarAsync<string>("SELECT status FROM dues_checkouts WHERE id = @id", attempt));
    }

    private async Task<string> AdminAsync(string name)
    {
        var email = $"{name}@example.com";
        await _factory!.Services.GetRequiredService<ClubInvitations>().UpsertAsync(email, "admin", "test", Ct);
        var response = await Client().PostAsJsonAsync("/v1/auth/mobile/google",
            new { idToken = FakeGoogleValidator.Token("sub-" + name, email) }, Ct);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(Ct));
        return json.RootElement.GetProperty("accessToken").GetString()!;
    }

    private Task<HttpResponseMessage> ReleaseAsync(string token, Guid dues, Guid attempt, string? prefix = null)
    {
        var request = new HttpRequestMessage(HttpMethod.Post,
            $"{prefix ?? "/v1/admin/dues"}/{dues}/checkouts/{attempt}/release");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return Client().SendAsync(request, Ct);
    }

    private async Task AgeCheckoutAsync(Guid attempt, int minutes)
    {
        await using var dataSource = database.CreateDataSource();
        await using var command = dataSource.CreateCommand(
            "UPDATE dues_checkouts SET created_at = created_at - make_interval(mins => @minutes) WHERE id = @id");
        command.Parameters.AddWithValue("id", attempt);
        command.Parameters.AddWithValue("minutes", minutes);
        await command.ExecuteNonQueryAsync(Ct);
    }

    [Fact]
    public async Task A_checkout_stripe_refuses_doesnt_lock_the_member_out()
    {
        database.SkipIfUnavailable();
        var token = await SignInAsync("rejected");
        var dues = await AssignDuesAsync("sub-rejected", 12500);

        // Stripe refuses (e.g. the account has no business name yet): nothing is left pending.
        _stripe.RejectCreates = true;
        Assert.Equal(HttpStatusCode.BadGateway, (await CheckoutAsync(token, dues, new { amountCents = 12500 })).StatusCode);
        var first = await ScalarAsync<Guid>(
            "SELECT id FROM dues_checkouts WHERE assessment_id = @id ORDER BY created_at DESC LIMIT 1", dues);
        Assert.Equal(0L, await ScalarAsync<long>(
            "SELECT count(*) FROM dues_checkouts WHERE assessment_id = @id AND status = 'pending'", dues));
        Assert.Equal("expired", await ScalarAsync<string>("SELECT status FROM dues_checkouts WHERE id = @id", first));
        Assert.Equal("stripe-rejected", await ScalarAsync<string>("SELECT released_by FROM dues_checkouts WHERE id = @id", first));

        // Once fixed, the next try is a new attempt with a new idempotency key, and it works.
        _stripe.RejectCreates = false;
        var keys = _stripe.IdempotencyKeys.Count;
        Assert.StartsWith("https://", await UrlAsync(await CheckoutAsync(token, dues, new { amountCents = 12500 })));
        Assert.NotEqual(first, await AttemptAsync(dues));
        Assert.Equal(keys + 1, _stripe.IdempotencyKeys.Count);
    }

    /// <summary>A checkout whose create reached Stripe but whose response was lost: pending and unbound.</summary>
    private async Task<Guid> LostCheckoutAsync(string token, Guid dues)
    {
        _stripe.DropResponses = true;
        Assert.Equal(HttpStatusCode.BadGateway, (await CheckoutAsync(token, dues, new { amountCents = 2500 })).StatusCode);
        _stripe.DropResponses = false;
        return await AttemptAsync(dues);
    }

    [Fact]
    public async Task Release_frees_an_unbound_checkout_when_stripe_has_no_live_session()
    {
        database.SkipIfUnavailable();
        var admin = await AdminAsync("release-admin");
        var token = await SignInAsync("release-none");
        var dues = await AssignDuesAsync("sub-release-none", 10000);

        // The reservation never reached Stripe at all (the process stopped before the create).
        var attempt = Guid.NewGuid();
        await using (var dataSource = database.CreateDataSource())
        await using (var insert = dataSource.CreateCommand("""
            INSERT INTO dues_checkouts (id, assessment_id, amount_cents, status, return_to, stripe_mode)
            VALUES (@id, @dues, 2500, 'pending', 'app', 'test')
            """))
        {
            insert.Parameters.AddWithValue("id", attempt);
            insert.Parameters.AddWithValue("dues", dues);
            await insert.ExecuteNonQueryAsync(Ct);
        }

        // Less than an hour old: left alone, without asking Stripe.
        var recent = await ReleaseAsync(admin, dues, attempt);
        Assert.Equal(HttpStatusCode.Conflict, recent.StatusCode);
        Assert.Equal("""{"error":"too_recent"}""", await recent.Content.ReadAsStringAsync(Ct));
        Assert.Empty(_stripe.ListQueries);

        await AgeCheckoutAsync(attempt, 13 * 60);
        // Past 12 hours the member can't resume it, and it blocks a new checkout.
        Assert.Equal(HttpStatusCode.Conflict, (await CheckoutAsync(token, dues, new { amountCents = 1000 })).StatusCode);

        // Players can't release; the wrong assessment is 404.
        Assert.Equal(HttpStatusCode.Forbidden, (await ReleaseAsync(token, dues, attempt)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await ReleaseAsync(admin, Guid.NewGuid(), attempt)).StatusCode);

        var released = await ReleaseAsync(admin, dues, attempt);
        Assert.Equal(HttpStatusCode.OK, released.StatusCode);
        Assert.Equal("""{"status":"released"}""", await released.Content.ReadAsStringAsync(Ct));
        var query = Assert.Single(_stripe.ListQueries);
        Assert.Contains("created[gte]=", query);
        Assert.Contains("created[lte]=", query);
        Assert.Equal("expired", await ScalarAsync<string>("SELECT status FROM dues_checkouts WHERE id = @id", attempt));
        Assert.Equal("release-admin@example.com",
            await ScalarAsync<string>("SELECT released_by FROM dues_checkouts WHERE id = @id", attempt));

        // Released once; a second release is a conflict, and the member can start a new checkout.
        var again = await ReleaseAsync(admin, dues, attempt);
        Assert.Equal("""{"error":"not_pending"}""", await again.Content.ReadAsStringAsync(Ct));
        await UrlAsync(await CheckoutAsync(token, dues, new { amountCents = 1000 }));
    }

    private Task<HttpResponseMessage> CancelAsync(string token, Guid dues)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, $"/v1/admin/dues/{dues}/checkout/cancel");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return Client().SendAsync(request, Ct);
    }

    [Fact]
    public async Task Cancel_expires_an_abandoned_checkout_so_the_balance_can_be_waived()
    {
        database.SkipIfUnavailable();
        var admin = await AdminAsync("cancel-admin");
        var token = await SignInAsync("cancel-player");
        var dues = await AssignDuesAsync("sub-cancel-player", 12500);

        await UrlAsync(await CheckoutAsync(token, dues, new { amountCents = 12500 }));
        var attempt = await AttemptAsync(dues);
        var session = _stripe.SessionFor(attempt)!;

        // Players can't cancel.
        Assert.Equal(HttpStatusCode.Forbidden, (await CancelAsync(token, dues)).StatusCode);

        var cancelled = await CancelAsync(admin, dues);
        Assert.Equal(HttpStatusCode.OK, cancelled.StatusCode);
        Assert.Equal("""{"status":"cancelled"}""", await cancelled.Content.ReadAsStringAsync(Ct));
        Assert.Contains(session, _stripe.Expires);
        Assert.Equal("expired", await ScalarAsync<string>("SELECT status FROM dues_checkouts WHERE id = @id", attempt));

        // Nothing pending now: a second cancel is a conflict, and the whole balance can be waived.
        Assert.Equal(HttpStatusCode.Conflict, (await CancelAsync(admin, dues)).StatusCode);
        var waive = new HttpRequestMessage(HttpMethod.Post, $"/v1/admin/dues/{dues}/payments")
        {
            Content = JsonContent.Create(new { id = Guid.NewGuid(), amountCents = 12500, method = "waived", note = "Injury" })
        };
        waive.Headers.Authorization = new AuthenticationHeaderValue("Bearer", admin);
        var waived = await Client().SendAsync(waive, Ct);
        Assert.True(waived.IsSuccessStatusCode, await waived.Content.ReadAsStringAsync(Ct));
    }

    [Fact]
    public async Task Cancel_records_the_payment_when_the_player_already_paid()
    {
        database.SkipIfUnavailable();
        var admin = await AdminAsync("cancel-admin2");
        var token = await SignInAsync("cancel-paid");
        var dues = await AssignDuesAsync("sub-cancel-paid", 12500);

        await UrlAsync(await CheckoutAsync(token, dues, new { amountCents = 5000 }));
        var attempt = await AttemptAsync(dues);
        _stripe.Pay(_stripe.SessionFor(attempt)!);

        var response = await CancelAsync(admin, dues);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("""{"status":"paid","amountCents":5000}""", await response.Content.ReadAsStringAsync(Ct));
        Assert.Equal("paid", await ScalarAsync<string>("SELECT status FROM dues_checkouts WHERE id = @id", attempt));
        Assert.Equal(5000L, await ScalarAsync<long>(
            "SELECT COALESCE(sum(amount_cents), 0) FROM dues_payments WHERE assessment_id = @id AND voided_at IS NULL", dues));
    }

    [Fact]
    public async Task Release_binds_an_open_session_and_releases_an_expired_one()
    {
        database.SkipIfUnavailable();
        var admin = await AdminAsync("release-admin2");
        var token = await SignInAsync("release-lost");
        var open = await AssignDuesAsync("sub-release-lost", 10000);
        var expired = await AssignDuesAsync("sub-release-lost", 10000);

        // Both creates reached Stripe, and both responses were lost.
        var openAttempt = await LostCheckoutAsync(token, open);
        var expiredAttempt = await LostCheckoutAsync(token, expired);
        await AgeCheckoutAsync(openAttempt, 90);
        await AgeCheckoutAsync(expiredAttempt, 90);
        _stripe.Expire(_stripe.SessionFor(expiredAttempt)!);

        // An open session for the checkout exists: bind it instead of releasing.
        var bound = await ReleaseAsync(admin, open, openAttempt);
        Assert.Equal(HttpStatusCode.OK, bound.StatusCode);
        var body = await bound.Content.ReadFromJsonAsync<Dictionary<string, string>>(Ct);
        Assert.Equal(("bound", "open", _stripe.SessionFor(openAttempt)), (body!["status"], body["sessionStatus"], body["sessionId"]));
        Assert.Equal(_stripe.SessionFor(openAttempt),
            await ScalarAsync<string>("SELECT stripe_session_id FROM dues_checkouts WHERE id = @id", openAttempt));
        Assert.Equal("pending", await ScalarAsync<string>("SELECT status FROM dues_checkouts WHERE id = @id", openAttempt));
        // Now bound: releasing again is refused.
        Assert.Equal("""{"error":"bound","sessionId":"%s"}""".Replace("%s", _stripe.SessionFor(openAttempt)),
            await (await ReleaseAsync(admin, open, openAttempt)).Content.ReadAsStringAsync(Ct));

        // Stripe is unavailable: nothing changes.
        _stripe.FailLists = true;
        Assert.Equal(HttpStatusCode.BadGateway, (await ReleaseAsync(admin, expired, expiredAttempt)).StatusCode);
        Assert.Equal("pending", await ScalarAsync<string>("SELECT status FROM dues_checkouts WHERE id = @id", expiredAttempt));
        _stripe.FailLists = false;

        // Only an expired session: released, through the treasurer page's button.
        var page = new HttpRequestMessage(HttpMethod.Get, DuesAdminPage.Path);
        page.Headers.Authorization = new AuthenticationHeaderValue("Bearer", admin);
        var html = await (await Client().SendAsync(page, Ct)).Content.ReadAsStringAsync(Ct);
        var action = $"{DuesAdminPage.Path}/{expired:D}/checkouts/{expiredAttempt:D}/release";
        Assert.Contains(action, html);
        Assert.DoesNotContain($"/checkouts/{openAttempt:D}/release", html);

        var form = await ReleaseAsync(admin, expired, expiredAttempt, DuesAdminPage.Path);
        Assert.Equal(HttpStatusCode.SeeOther, form.StatusCode);
        Assert.Equal($"{DuesAdminPage.Path}?notice=checkout-released", form.Headers.Location?.ToString());
        Assert.Equal("expired", await ScalarAsync<string>("SELECT status FROM dues_checkouts WHERE id = @id", expiredAttempt));
    }
}

/// <summary>Live mode against Postgres, without hosting the API in Production.</summary>
public sealed class LiveCheckoutTests(PostgresDatabase database) : IClassFixture<PostgresDatabase>
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static readonly CheckoutSettings Live = new("sk_live_fake", StripeEvents.WebhookSecret,
        "https://api.example.test", "claymores://dues", StripeMode.Live, "https://www.example.test/account");

    private async Task<(DuesCheckout Checkout, Npgsql.NpgsqlDataSource Data)> CreateAsync()
    {
        var data = database.CreateDataSource();
        await new DatabaseMigrator(data, NullLogger<DatabaseMigrator>.Instance).MigrateAsync(Ct);
        var stripe = new Stripe.Checkout.SessionService(new Stripe.StripeClient("sk_live_fake",
            httpClient: new Stripe.SystemNetHttpClient(new HttpClient(new FakeStripe()))));
        return (new DuesCheckout(new DuesCheckoutStore(data), stripe, Live, NullLogger<DuesCheckout>.Instance), data);
    }

    private static async Task<int> PostAsync(DuesCheckout checkout, string payload)
    {
        var context = new DefaultHttpContext();
        context.Request.Method = "POST";
        context.Request.Body = new MemoryStream(Encoding.UTF8.GetBytes(payload));
        context.Request.Headers["Stripe-Signature"] = StripeEvents.Signature(payload);
        var result = await checkout.WebhookAsync(context, Ct);
        return Assert.IsAssignableFrom<IStatusCodeHttpResult>(result).StatusCode ?? 200;
    }

    private static async Task<Guid> SeedAsync(Npgsql.NpgsqlDataSource data, string? mode, string session, int amount)
    {
        var dues = Guid.NewGuid();
        var attempt = Guid.NewGuid();
        await using var command = data.CreateCommand("""
            INSERT INTO dues_assessments (id, player_subject, description, amount_cents) VALUES (@dues, 'sub-live', 'Season dues', 10000);
            INSERT INTO dues_checkouts (id, assessment_id, amount_cents, status, stripe_session_id, return_to, stripe_mode)
            VALUES (@attempt, @dues, @amount, 'pending', @session, CASE WHEN @mode::text IS NULL THEN NULL ELSE 'web' END, @mode::text);
            """);
        command.Parameters.AddWithValue("dues", dues);
        command.Parameters.AddWithValue("attempt", attempt);
        command.Parameters.AddWithValue("amount", amount);
        command.Parameters.AddWithValue("session", session);
        command.Parameters.AddWithValue("mode", (object?)mode ?? DBNull.Value);
        await command.ExecuteNonQueryAsync(Ct);
        return attempt;
    }

    private static async Task<string?> StringAsync(Npgsql.NpgsqlDataSource data, string sql, Guid id)
    {
        await using var command = data.CreateCommand(sql);
        command.Parameters.AddWithValue("id", id);
        return await command.ExecuteScalarAsync(Ct) as string;
    }

    [Fact]
    public async Task Live_mode_records_live_payments_and_rejects_test_events()
    {
        database.SkipIfUnavailable();
        var (checkout, data) = await CreateAsync();
        await using var _ = data;
        var session = "cs_live_" + Guid.NewGuid().ToString("N");
        var attempt = await SeedAsync(data, "live", session, 2500);

        // Test-mode events, and legacy test metadata, never apply in live mode.
        Assert.Equal(400, await PostAsync(checkout, StripeEvents.Session("checkout.session.completed", session, attempt,
            2500, live: false, StripeEvents.Current("live"))));
        Assert.Equal(400, await PostAsync(checkout, StripeEvents.Session("checkout.session.completed", session, attempt,
            2500, live: true, StripeEvents.Legacy())));
        Assert.Equal(400, await PostAsync(checkout, StripeEvents.Session("checkout.session.completed", session, attempt,
            2500, live: true, StripeEvents.Current("test"))));
        Assert.Equal("pending", await StringAsync(data, "SELECT status FROM dues_checkouts WHERE id = @id", attempt));

        Assert.Equal(200, await PostAsync(checkout, StripeEvents.Session("checkout.session.completed", session, attempt,
            2500, live: true, StripeEvents.Current("live"))));
        Assert.Equal("paid", await StringAsync(data, "SELECT status FROM dues_checkouts WHERE id = @id", attempt));
        Assert.Equal("stripe", await StringAsync(data, "SELECT recorded_by FROM dues_payments WHERE checkout_id = @id", attempt));
    }

    [Fact]
    public async Task Live_mode_never_applies_events_to_test_rows()
    {
        database.SkipIfUnavailable();
        var (checkout, data) = await CreateAsync();
        await using var _ = data;
        // A pending test row (legacy NULL mode) whose session ID is reused in a forged live event.
        var session = "cs_live_" + Guid.NewGuid().ToString("N");
        var attempt = await SeedAsync(data, null, session, 2500);

        Assert.Equal(500, await PostAsync(checkout, StripeEvents.Session("checkout.session.completed", session, attempt,
            2500, live: true, StripeEvents.Current("live"))));
        Assert.Equal("pending", await StringAsync(data, "SELECT status FROM dues_checkouts WHERE id = @id", attempt));
    }

    [Fact]
    public async Task Live_mode_creates_live_sessions_with_live_metadata()
    {
        database.SkipIfUnavailable();
        var (_, data) = await CreateAsync();
        await using var __ = data;
        var fake = new FakeStripe();
        var stripe = new Stripe.Checkout.SessionService(new Stripe.StripeClient("sk_live_fake",
            httpClient: new Stripe.SystemNetHttpClient(new HttpClient(fake))));
        var store = new DuesCheckoutStore(data);
        var checkout = new DuesCheckout(store, stripe, Live, NullLogger<DuesCheckout>.Instance);

        var dues = Guid.NewGuid();
        await using (var command = data.CreateCommand(
            "INSERT INTO dues_assessments (id, player_subject, description, amount_cents) VALUES (@id, 'sub-live-create', 'Season dues', 10000)"))
        {
            command.Parameters.AddWithValue("id", dues);
            await command.ExecuteNonQueryAsync(Ct);
        }

        var context = new DefaultHttpContext();
        context.User = new System.Security.Claims.ClaimsPrincipal(new System.Security.Claims.ClaimsIdentity(
            [new System.Security.Claims.Claim("sub", "sub-live-create")], "test"));
        context.Request.Method = "POST";
        context.Request.ContentType = "application/x-www-form-urlencoded";
        context.Request.Headers["Sec-Fetch-Site"] = "same-origin";
        context.Request.Body = new MemoryStream("amount=25.00"u8.ToArray());
        var result = await checkout.StartAsync(dues, context, Ct);

        var redirect = Assert.IsType<Microsoft.AspNetCore.Http.HttpResults.RedirectHttpResult>(result);
        Assert.StartsWith("https://checkout.stripe.com/c/pay/cs_live_", redirect.Url);
        var create = Assert.Single(fake.Creates);
        Assert.Equal("claymores-dues", create["metadata[purpose]"]);
        Assert.Equal("live", create["metadata[mode]"]);
        Assert.Equal("Claymores RFC dues", create["line_items[0][price_data][product_data][name]"]);
        Assert.Equal("https://api.example.test/auth/account?checkout=returned", create["success_url"]);
        Assert.StartsWith("claymores-dues-live-account-", Assert.Single(fake.IdempotencyKeys));
    }

    [Fact]
    public async Task Cancel_clears_a_leftover_sandbox_checkout_after_going_live()
    {
        database.SkipIfUnavailable();
        var (checkout, data) = await CreateAsync();
        await using var _ = data;
        var attempt = await SeedAsync(data, "test", "cs_test_left" + Guid.NewGuid().ToString("N"), 2500);
        await using var find = data.CreateCommand("SELECT assessment_id FROM dues_checkouts WHERE id = @id");
        find.Parameters.AddWithValue("id", attempt);
        var dues = (Guid)(await find.ExecuteScalarAsync(Ct))!;

        var outcome = await checkout.CancelAsync(dues, "treasurer@example.com", Ct);
        Assert.Equal(CancelResult.Cancelled, outcome.Result);
        await using var status = data.CreateCommand("SELECT status FROM dues_checkouts WHERE id = @id");
        status.Parameters.AddWithValue("id", attempt);
        Assert.Equal("expired", await status.ExecuteScalarAsync(Ct));
    }
}

/// <summary>Startup validation and page copy that need no database.</summary>
public sealed class CheckoutSettingsTests
{
    private static IConfiguration Config(string? mode, string key, bool? confirmed = null, string? web = null) =>
        new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Stripe:Mode"] = mode,
            ["Stripe:SecretKey"] = key,
            ["Stripe:WebhookSecret"] = "whsec_fake",
            ["Stripe:ReturnOrigin"] = "https://api.example.test",
            ["Stripe:LiveConfirmed"] = confirmed?.ToString(),
            ["Stripe:WebReturnUrl"] = web,
        }).Build();

    [Theory]
    // Test mode (the default) needs a test key; LiveConfirmed and the environment don't matter.
    [InlineData(null, "sk_test_x", "Production", null, true)]
    [InlineData("test", "rk_test_x", "Development", null, true)]
    [InlineData("test", "sk_test_x", "Production", true, true)]
    [InlineData("test", "sk_live_x", "Production", true, false)]
    [InlineData(null, "rk_live_x", "Production", true, false)]
    [InlineData("test", "pk_test_x", "Development", null, false)]
    // Live mode needs a live key, Production, and LiveConfirmed=true.
    [InlineData("live", "sk_live_x", "Production", true, true)]
    [InlineData("live", "rk_live_x", "Production", true, true)]
    [InlineData("live", "sk_test_x", "Production", true, false)]
    [InlineData("live", "rk_test_x", "Production", true, false)]
    [InlineData("live", "sk_live_x", "Development", true, false)]
    [InlineData("live", "sk_live_x", "Testing", true, false)]
    [InlineData("live", "sk_live_x", "Production", false, false)]
    [InlineData("live", "sk_live_x", "Production", null, false)]
    [InlineData("LIVE", "sk_live_x", "Production", true, false)]
    [InlineData("prod", "sk_live_x", "Production", true, false)]
    public void Mode_key_environment_and_confirmation_are_validated(
        string? mode, string key, string environment, bool? confirmed, bool valid)
    {
        var config = Config(mode, key, confirmed);
        if (valid)
        {
            var settings = CheckoutSettings.Read(config, environment);
            Assert.Equal(mode == "live" ? StripeMode.Live : StripeMode.Test, settings.Mode);
        }
        else
        {
            Assert.Throws<InvalidOperationException>(() => CheckoutSettings.Read(config, environment));
        }
    }

    [Fact]
    public void Mismatch_messages_name_the_problem()
    {
        var mismatch = Assert.Throws<InvalidOperationException>(() =>
            CheckoutSettings.Read(Config("test", "sk_live_x"), "Production"));
        Assert.Contains("Stripe:Mode is test but Stripe:SecretKey is a live key", mismatch.Message);
        var unconfirmed = Assert.Throws<InvalidOperationException>(() =>
            CheckoutSettings.Read(Config("live", "sk_live_x"), "Production"));
        Assert.Contains("Stripe:LiveConfirmed=true", unconfirmed.Message);
        var environment = Assert.Throws<InvalidOperationException>(() =>
            CheckoutSettings.Read(Config("live", "sk_live_x", true), "Staging"));
        Assert.Contains("ASPNETCORE_ENVIRONMENT=Production", environment.Message);
    }

    [Fact]
    public void Derived_values_follow_the_mode()
    {
        var test = CheckoutSettings.Read(Config(null, "sk_test_x"), "Testing");
        Assert.Equal(("test", "Claymores RFC dues (test)", "stripe-test"), (test.ModeName, test.ProductName, test.RecordedBy));
        var live = CheckoutSettings.Read(Config("live", "sk_live_x", true), "Production");
        Assert.Equal(("live", "Claymores RFC dues", "stripe"), (live.ModeName, live.ProductName, live.RecordedBy));
    }

    [Theory]
    [InlineData("https://www.claymoresrfc.com/account", "Production", true)]
    [InlineData("https://www.claymoresrfc.com/account?tab=dues", "Production", true)]
    [InlineData("http://localhost:3000/account", "Development", true)]
    [InlineData("http://127.0.0.1:3000/account", "Development", true)]
    [InlineData("http://localhost:3000/account", "Production", false)]
    [InlineData("http://www.claymoresrfc.com/account", "Development", false)]
    [InlineData("https://www.claymoresrfc.com/account#dues", "Production", false)]
    [InlineData("https://user@www.claymoresrfc.com/account", "Production", false)]
    [InlineData("/account", "Production", false)]
    [InlineData("claymores://dues", "Production", false)]
    public void Web_return_urls_are_validated(string url, string environment, bool valid)
    {
        if (valid)
            Assert.Equal(url, CheckoutSettings.ReadWebReturnUrl(url, environment));
        else
            Assert.Throws<InvalidOperationException>(() => CheckoutSettings.ReadWebReturnUrl(url, environment));
        // Startup reads it the same way.
        if (!valid)
            Assert.Throws<InvalidOperationException>(() =>
                CheckoutSettings.Read(Config(null, "sk_test_x", web: url), environment));
    }

    [Theory]
    [InlineData("https://x.test/account", "https://x.test/account?checkout=returned")]
    [InlineData("https://x.test/account?tab=dues", "https://x.test/account?tab=dues&checkout=returned")]
    [InlineData("https://x.test/account?", "https://x.test/account?checkout=returned")]
    public void Web_return_url_keeps_its_query(string url, string expected) =>
        Assert.Equal(expected, CheckoutSettings.WithQuery(url, "checkout=returned"));

    private static readonly DuesAssessment Open = new(Guid.NewGuid(), "sub", "Season dues", 10000, null, 0, 10000, 0);
    private static readonly DuesAssessment Pending = new(Guid.NewGuid(), "sub", "Season dues", 10000, null, 0, 10000, 2500);

    [Fact]
    public void Account_page_copy_follows_the_mode()
    {
        var test = GoogleSignIn.RenderDues([Open, Pending], StripeMode.Test);
        Assert.Contains("Test checkout is enabled", test);
        Assert.Contains("Pending test payment: $25.00", test);
        Assert.Contains("Resume test payment", test);

        var live = GoogleSignIn.RenderDues([Open, Pending], StripeMode.Live);
        Assert.Contains("Pay by card", live);
        Assert.DoesNotContain("test", live, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("Pending payment: $25.00", live);
        Assert.Contains("Resume payment", live);
        Assert.Contains("Continue to checkout", live);

        var off = GoogleSignIn.RenderDues([Open], null);
        Assert.DoesNotContain("checkout", off, StringComparison.OrdinalIgnoreCase);
    }
}
