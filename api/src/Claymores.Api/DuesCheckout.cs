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
            CheckoutReturn.AccountPage, ct);
        return outcome switch
        {
            { Url: { } url } => Results.Redirect(url.AbsoluteUri),
            { Finished: true } => Results.Redirect("/auth/account?checkout=returned"),
            _ => Results.Problem(outcome.Error, statusCode: outcome.ErrorStatus)
        };
    }

    /// <summary>
    /// JSON for the app: returns the Stripe URL to open; Stripe then returns to Stripe:AppReturnUrl.
    /// Bearer callers need no CSRF check, but cookie callers must be same-origin (<see cref="SameOriginGuard"/>).
    /// </summary>
    public async Task<IResult> StartForAppAsync(Guid assessmentId, CheckoutSessionRequest request, HttpContext context,
        CancellationToken ct)
    {
        context.Response.Headers.CacheControl = "no-store";
        if (!await SameOriginGuard.IsAllowedAsync(context))
            return Results.StatusCode(403);
        var bearer = await context.AuthenticateAsync(MobileAuth.Scheme);
        if (request.AmountCents is < MinimumCents or > MaximumCents)
            return Results.Problem($"amountCents must be from {MinimumCents} to {MaximumCents}.", statusCode: 400);

        var subject = (bearer.Succeeded ? bearer.Principal! : context.User).FindFirstValue("sub")!;
        var outcome = await OpenAsync(assessmentId, subject, request.AmountCents, CheckoutReturn.App, ct);
        return outcome switch
        {
            { Url: { } url } => Results.Ok(new CheckoutSessionResponse(url.AbsoluteUri)),
            { Finished: true } => Results.Problem(
                "This payment is already complete or closed. Refresh your dues to see the result.", statusCode: 409),
            _ => Results.Problem(outcome.Error, statusCode: outcome.ErrorStatus)
        };
    }

    /// <summary>
    /// Shared by both entry points: reserve (or resume the pending reservation), then create
    /// or fetch the Stripe session under a stable idempotency key.
    /// </summary>
    private async Task<CheckoutOutcome> OpenAsync(Guid assessmentId, string subject, int amountCents,
        CheckoutReturn target, CancellationToken ct)
    {
        var reservation = await store.ReserveAsync(assessmentId, subject, amountCents, ct);
        if (reservation.Checkout is not { } attempt)
            return CheckoutOutcome.Failed(reservation.ErrorStatus, reservation.Error);

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

                var options = new SessionCreateOptions
                {
                    Mode = "payment",
                    ClientReferenceId = attempt.Id.ToString("D"),
                    SuccessUrl = ReturnUrl(target, "returned"),
                    CancelUrl = ReturnUrl(target, "cancelled"),
                    Metadata = new Dictionary<string, string> { ["purpose"] = "claymores-test-dues" },
                    LineItems =
                    [
                        new()
                        {
                            Quantity = 1,
                            PriceData = new()
                            {
                                Currency = "usd",
                                UnitAmount = attempt.AmountCents,
                                ProductData = new() { Name = "Claymores RFC dues (test)" }
                            }
                        }
                    ]
                };
                options.AddExtraParam("payment_method_types", new[] { "card" });
                session = await stripe.CreateAsync(
                    options, new RequestOptions { IdempotencyKey = $"claymores-dues-test-{attempt.Id:D}" }, ct);
            }
        }
        catch (StripeException error)
        {
            logger.LogWarning("Stripe test checkout request failed with status {Status} for attempt {Attempt}.",
                error.HttpStatusCode, attempt.Id);
            return CheckoutOutcome.Failed(502,
                "Test checkout is temporarily unavailable. Try again to resume the same payment.");
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

    private string ReturnUrl(CheckoutReturn target, string status) => target switch
    {
        CheckoutReturn.App => settings.AppReturnUrl is { } app
            ? $"{app}?checkout={status}"
            : throw new InvalidOperationException("Stripe:AppReturnUrl is not configured."),
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
        Event stripeEvent;
        try
        {
            stripeEvent = EventUtility.ConstructEvent(body, request.Headers["Stripe-Signature"], settings.WebhookSecret);
        }
        catch (StripeException)
        {
            return Results.BadRequest("Invalid Stripe webhook.");
        }
        catch (Newtonsoft.Json.JsonException)
        {
            return Results.BadRequest("Invalid Stripe webhook.");
        }

        var paid = stripeEvent.Type == "checkout.session.completed";
        if (!paid && stripeEvent.Type != "checkout.session.expired")
            return Results.Ok();
        if (stripeEvent.Livemode || stripeEvent.Data?.Object is not Session session)
            return Results.BadRequest("Invalid Stripe test checkout event.");
        if (session.Metadata?.GetValueOrDefault("purpose") != "claymores-test-dues")
            return Results.Ok();

        if (!Guid.TryParse(session.ClientReferenceId, out var attempt) ||
            session.AmountTotal is not { } amount || !MatchesAttempt(session, attempt, amount) ||
            (paid ? session.Status != "complete" || session.PaymentStatus != "paid"
                  : session.Status != "expired" || session.PaymentStatus != "unpaid"))
            return Results.BadRequest("Invalid Stripe checkout status or amount.");

        if (await store.ApplyEventAsync(attempt, session.Id, amount, paid, ct))
            return Results.Ok();

        logger.LogError("Stripe test event {Event} could not be matched to checkout {Attempt}.", stripeEvent.Id, attempt);
        return Results.Problem("Checkout needs reconciliation.", statusCode: 500);
    }

    private static bool MatchesAttempt(Session session, Guid attempt, long amount) =>
        !session.Livemode && session.Id?.StartsWith("cs_test_", StringComparison.Ordinal) == true && session.Mode == "payment" &&
        session.Currency == "usd" && session.AmountTotal == amount &&
        session.Metadata?.GetValueOrDefault("purpose") == "claymores-test-dues" &&
        Guid.TryParse(session.ClientReferenceId, out var reference) && reference == attempt;

    public static void Map(WebApplication app, bool appCheckout)
    {
        app.MapPost("/auth/dues/{assessmentId:guid}/checkout",
                (Guid assessmentId, DuesCheckout checkout, HttpContext context, CancellationToken ct) =>
                    checkout.StartAsync(assessmentId, context, ct))
            .RequireAuthorization(GoogleSignIn.RolePolicy)
            .WithTags("Dues")
            .WithSummary("Start or resume a player dues checkout in Stripe test mode")
            .Accepts<IFormCollection>("application/x-www-form-urlencoded")
            .Produces(302).Produces(400).Produces(401).Produces(403).Produces(404).Produces(409).Produces(502);

        if (appCheckout)
        {
            app.MapPost("/v1/dues/{assessmentId:guid}/checkout-session",
                    (Guid assessmentId, CheckoutSessionRequest request, DuesCheckout checkout, HttpContext context,
                        CancellationToken ct) => checkout.StartForAppAsync(assessmentId, request, context, ct))
                .RequireAuthorization(GoogleSignIn.RolePolicy)
                .WithTags("Dues")
                .WithSummary("Start or resume a dues checkout in Stripe test mode and get its URL")
                .WithDescription("For the app. Stripe returns to Stripe:AppReturnUrl with ?checkout=returned or " +
                    "?checkout=cancelled. A pending checkout for the assessment is resumed with its original amount.")
                .Produces<CheckoutSessionResponse>()
                .ProducesProblem(400).Produces(401).Produces(403).ProducesProblem(404).ProducesProblem(409)
                .ProducesProblem(502);
        }

        app.MapPost("/v1/webhooks/stripe",
                (DuesCheckout checkout, HttpContext context, CancellationToken ct) => checkout.WebhookAsync(context, ct))
            .WithTags("Dues")
            .WithSummary("Receive signed Stripe test checkout events")
            .Produces(200).Produces(400).Produces(413).Produces(500);
    }
}

