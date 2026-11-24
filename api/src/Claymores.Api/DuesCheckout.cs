using System.Globalization;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Http.Features;
using Stripe;
using Stripe.Checkout;

internal sealed class DuesCheckout(
    DuesCheckoutStore store, SessionService stripe, CheckoutSettings settings, ILogger<DuesCheckout> logger)
{
    internal const int MinimumCents = 50;
    internal const int MaximumCents = 99_999_999;

    /// <summary>Metadata purpose of sessions created by this API, with a separate <c>mode</c> entry.</summary>
    internal const string Purpose = "claymores-dues";

    /// <summary>
    /// Purpose (and idempotency key prefix <c>claymores-dues-test-</c>) used before Stripe:Mode existed.
    /// Those sessions were all created in test mode and have no <c>mode</c> metadata.
    /// </summary>
    internal const string LegacyTestPurpose = "claymores-test-dues";

    /// <summary>Browser form on the account page: redirects to Stripe, then back to the account page.</summary>
    public async Task<IResult> StartAsync(Guid assessmentId, HttpContext context, CancellationToken ct)
    {
        context.Response.Headers.CacheControl = "no-store";
        if (!await SameOriginGuard.IsAllowedAsync(context))
            return Results.StatusCode(403);
        if (!context.Request.HasFormContentType)
            return Results.BadRequest("Submit the checkout form on your club account page.");

        var form = await context.Request.ReadFormAsync(ct);
        if (!decimal.TryParse(form["amount"], NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var dollars) ||
            dollars is < 0.50m or > 999999.99m || decimal.Round(dollars, 2) != dollars)
            return Results.BadRequest("Enter a USD amount of at least $0.50 with at most two decimal places.");

        var outcome = await OpenAsync(assessmentId, context.User.FindFirstValue("sub")!, (int)(dollars * 100),
            CheckoutReturn.Account, ct);
        return outcome switch
        {
            { Url: { } url } => Results.Redirect(url.AbsoluteUri),
            { Finished: true } => Results.Redirect("/auth/account?checkout=returned"),
            _ => Results.Problem(outcome.Error, statusCode: outcome.ErrorStatus)
        };
    }

    /// <summary>
    /// JSON for the app and the website: returns the Stripe URL to open. Stripe then returns to
    /// Stripe:AppReturnUrl (<c>returnTo</c> "app", the default) or Stripe:WebReturnUrl ("web").
    /// Bearer callers need no CSRF check, but cookie callers must be same-origin (<see cref="SameOriginGuard"/>).
    /// </summary>
    public async Task<IResult> StartForClientAsync(Guid assessmentId, CheckoutSessionRequest request, HttpContext context,
        CancellationToken ct)
    {
        context.Response.Headers.CacheControl = "no-store";
        if (!await SameOriginGuard.IsAllowedAsync(context))
            return Results.StatusCode(403);
        var bearer = await context.AuthenticateAsync(MobileAuth.Scheme);

        CheckoutReturn target;
        switch (request.ReturnTo)
        {
            case null or "app":
                target = CheckoutReturn.App;
                break;
            case "web":
                if (settings.WebReturnUrl is null)
                    return Results.BadRequest(new { error = "web_checkout_unavailable" });
                target = CheckoutReturn.Web;
                break;
            default:
                return Results.BadRequest(new { error = "invalid_request", field = "returnTo" });
        }
        if (request.AmountCents is < MinimumCents or > MaximumCents)
            return Results.Problem($"amountCents must be from {MinimumCents} to {MaximumCents}.", statusCode: 400);

        var subject = (bearer.Succeeded ? bearer.Principal! : context.User).FindFirstValue("sub")!;
        var outcome = await OpenAsync(assessmentId, subject, request.AmountCents, target, ct);
        return outcome switch
        {
            { Url: { } url } => Results.Ok(new CheckoutSessionResponse(url.AbsoluteUri)),
            { Finished: true } => Results.Problem(
                "This payment is already complete or closed. Refresh your dues to see the result.", statusCode: 409),
            _ => Results.Problem(outcome.Error, statusCode: outcome.ErrorStatus)
        };
    }

    /// <summary>
    /// Shared by every entry point: reserve (or resume the pending reservation), then create
    /// or fetch the Stripe session under a stable idempotency key.
    /// </summary>
    /// <remarks>
    /// The return target is stored with the reservation. Resuming a pending checkout from another
    /// surface (the app, the website, or the account page) reuses the original session, or creates it
    /// with the original target, so the idempotency key always pairs with identical parameters.
    /// Stripe then returns the player to wherever the checkout was first started.
    /// </remarks>
    private async Task<CheckoutOutcome> OpenAsync(Guid assessmentId, string subject, int amountCents,
        CheckoutReturn requested, CancellationToken ct)
    {
        var reservation = await store.ReserveAsync(assessmentId, subject, amountCents, requested, settings.Mode, ct);
        if (reservation.Checkout is not { } attempt)
            return CheckoutOutcome.Failed(reservation.ErrorStatus, reservation.Error);
        if ((attempt.Mode ?? StripeMode.Test) != settings.Mode)
            return CheckoutOutcome.Failed(409,
                "A checkout started in another Stripe mode is still pending. Ask the treasurer to reconcile it.");

        Session session;
        try
        {
            if (attempt.SessionId is { } existing)
            {
                session = await stripe.GetAsync(existing, cancellationToken: ct);
            }
            else
            {
                // Keep create parameters fixed across retries and within Stripe's idempotency window.
                if (DateTime.UtcNow >= attempt.CreatedAt.AddHours(12))
                    return CheckoutOutcome.Failed(409, "This checkout needs reconciliation before you can start a new one.");

                // Legacy rows (no stored target) keep their original key and parameters.
                var legacy = attempt.ReturnTo is null;
                var target = attempt.ReturnTo ?? requested;
                if (ReturnUrl(target, "returned") is not { } success || ReturnUrl(target, "cancelled") is not { } cancel)
                    return CheckoutOutcome.Failed(503, "This checkout's return page is not configured.");

                var options = new SessionCreateOptions
                {
                    Mode = "payment",
                    ClientReferenceId = attempt.Id.ToString("D"),
                    SuccessUrl = success,
                    CancelUrl = cancel,
                    Metadata = legacy
                        ? new Dictionary<string, string> { ["purpose"] = LegacyTestPurpose }
                        : new Dictionary<string, string> { ["purpose"] = Purpose, ["mode"] = settings.ModeName },
                    LineItems =
                    [
                        new()
                        {
                            Quantity = 1,
                            PriceData = new()
                            {
                                Currency = "usd",
                                UnitAmount = attempt.AmountCents,
                                ProductData = new() { Name = legacy ? "Claymores RFC dues (test)" : settings.ProductName }
                            }
                        }
                    ]
                };
                options.AddExtraParam("payment_method_types", new[] { "card" });
                var key = legacy
                    ? $"claymores-dues-test-{attempt.Id:D}"
                    : $"claymores-dues-{settings.ModeName}-{Name(target)}-{attempt.Id:D}";
                session = await stripe.CreateAsync(options, new RequestOptions { IdempotencyKey = key }, ct);
            }
        }
        catch (StripeException error)
        {
            logger.LogWarning("Stripe {Mode} checkout request failed with status {Status} for attempt {Attempt}.",
                settings.ModeName, error.HttpStatusCode, attempt.Id);
            return CheckoutOutcome.Failed(502, settings.Mode == StripeMode.Live
                ? "Checkout is temporarily unavailable. Try again to resume the same payment."
                : "Test checkout is temporarily unavailable. Try again to resume the same payment.");
        }

        if (!MatchesAttempt(session, attempt.Id, attempt.AmountCents))
            return CheckoutOutcome.Failed(502, "Stripe returned an unexpected checkout session.");

        await store.BindAsync(attempt.Id, session.Id, ct);
        if (session.Status != "open")
            return new CheckoutOutcome(null, Finished: true);

        if (!Uri.TryCreate(session.Url, UriKind.Absolute, out var url) ||
            url.Scheme != Uri.UriSchemeHttps || url.Host != "checkout.stripe.com" ||
            !url.IsDefaultPort || url.UserInfo.Length != 0)
            return CheckoutOutcome.Failed(502, "Stripe returned an unexpected checkout URL.");

        return new CheckoutOutcome(url);
    }

    /// <summary>A reservation must be at least this old before a treasurer can release it.</summary>
    internal static readonly TimeSpan ReleaseAfter = TimeSpan.FromHours(1);

    /// <summary>
    /// Treasurer action for a pending checkout that never got a Stripe session bound (the create's
    /// response was lost and the player didn't retry). Such a reservation blocks new checkouts for the
    /// assessment, and after 12 hours it can't be resumed either. This asks Stripe for sessions with
    /// <c>client_reference_id</c> = the checkout ID (every session this API creates has it), among those
    /// created from the reservation's start until the 12-hour create cut-off. With none, or only expired
    /// ones, the reservation is released. Otherwise the session is bound and reported, so the normal
    /// resume and webhook flow takes over.
    /// </summary>
    public async Task<ReleaseOutcome> ReleaseAsync(Guid assessmentId, Guid checkoutId, string releasedBy, CancellationToken ct)
    {
        if (await store.FindAsync(assessmentId, checkoutId, ct) is not { } checkout)
            return new(ReleaseResult.NotFound);
        if (checkout.Status != "pending")
            return new(ReleaseResult.NotPending);
        if (checkout.SessionId is { } bound)
            return new(ReleaseResult.AlreadyBound, bound);
        if (checkout.Mode != settings.Mode)
            return new(ReleaseResult.OtherMode);
        if (DateTime.UtcNow - checkout.CreatedAt < ReleaseAfter)
            return new(ReleaseResult.TooRecent);

        var sessions = new List<Session>();
        try
        {
            var options = new SessionListOptions
            {
                Limit = 100,
                Created = new DateRangeOptions
                {
                    GreaterThanOrEqual = checkout.CreatedAt.AddMinutes(-5),
                    LessThanOrEqual = checkout.CreatedAt.AddHours(12).AddMinutes(5),
                },
            };
            await foreach (var session in stripe.ListAutoPagingAsync(options, cancellationToken: ct))
                if (Guid.TryParse(session.ClientReferenceId, out var reference) && reference == checkout.Id)
                    sessions.Add(session);
        }
        catch (StripeException error)
        {
            logger.LogWarning("Stripe {Mode} session lookup failed with status {Status} for checkout {Attempt}.",
                settings.ModeName, error.HttpStatusCode, checkout.Id);
            return new(ReleaseResult.StripeUnavailable);
        }

        var live = sessions.Where(session => session.Status != "expired")
            .OrderBy(session => session.Status == "complete" ? 0 : 1).FirstOrDefault();
        if (live is null)
        {
            if (!await store.ReleaseAsync(checkout.Id, releasedBy, ct))
                return new(ReleaseResult.NotPending);
            logger.LogInformation("Checkout {Attempt} released by {Admin}; Stripe had {Count} expired sessions for it.",
                checkout.Id, releasedBy, sessions.Count);
            return new(ReleaseResult.Released);
        }

        if (!MatchesAttempt(live, checkout.Id, checkout.AmountCents))
        {
            logger.LogError("Stripe session {Session} names checkout {Attempt} but doesn't match it.", live.Id, checkout.Id);
            return new(ReleaseResult.Mismatch, live.Id, live.Status);
        }
        await store.BindAsync(checkout.Id, live.Id, ct);
        return new(ReleaseResult.Bound, live.Id, live.Status);
    }

    internal static IResult ReleaseResponse(ReleaseOutcome outcome) => outcome.Result switch
    {
        ReleaseResult.Released => Results.Ok(new { status = "released" }),
        ReleaseResult.Bound => Results.Ok(new { status = "bound", sessionId = outcome.SessionId, sessionStatus = outcome.SessionStatus }),
        ReleaseResult.NotFound => Results.NotFound(),
        ReleaseResult.NotPending => Results.Conflict(new { error = "not_pending" }),
        ReleaseResult.AlreadyBound => Results.Conflict(new { error = "bound", sessionId = outcome.SessionId }),
        ReleaseResult.OtherMode => Results.Conflict(new { error = "other_mode" }),
        ReleaseResult.TooRecent => Results.Conflict(new { error = "too_recent" }),
        ReleaseResult.Mismatch => Results.Json(new { error = "session_mismatch", sessionId = outcome.SessionId }, statusCode: 502),
        _ => Results.Json(new { error = "stripe_unavailable" }, statusCode: 502),
    };

    private static string AdminName(ClaimsPrincipal user) =>
        user.FindFirstValue("email") ?? user.FindFirstValue("sub") ?? "admin";

    internal static string Name(CheckoutReturn target) => target switch
    {
        CheckoutReturn.App => "app",
        CheckoutReturn.Web => "web",
        _ => "account"
    };

    private string? ReturnUrl(CheckoutReturn target, string status) => target switch
    {
        CheckoutReturn.App => settings.AppReturnUrl is { } app ? $"{app}?checkout={status}" : null,
        CheckoutReturn.Web => settings.WebReturnUrl is { } web ? CheckoutSettings.WithQuery(web, $"checkout={status}") : null,
        _ => $"{settings.Origin}/auth/account?checkout={status}"
    };

    public async Task<IResult> WebhookAsync(HttpContext context, CancellationToken ct)
    {
        const int maxBytes = 128 * 1024;
        var request = context.Request;
        if (request.ContentLength > maxBytes)
            return Results.StatusCode(413);
        if (context.Features.Get<IHttpMaxRequestBodySizeFeature>() is { IsReadOnly: false } limit)
            limit.MaxRequestBodySize = maxBytes;

        using var reader = new StreamReader(request.Body, Encoding.UTF8);
        var body = await reader.ReadToEndAsync(ct);
        // Stripe always signs its calls; anything without the header is not from Stripe.
        var signature = request.Headers["Stripe-Signature"].ToString();
        if (string.IsNullOrWhiteSpace(signature))
            return Results.BadRequest("Invalid Stripe webhook.");
        Event stripeEvent;
        try
        {
            stripeEvent = EventUtility.ConstructEvent(body, signature, settings.WebhookSecret);
        }
        catch (StripeException)
        {
            return Results.BadRequest("Invalid Stripe webhook.");
        }
        catch (Newtonsoft.Json.JsonException)
        {
            return Results.BadRequest("Invalid Stripe webhook.");
        }
        catch (ArgumentException)
        {
            return Results.BadRequest("Invalid Stripe webhook.");
        }

        var paid = stripeEvent.Type == "checkout.session.completed";
        if (!paid && stripeEvent.Type != "checkout.session.expired")
            return Results.Ok();
        // Test mode accepts only test events; live mode only live events.
        if (stripeEvent.Livemode != (settings.Mode == StripeMode.Live) || stripeEvent.Data?.Object is not Session session)
            return Results.BadRequest($"Invalid Stripe {settings.ModeName} checkout event.");
        if (session.Metadata?.GetValueOrDefault("purpose") is not (Purpose or LegacyTestPurpose))
            return Results.Ok();

        if (!Guid.TryParse(session.ClientReferenceId, out var attempt) ||
            session.AmountTotal is not { } amount || !MatchesAttempt(session, attempt, amount) ||
            (paid ? session.Status != "complete" || session.PaymentStatus != "paid"
                  : session.Status != "expired" || session.PaymentStatus != "unpaid"))
            return Results.BadRequest("Invalid Stripe checkout status or amount.");

        if (await store.ApplyEventAsync(attempt, session.Id, amount, paid, settings.Mode, ct))
            return Results.Ok();

        logger.LogError("Stripe {Mode} event {Event} could not be matched to checkout {Attempt}.",
            settings.ModeName, stripeEvent.Id, attempt);
        return Results.Problem("Checkout needs reconciliation.", statusCode: 500);
    }

    private bool MatchesAttempt(Session session, Guid attempt, long amount)
    {
        var live = settings.Mode == StripeMode.Live;
        var purpose = session.Metadata?.GetValueOrDefault("purpose");
        var ours = (purpose == Purpose && session.Metadata?.GetValueOrDefault("mode") == settings.ModeName) ||
                   (!live && purpose == LegacyTestPurpose);
        return ours && session.Livemode == live &&
               session.Id?.StartsWith(live ? "cs_live_" : "cs_test_", StringComparison.Ordinal) == true &&
               session.Mode == "payment" && session.Currency == "usd" && session.AmountTotal == amount &&
               Guid.TryParse(session.ClientReferenceId, out var reference) && reference == attempt;
    }

    public static void Map(WebApplication app, bool appCheckout)
    {
        app.MapPost("/auth/dues/{assessmentId:guid}/checkout",
                (Guid assessmentId, DuesCheckout checkout, HttpContext context, CancellationToken ct) =>
                    checkout.StartAsync(assessmentId, context, ct))
            .RequireAuthorization(GoogleSignIn.RolePolicy)
            .WithTags("Dues")
            .WithSummary("Start or resume a player dues checkout in Stripe (test or live per Stripe:Mode)")
            .Accepts<IFormCollection>("application/x-www-form-urlencoded")
            .Produces(302).Produces(400).Produces(401).Produces(403).Produces(404).Produces(409).Produces(502);

        if (appCheckout)
        {
            app.MapPost("/v1/dues/{assessmentId:guid}/checkout-session",
                    (Guid assessmentId, CheckoutSessionRequest request, DuesCheckout checkout, HttpContext context,
                        CancellationToken ct) => checkout.StartForClientAsync(assessmentId, request, context, ct))
                .RequireAuthorization(GoogleSignIn.RolePolicy)
                .WithTags("Dues")
                .WithSummary("Start or resume a dues checkout in Stripe and get its URL")
                .WithDescription("For the app and the website. returnTo is \"app\" (default; Stripe returns to " +
                    "Stripe:AppReturnUrl) or \"web\" (Stripe:WebReturnUrl), with ?checkout=returned or ?checkout=cancelled. " +
                    "A pending checkout for the assessment is resumed with its original amount and original return target.")
                .Produces<CheckoutSessionResponse>()
                .ProducesProblem(400).Produces(401).Produces(403).ProducesProblem(404).ProducesProblem(409)
                .ProducesProblem(502);
        }

        app.MapPost("/v1/admin/dues/{assessmentId:guid}/checkouts/{checkoutId:guid}/release",
                async (Guid assessmentId, Guid checkoutId, ClaimsPrincipal user, DuesCheckout checkout, CancellationToken ct) =>
                    ReleaseResponse(await checkout.ReleaseAsync(assessmentId, checkoutId, AdminName(user), ct)))
            .RequireAuthorization(GoogleSignIn.AdminPolicy)
            .AddEndpointFilter(SameOriginGuard.Filter)
            .WithTags("Dues")
            .WithSummary("Release a pending checkout that has no Stripe session after checking Stripe")
            .WithDescription("For a pending checkout older than an hour with no bound Stripe session. Releases it when " +
                "Stripe has no session for it, or only expired ones; otherwise binds the session and reports it.")
            .Produces(200).Produces(401).Produces(403).Produces(404).Produces(409).Produces(502);

        app.MapPost(DuesAdminPage.Path + "/{assessmentId:guid}/checkouts/{checkoutId:guid}/release",
                async (Guid assessmentId, Guid checkoutId, HttpContext context, DuesCheckout checkout, CancellationToken ct) =>
                {
                    var outcome = await checkout.ReleaseAsync(assessmentId, checkoutId, AdminName(context.User), ct);
                    context.Response.Headers.Location = $"{DuesAdminPage.Path}?notice=" + outcome.Result switch
                    {
                        ReleaseResult.Released => "checkout-released",
                        ReleaseResult.Bound => "checkout-bound",
                        ReleaseResult.StripeUnavailable or ReleaseResult.Mismatch => "checkout-stripe",
                        _ => "checkout-unchanged",
                    };
                    return Results.StatusCode(StatusCodes.Status303SeeOther);
                })
            .RequireAuthorization(GoogleSignIn.AdminPolicy)
            .AddEndpointFilter(SameOriginGuard.Filter)
            .ExcludeFromDescription();

        app.MapPost("/v1/webhooks/stripe",
                (DuesCheckout checkout, HttpContext context, CancellationToken ct) => checkout.WebhookAsync(context, ct))
            .WithTags("Dues")
            .WithSummary("Receive signed Stripe checkout events for the configured Stripe:Mode")
            .Produces(200).Produces(400).Produces(413).Produces(500);
    }
}

