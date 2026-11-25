using System.Globalization;
using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;

internal static class GoogleSignIn
{
    private const string Google = "ClubGoogle";
    internal const string Session = "ClubSession";
    internal const string RolePolicy = "ClubMember";
    internal const string AdminPolicy = "ClubAdmin";
    /// <summary>Picking lineups: coaches and the super admin.</summary>
    internal const string LineupPolicy = "ClubLineups";

    public static bool Configure(AuthenticationBuilder authentication, IConfiguration configuration)
    {
        var clientId = configuration["Authentication:Google:ClientId"];
        var clientSecret = configuration["Authentication:Google:ClientSecret"];
        if (string.IsNullOrWhiteSpace(clientId) && string.IsNullOrWhiteSpace(clientSecret))
            return false;
        if (string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(clientSecret))
            throw new InvalidOperationException("Configure both Google OAuth client settings.");

        authentication.AddCookie(Session, options =>
        {
            options.Cookie.Name = "__Host-claymores-session";
            options.Cookie.Path = "/";
            options.Cookie.HttpOnly = true;
            options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
            options.Cookie.SameSite = SameSiteMode.Lax;
            options.ExpireTimeSpan = TimeSpan.FromHours(8);
            options.SlidingExpiration = false;
            options.Events.OnRedirectToLogin = context =>
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                return Task.CompletedTask;
            };
            options.Events.OnRedirectToAccessDenied = context =>
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                return Task.CompletedTask;
            };
            options.Events.OnValidatePrincipal = async context =>
            {
                var identity = context.Principal?.Identity as ClaimsIdentity;
                var currentRole = await ClubRoles.ResolveAsync(context.Principal, configuration,
                    context.HttpContext.RequestServices.GetService<ClubInvitations>(), context.HttpContext.RequestAborted);
                if (identity is null || currentRole is null)
                {
                    context.RejectPrincipal();
                    await context.HttpContext.SignOutAsync(Session);
                    return;
                }
                if (ClubRoles.SetClaims(identity, identity.RoleClaimType, currentRole))
                    context.ShouldRenew = true;
            };
        });
        authentication.AddOpenIdConnect(Google, options =>
        {
            options.Authority = "https://accounts.google.com";
            options.ClientId = clientId;
            options.ClientSecret = clientSecret;
            options.CallbackPath = "/signin-google";
            options.SignInScheme = Session;
            options.ResponseType = "code";
            options.ResponseMode = "query";
            options.UsePkce = true;
            options.MapInboundClaims = false;
            options.ClaimActions.Remove("email_verified");
            options.SaveTokens = false;
            options.Scope.Add("email");
            options.Events.OnTokenValidated = async context =>
            {
                var invitations = context.HttpContext.RequestServices.GetService<ClubInvitations>();
                if (context.Principal?.Identity is not ClaimsIdentity identity ||
                    await ClubRoles.ResolveAsync(context.Principal, configuration, invitations,
                        context.HttpContext.RequestAborted) is not { } role)
                {
                    context.HandleResponse();
                    context.Response.StatusCode = StatusCodes.Status403Forbidden;
                    await context.Response.WriteAsync("This Google account has not been invited.");
                    return;
                }
                ClubRoles.SetClaims(identity, identity.RoleClaimType, role);
            };
            options.Events.OnTicketReceived = async context =>
            {
                var directory = context.HttpContext.RequestServices.GetService<ClubMemberDirectory>();
                var subject = context.Principal?.FindFirstValue("sub");
                var email = context.Principal?.FindFirstValue("email");
                if (directory is not null && subject is not null && email is not null)
                {
                    // One member per person (migration 016): the session carries the member's subject.
                    var signIn = new ClubMember(subject, email, context.Principal?.FindFirstValue("name"));
                    var member = await directory.ResolveAsync(signIn, context.HttpContext.RequestAborted);
                    await directory.ObserveSignInAsync(member, context.HttpContext.RequestAborted);
                    await directory.RememberIdentityAsync(subject, member.Subject, context.HttpContext.RequestAborted);
                    if (member.Subject != subject && context.Principal?.Identity is ClaimsIdentity identity)
                    {
                        identity.RemoveClaim(identity.FindFirst("sub"));
                        identity.AddClaim(new Claim("sub", member.Subject));
                    }
                    var automatic = context.HttpContext.RequestServices.GetService<AutomaticDues>();
                    if (automatic is not null && context.Principal is { } principal)
                        await automatic.EnsureAsync(principal, context.HttpContext.RequestAborted);
                }
            };
            options.Events.OnRemoteFailure = context =>
            {
                context.HandleResponse();
                context.Response.StatusCode = StatusCodes.Status400BadRequest;
                return context.Response.WriteAsync("Google sign-in could not be completed. Try again.");
            };
        });

        // The browser session cookie, plus API-issued bearer tokens when mobile sign-in is on.
        string[] schemes = MobileAuth.IsEnabled(configuration) ? [Session, MobileAuth.Scheme] : [Session];
        authentication.Services.AddAuthorization(options =>
        {
            options.AddPolicy(RolePolicy, policy => policy
                .AddAuthenticationSchemes(schemes).RequireAuthenticatedUser().RequireRole(ClubRoles.Player, ClubRoles.Admin));
            options.AddPolicy(AdminPolicy, policy => policy
                .AddAuthenticationSchemes(schemes).RequireAuthenticatedUser().RequireRole(ClubRoles.Admin));
            options.AddPolicy(LineupPolicy, policy => policy
                .AddAuthenticationSchemes(schemes).RequireAuthenticatedUser().RequireRole(ClubRoles.Coach));
        });
        return true;
    }

    public static void Map(WebApplication app, bool enabled)
    {
        app.MapGet("/auth/google", () => enabled
                ? Results.Challenge(new AuthenticationProperties { RedirectUri = "/auth/account" }, [Google])
                : Results.Problem("Google sign-in is not configured.", statusCode: 503))
            .WithTags("Sign-in")
            .WithSummary("Start Google sign-in in a browser")
            .Produces(StatusCodes.Status302Found)
            .ProducesProblem(StatusCodes.Status503ServiceUnavailable);

        if (!enabled)
            return;

        app.MapGet("/auth/account", async (HttpContext context, CancellationToken ct) =>
            {
                var checkoutMode = context.RequestServices.GetService<DuesCheckout>() is not null
                    ? context.RequestServices.GetRequiredService<CheckoutSettings>().Mode
                    : (StripeMode?)null;
                var checkoutEnabled = checkoutMode is not null;
                SetPageHeaders(context, checkoutEnabled);
                var name = HtmlEncoder.Default.Encode(
                    context.User.FindFirstValue("name") ?? context.User.FindFirstValue("email") ?? "Club member");
                var role = ClubRoles.Of(context.User) switch
                {
                    ClubRoles.SuperAdmin => "Super admin",
                    ClubRoles.Coach => "Coach",
                    ClubRoles.Admin => "Admin",
                    _ => "Player",
                };
                var ledger = context.RequestServices.GetService<DuesLedger>();
                var dues = ledger is null
                    ? ""
                    : RenderDues(await ledger.ListAsync(context.User.FindFirstValue("sub")!, ct), checkoutMode);
                var adminLink = ledger is not null && context.User.IsInRole("admin")
                    ? $"""<a class="button" href="{DuesAdminPage.Path}">Manage dues</a>"""
                    : "";
                if (context.User.IsInRole("admin") && context.RequestServices.GetService<JoinRequestStore>() is not null)
                    adminLink += $"""<a class="button" href="{JoinRequestAdminPage.Path}">Join requests</a>""";
                var checkoutNotice = checkoutEnabled ? RenderCheckoutNotice(context.Request.Query["checkout"]) : "";
                var deletion = context.RequestServices.GetService<AccountDeletion>() is null
                    ? ""
                    : RenderDeletion(context.Request.Query["deletion"]);
                return RenderPage("Club account", $"""
                    <section class="account-header">
                      <div>
                        <h1>Club account</h1>
                        <p>Signed in as <strong>{name}</strong></p>
                      </div>
                      <span class="role">{role}</span>
                    </section>
                    {checkoutNotice}
                    {dues}
                    <div class="account-footer">
                      {adminLink}
                      <form action="/auth/logout" method="post">
                        <button class="button button-secondary" type="submit">Sign out</button>
                      </form>
                    </div>
                    {deletion}
                    """);
            })
            .RequireAuthorization(RolePolicy)
            .ExcludeFromDescription();

        app.MapGet("/auth/session", (HttpContext context) =>
            {
                context.Response.Headers.CacheControl = "no-store";
                return Results.Ok(new
                {
                    subject = context.User.FindFirstValue("sub"),
                    name = context.User.FindFirstValue("name"),
                    email = context.User.FindFirstValue("email"),
                    role = ClubRoles.Of(context.User)
                });
            })
            .RequireAuthorization(RolePolicy)
            .ExcludeFromDescription();

        app.MapPost("/auth/logout", async (HttpContext context) =>
            {
                if (!await SameOriginGuard.IsAllowedAsync(context))
                    return Results.StatusCode(StatusCodes.Status403Forbidden);
                return Results.SignOut(
                    new AuthenticationProperties { RedirectUri = "/auth/signed-out" }, [Session]);
            })
            .RequireAuthorization(RolePolicy)
            .ExcludeFromDescription();

        app.MapGet("/auth/signed-out", (HttpContext context) =>
            {
                SetPageHeaders(context);
                return RenderPage("Signed out", """
                    <section class="account-header">
                      <div>
                        <h1>Signed out</h1>
                        <p>Your club account session has ended.</p>
                      </div>
                    </section>
                    <a class="button" href="/auth/google">Sign in with Google</a>
                    """);
            })
            .ExcludeFromDescription();

        app.MapGet("/auth/assets/account.css", () => Results.Content(AccountStyles, "text/css; charset=utf-8"))
            .ExcludeFromDescription();

        var brandPath = Path.Combine(app.Environment.ContentRootPath, "wwwroot", "brand");
        app.MapGet("/auth/assets/claymore.woff", () => Results.File(
                Path.Combine(brandPath, "claymore.woff"), "font/woff"))
            .ExcludeFromDescription();
        app.MapGet("/auth/assets/crest.png", () => Results.File(Path.Combine(brandPath, "crest.png"), "image/png"))
            .ExcludeFromDescription();
    }

    internal static void SetPageHeaders(HttpContext context, bool checkoutEnabled = false)
    {
        context.Response.Headers.CacheControl = "no-store";
        var checkoutOrigin = checkoutEnabled ? " https://checkout.stripe.com" : "";
        context.Response.Headers["Content-Security-Policy"] =
            $"default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'{checkoutOrigin}";
    }

    internal static IResult RenderPage(string title, string body) => Results.Content($"""
        <!doctype html>
        <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>{title} | Claymores RFC</title>
          <link rel="stylesheet" href="/auth/assets/account.css">
        </head>
        <body>
          <header class="club-header">
            <div class="shell club-brand">
              <img src="/auth/assets/crest.png" width="32" height="32" alt="">
              <span>Claymores RFC</span>
            </div>
          </header>
          <main class="shell">{body}</main>
        </body>
        </html>
        """, "text/html; charset=utf-8");

    /// <param name="checkoutMode">The Stripe mode when checkout is enabled; null hides checkout.</param>
    internal static string RenderDues(IReadOnlyList<DuesAssessment> assessments, StripeMode? checkoutMode)
    {
        if (assessments.Count == 0)
            return """<section class="dues"><h2>My dues</h2><p class="empty">No dues have been assigned.</p></section>""";

        var culture = CultureInfo.GetCultureInfo("en-US");
        string Dollars(long cents) => (cents / 100m).ToString("C", culture);
        var entries = assessments.Select(assessment =>
        {
            var description = HtmlEncoder.Default.Encode(assessment.Description);
            var dueDate = assessment.DueDate?.ToString("MMM d, yyyy", culture);
            var due = dueDate is null ? "" : $"""<p class="due-date">Due {dueDate}</p>""";
            var checkout = checkoutMode is { } mode ? RenderCheckout(assessment, mode) : "";
            return $"""
                <li class="assessment">
                  <h3>{description}</h3>
                  {due}
                  <dl class="amounts">
                    <div><dt>Assessed</dt><dd>{Dollars(assessment.AmountCents)}</dd></div>
                    <div><dt>Paid</dt><dd>{Dollars(assessment.PaidCents)}</dd></div>
                    <div class="balance"><dt>Remaining</dt><dd>{Dollars(assessment.BalanceCents)}</dd></div>
                  </dl>
                  {checkout}
                </li>
                """;
        });
        var paymentNote = checkoutMode switch
        {
            StripeMode.Test => """<p class="payment-note">Test checkout is enabled. Choose an amount to try a payment through Stripe.</p>""",
            StripeMode.Live => """<p class="payment-note">Pay by card. Choose an amount to pay securely through Stripe.</p>""",
            _ => ""
        };
        return $"""
            <section class="dues">
              <h2>My dues</h2>
              {paymentNote}
              <ul class="assessment-list">{string.Concat(entries)}</ul>
            </section>
            """;
    }

    /// <summary>The "Delete my account" form (POST /auth/account/delete), with its result notice.</summary>
    private static string RenderDeletion(string? notice)
    {
        var message = notice switch
        {
            "confirm" => """<p class="checkout-note notice-error" role="status">Tick the box to confirm, then delete your account.</p>""",
            "last-admin" => """<p class="checkout-note notice-error" role="status">You're the club's only admin. Make someone else an admin before deleting your account.</p>""",
            _ => ""
        };
        return $"""
            <section class="dues delete-account">
              <h2>Delete my account</h2>
              <p>This signs you out everywhere and removes your club sign-in and member record. The club keeps its
                 records of dues you were charged and paid.</p>
              {message}
              <form class="admin-form" action="/auth/account/delete" method="post">
                <label class="confirm-field"><input type="checkbox" name="confirm" value="delete" required>
                  I understand this can't be undone</label>
                <button class="button button-danger" type="submit">Delete my account</button>
              </form>
            </section>
            """;
    }

    private static string RenderCheckoutNotice(string? status) => status switch
    {
        "returned" => """<p class="checkout-note" role="status">Your balance updates after Stripe confirms the payment.</p>""",
        "cancelled" => """<p class="checkout-note" role="status">Checkout was cancelled. You can try again from your dues.</p>""",
        _ => ""
    };

    private static string RenderCheckout(DuesAssessment assessment, StripeMode mode)
    {
        var action = $"/auth/dues/{assessment.Id:D}/checkout";
        if (assessment.PendingCheckoutCents > 0)
        {
            var pending = assessment.PendingCheckoutCents / 100m;
            var payment = mode == StripeMode.Live ? "payment" : "test payment";
            return $"""
                <form class="checkout" action="{action}" method="post">
                  <p class="pending-payment">Pending {payment}: {pending.ToString("C", CultureInfo.GetCultureInfo("en-US"))}</p>
                  <input type="hidden" name="amount" value="{pending.ToString("0.00", CultureInfo.InvariantCulture)}">
                  <button class="button" type="submit">Resume {payment}</button>
                </form>
                """;
        }
        if (assessment.BalanceCents < 50)
            return "";

        const long maximumCheckoutCents = 99_999_999;
        var amount = (Math.Min(assessment.BalanceCents, maximumCheckoutCents) / 100m)
            .ToString("0.00", CultureInfo.InvariantCulture);
        return $"""
            <form class="checkout" action="{action}" method="post">
              <label for="amount-{assessment.Id:D}">Payment amount (USD)</label>
              <div class="checkout-controls">
                <input id="amount-{assessment.Id:D}" name="amount" type="number" inputmode="decimal"
                       min="0.50" max="{amount}" step="0.01" value="{amount}" required>
                <button class="button" type="submit">Continue to checkout</button>
              </div>
            </form>
            """;
    }

    private const string AccountStyles = """
        @font-face {
          font-family: Claymore;
          src: url("/auth/assets/claymore.woff") format("woff");
          font-weight: 400;
          font-display: swap;
        }
        :root {
          color-scheme: light;
          --text: #111111;
          --muted: #555555;
          --divider: #eaeaea;
          --pink: #fd80b5;
          --blue: #77c3ef;
          font-family: system-ui, Arial, sans-serif;
          color: var(--text);
          background: #fff;
        }
        * { box-sizing: border-box; }
        body { margin: 0; }
        .shell { width: min(100%, 48rem); margin-inline: auto; padding-inline: clamp(1rem, 4vw, 2rem); }
        .club-header { border-bottom: 1px solid var(--divider); }
        .club-brand { display: flex; align-items: center; gap: .7rem; min-height: 4rem; font-weight: 700; }
        .club-brand img { width: 2rem; height: 2rem; object-fit: contain; }
        main { padding-block: clamp(1.75rem, 5vw, 3.5rem); }
        h1, h2 { font-family: Claymore, system-ui, Arial, sans-serif; font-weight: 400; line-height: 1.1; }
        h1, h2, h3, p { margin: 0; }
        h1 { font-size: clamp(2.3rem, 7vw, 3.25rem); }
        h2 { font-size: clamp(1.65rem, 5vw, 2.1rem); }
        h3 { font-size: 1.1rem; overflow-wrap: anywhere; }
        p { color: var(--muted); line-height: 1.55; }
        .account-header {
          display: flex; flex-wrap: wrap; align-items: start; justify-content: space-between;
          gap: 1rem; padding-inline-start: 1rem; border-inline-start: .2rem solid var(--pink);
        }
        .account-header p { margin-top: .5rem; overflow-wrap: anywhere; }
        .account-header + .button { margin-top: 1.5rem; }
        .role {
          background: #edf8fe; color: var(--text); border: 1px solid var(--blue);
          border-radius: 999px; padding: .3rem .75rem; font-size: .875rem; font-weight: 650;
        }
        .checkout-note {
          background: #edf8fe; border: 1px solid var(--blue); border-radius: 8px;
          color: var(--text); margin-top: 1.5rem; padding: .75rem 1rem;
        }
        .dues { margin-top: 2.25rem; }
        .payment-note, .empty { margin-top: .5rem; }
        .assessment-list { display: grid; gap: .85rem; margin: 1rem 0 0; padding: 0; list-style: none; }
        .assessment { border: 1px solid var(--divider); border-radius: 8px; padding: clamp(1rem, 4vw, 1.4rem); }
        .due-date { margin-top: .3rem; font-size: .9rem; }
        .amounts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .5rem; margin: 1rem 0 0; }
        .amounts dt { color: var(--muted); font-size: .8rem; }
        .amounts dd { margin: .2rem 0 0; font-weight: 650; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
        .balance dd { font-size: 1.15rem; }
        .checkout { border-top: 1px solid var(--divider); margin-top: 1.1rem; padding-top: 1rem; }
        .pending-payment { margin-bottom: .5rem; }
        .checkout label { display: block; margin-bottom: .4rem; font-size: .9rem; font-weight: 650; }
        .checkout-controls { display: flex; flex-wrap: wrap; gap: .55rem; }
        .checkout input {
          width: 9rem; max-width: 100%; min-height: 2.75rem; border: 1px solid #767676;
          border-radius: 6px; padding: .5rem .65rem; color: var(--text); background: #fff; font: inherit;
        }
        .button {
          display: inline-flex; min-height: 2.75rem; align-items: center; justify-content: center;
          border: 1px solid var(--blue); border-radius: 6px; padding: .55rem .9rem;
          background: var(--blue); color: var(--text); font: inherit; font-weight: 650; text-decoration: none;
          cursor: pointer;
        }
        .button:hover { background: #a0d5f5; }
        .button-secondary { background: #fff; }
        :focus-visible { outline: .15rem solid var(--text); outline-offset: .2rem; }
        .account-footer {
          display: flex; flex-wrap: wrap; gap: .55rem;
          border-top: 1px solid var(--divider); margin-top: 2rem; padding-top: 1.25rem;
        }
        .admin-back { margin-bottom: 1.25rem; }
        .admin-back a, .history-link { color: #73324e; text-underline-offset: .15rem; }
        .notice-error { border-color: var(--pink); background: #fff1f7; }
        .admin-form { display: grid; justify-items: start; gap: .85rem; }
        .dues > .admin-form { margin-top: 1rem; }
        .admin-field {
          display: grid; width: 100%; min-width: 0; gap: .4rem;
          font-size: .9rem; font-weight: 650;
        }
        .admin-field input, .admin-field select {
          width: 100%; min-width: 0; min-height: 2.75rem; border: 1px solid #767676;
          border-radius: 6px; padding: .5rem .65rem; color: var(--text); background: #fff; font: inherit;
        }
        .admin-fields { display: grid; width: 100%; grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr)); gap: .75rem; }
        .admin-record { align-items: end; }
        .admin-record .admin-field { width: auto; margin-bottom: 0; }
        .admin-record input { width: 100%; }
        .amounts + p { margin-top: .65rem; }
        .join-details { margin: .75rem 0 0; display: grid; gap: .35rem; }
        .join-details dt { color: var(--muted); font-size: .8rem; }
        .join-details dd { margin: 0; overflow-wrap: anywhere; white-space: pre-wrap; }
        .join-actions { display: grid; gap: .75rem; border-top: 1px solid var(--divider); margin-top: 1rem; padding-top: 1rem; }
        .join-actions form { display: flex; flex-wrap: wrap; align-items: end; gap: .55rem; }
        .join-actions .admin-field { width: auto; flex: 1 1 11rem; }
        .delete-account { border-top: 1px solid var(--divider); padding-top: 1.25rem; }
        .delete-account .admin-form { margin-top: 1rem; }
        .confirm-field { display: flex; gap: .5rem; align-items: center; font-size: .9rem; }
        .button-danger { background: #fff1f7; border-color: var(--pink); }
        .button-danger:hover { background: #ffd9ea; }
        """;
}