internal enum CheckoutReturn { AccountPage, App }

internal sealed record CheckoutOutcome(Uri? Url, bool Finished = false, int ErrorStatus = 0, string? Error = null)
{
    public static CheckoutOutcome Failed(int status, string? error) => new(null, false, status, error);
}

internal sealed record CheckoutSessionRequest(int AmountCents);
internal sealed record CheckoutSessionResponse(string Url);

internal sealed record CheckoutSettings(string SecretKey, string WebhookSecret, string Origin, string? AppReturnUrl = null)
{
    public static CheckoutSettings Read(IConfiguration config)
    {
        var key = config["Stripe:SecretKey"];
        var webhook = config["Stripe:WebhookSecret"];
        var origin = config["Stripe:ReturnOrigin"];
        if (key?.StartsWith("sk_test_", StringComparison.Ordinal) != true ||
            webhook?.StartsWith("whsec_", StringComparison.Ordinal) != true ||
            !Uri.TryCreate(origin, UriKind.Absolute, out var url) || url.Scheme != Uri.UriSchemeHttps ||
            url.AbsolutePath != "/" || url.UserInfo.Length != 0 || url.Query.Length != 0 || url.Fragment.Length != 0)
            throw new InvalidOperationException("Stripe test checkout needs a test secret key, webhook secret, and HTTPS return origin.");

        return new(key, webhook, url.GetLeftPart(UriPartial.Authority), ReadAppReturnUrl(config["Stripe:AppReturnUrl"]));
    }

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
}