internal enum CheckoutReturn { Account, App, Web }

internal enum ReleaseResult { Released, Bound, NotFound, NotPending, AlreadyBound, OtherMode, TooRecent, Mismatch, StripeUnavailable }

internal sealed record ReleaseOutcome(ReleaseResult Result, string? SessionId = null, string? SessionStatus = null);

internal enum StripeMode { Test, Live }

internal sealed record CheckoutOutcome(Uri? Url, bool Finished = false, int ErrorStatus = 0, string? Error = null)
{
    public static CheckoutOutcome Failed(int status, string? error) => new(null, false, status, error);
}

/// <param name="ReturnTo">"app" (default) or "web".</param>
internal sealed record CheckoutSessionRequest(int AmountCents, string? ReturnTo = null);
internal sealed record CheckoutSessionResponse(string Url);

internal sealed record CheckoutSettings(
    string SecretKey, string WebhookSecret, string Origin, string? AppReturnUrl = null,
    StripeMode Mode = StripeMode.Test, string? WebReturnUrl = null)
{
    public string ModeName => Mode == StripeMode.Live ? "live" : "test";
    public string ProductName => Mode == StripeMode.Live ? "Claymores RFC dues" : "Claymores RFC dues (test)";
    public string RecordedBy => RecordedByFor(Mode);
    internal static string RecordedByFor(StripeMode mode) => mode == StripeMode.Live ? "stripe" : "stripe-test";

    public static CheckoutSettings Read(IConfiguration config, string environmentName)
    {
        var mode = ReadMode(config["Stripe:Mode"]);
        var key = config["Stripe:SecretKey"];
        var keyMode = key switch
        {
            _ when key is null => (StripeMode?)null,
            _ when key.StartsWith("sk_test_", StringComparison.Ordinal) || key.StartsWith("rk_test_", StringComparison.Ordinal)
                => StripeMode.Test,
            _ when key.StartsWith("sk_live_", StringComparison.Ordinal) || key.StartsWith("rk_live_", StringComparison.Ordinal)
                => StripeMode.Live,
            _ => null
        };
        var modeName = mode == StripeMode.Live ? "live" : "test";
        if (keyMode is null)
            throw new InvalidOperationException(
                $"Stripe:SecretKey must be a Stripe {modeName} secret or restricted key (sk_{modeName}_ or rk_{modeName}_).");
        if (keyMode != mode)
            throw new InvalidOperationException(
                $"Stripe:Mode is {modeName} but Stripe:SecretKey is a {(keyMode == StripeMode.Live ? "live" : "test")} key. " +
                $"Use an sk_{modeName}_ or rk_{modeName}_ key, or change Stripe:Mode.");

        if (mode == StripeMode.Live)
        {
            if (environmentName != Environments.Production)
                throw new InvalidOperationException(
                    "Stripe:Mode=live runs only with ASPNETCORE_ENVIRONMENT=Production.");
            if (!bool.TryParse(config["Stripe:LiveConfirmed"], out var confirmed) || !confirmed)
                throw new InvalidOperationException(
                    "Stripe:Mode=live also needs Stripe:LiveConfirmed=true. See the go-live checklist in api/README.md.");
        }

        var webhook = config["Stripe:WebhookSecret"];
        var origin = config["Stripe:ReturnOrigin"];
        if (webhook?.StartsWith("whsec_", StringComparison.Ordinal) != true ||
            !Uri.TryCreate(origin, UriKind.Absolute, out var url) || url.Scheme != Uri.UriSchemeHttps ||
            url.AbsolutePath != "/" || url.UserInfo.Length != 0 || url.Query.Length != 0 || url.Fragment.Length != 0)
            throw new InvalidOperationException("Stripe checkout needs a webhook secret (whsec_) and an HTTPS return origin.");

        return new(key!, webhook, url.GetLeftPart(UriPartial.Authority), ReadAppReturnUrl(config["Stripe:AppReturnUrl"]),
            mode, ReadWebReturnUrl(config["Stripe:WebReturnUrl"], environmentName));
    }

    internal static StripeMode ReadMode(string? value) => value?.Trim() switch
    {
        null or "" or "test" => StripeMode.Test,
        "live" => StripeMode.Live,
        _ => throw new InvalidOperationException("Stripe:Mode must be test or live.")
    };

    /// <summary>The app's return link, such as claymores://dues: a custom scheme or HTTPS, with no query or fragment.</summary>
    internal static string? ReadAppReturnUrl(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return null;
        value = value.Trim();
        string[] unsafeSchemes = [Uri.UriSchemeHttp, Uri.UriSchemeFile, "javascript", "data", "vbscript"];
        if (!Uri.TryCreate(value, UriKind.Absolute, out var url) || unsafeSchemes.Contains(url.Scheme) ||
            url.UserInfo.Length != 0 || value.Contains('?') || value.Contains('#'))
            throw new InvalidOperationException(
                "Stripe:AppReturnUrl must be an app link such as claymores://dues or an HTTPS URL, without a query or fragment.");
        return value;
    }

    /// <summary>
    /// The website's return page, such as https://www.claymoresrfc.com/account: an absolute HTTPS URL
    /// (HTTP only for a loopback host in Development), optionally with a query, without a fragment.
    /// </summary>
    internal static string? ReadWebReturnUrl(string? value, string environmentName)
    {
        if (string.IsNullOrWhiteSpace(value))
            return null;
        value = value.Trim();
        if (!Uri.TryCreate(value, UriKind.Absolute, out var url) || url.UserInfo.Length != 0 || value.Contains('#') ||
            url.Host.Length == 0 ||
            !(url.Scheme == Uri.UriSchemeHttps ||
              (url.Scheme == Uri.UriSchemeHttp && url.IsLoopback && environmentName == Environments.Development)))
            throw new InvalidOperationException(
                "Stripe:WebReturnUrl must be an absolute HTTPS URL without a fragment, such as https://www.claymoresrfc.com/account " +
                "(HTTP is allowed only for localhost in Development).");
        return value;
    }

    /// <summary>Appends a query parameter, keeping any query the URL already has.</summary>
    internal static string WithQuery(string url, string parameter) =>
        !url.Contains('?') ? $"{url}?{parameter}"
        : url.EndsWith('?') || url.EndsWith('&') ? url + parameter
        : $"{url}&{parameter}";
}
