using System.Globalization;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Http.Features;
using Stripe;
using Stripe.Checkout;

internal sealed class DuesCheckout(
    DuesCheckoutStore store, SessionService stripe, CheckoutSettings settings, ILogger<DuesCheckout> logger)
{
    public async Task<IResult> StartAsync(Guid assessmentId, HttpContext context, CancellationToken ct)
    {
        context.Response.Headers.CacheControl = "no-store";
        if (context.Request.Headers["Sec-Fetch-Site"] != "same-origin")
            return Results.StatusCode(403);
        if (!context.Request.HasFormContentType)
            return Results.BadRequest("Submit the checkout form on your club account page.");

        var form = await context.Request.ReadFormAsync(ct);
        if (!decimal.TryParse(form["amount"], NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var dollars) ||
            dollars is < 0.50m or > 999999.99m || decimal.Round(dollars, 2) != dollars)
            return Results.BadRequest("Enter a USD amount of at least $0.50 with at most two decimal places.");

        var reservation = await store.ReserveAsync(
            assessmentId, context.User.FindFirstValue("sub")!, (int)(dollars * 100), ct);
        if (reservation.Checkout is not { } attempt)
            return Results.Problem(reservation.Error, statusCode: reservation.ErrorStatus);

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
                    return Results.Problem("This checkout needs reconciliation before you can start a new one.", statusCode: 409);

                var options = new SessionCreateOptions
                {
                    Mode = "payment",
                    ClientReferenceId = attempt.Id.ToString("D"),
                    SuccessUrl = settings.Origin + "/auth/account?checkout=returned",
                    CancelUrl = settings.Origin + "/auth/account?checkout=cancelled",
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
            return Results.Problem("Test checkout is temporarily unavailable. Try again to resume the same payment.",
                statusCode: 502);
        }

        if (!MatchesAttempt(session, attempt.Id, attempt.AmountCents))
            return Results.Problem("Stripe returned an unexpected checkout session.", statusCode: 502);

        await store.BindAsync(attempt.Id, session.Id, ct);
        if (session.Status != "open")
            return Results.Redirect("/auth/account?checkout=returned");

        if (!Uri.TryCreate(session.Url, UriKind.Absolute, out var url) ||
            url.Scheme != Uri.UriSchemeHttps || url.Host != "checkout.stripe.com" ||
            !url.IsDefaultPort || url.UserInfo.Length != 0)
            return Results.Problem("Stripe returned an unexpected checkout URL.", statusCode: 502);

        return Results.Redirect(url.AbsoluteUri);
    }

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

    public static void Map(WebApplication app)
    {
        app.MapPost("/auth/dues/{assessmentId:guid}/checkout",
                (Guid assessmentId, DuesCheckout checkout, HttpContext context, CancellationToken ct) =>
                    checkout.StartAsync(assessmentId, context, ct))
            .RequireAuthorization(GoogleSignIn.RolePolicy)
            .WithTags("Dues")
            .WithSummary("Start or resume a player dues checkout in Stripe test mode")
            .Accepts<IFormCollection>("application/x-www-form-urlencoded")
            .Produces(302).Produces(400).Produces(401).Produces(403).Produces(404).Produces(409).Produces(502);

        app.MapPost("/v1/webhooks/stripe",
                (DuesCheckout checkout, HttpContext context, CancellationToken ct) => checkout.WebhookAsync(context, ct))
            .WithTags("Dues")
            .WithSummary("Receive signed Stripe test checkout events")
            .Produces(200).Produces(400).Produces(413).Produces(500);
    }
}

internal sealed record CheckoutSettings(string SecretKey, string WebhookSecret, string Origin)
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

        return new(key, webhook, url.GetLeftPart(UriPartial.Authority));
    }
}
