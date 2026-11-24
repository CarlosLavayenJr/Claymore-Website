using System.Globalization;
using System.Security.Claims;
using System.Text.Encodings.Web;

internal static class DuesAdminPage
{
    internal const string Path = "/auth/admin/dues";
    private static readonly CultureInfo DollarCulture = CultureInfo.GetCultureInfo("en-US");

    public static void Map(WebApplication app)
    {
        var routes = app.MapGroup(Path)
            .RequireAuthorization(GoogleSignIn.AdminPolicy)
            .ExcludeFromDescription();

        routes.MapGet("", ShowAsync);
        routes.MapGet("/{id:guid}", ShowHistoryAsync);
        routes.MapPost("", AssignAsync).AddEndpointFilter(SameOrigin);
        routes.MapPost("/{id:guid}/payments", RecordAsync).AddEndpointFilter(SameOrigin);
    }

    private static async Task<IResult> ShowAsync(
        HttpContext context, ClubMemberDirectory directory, DuesLedger ledger, CancellationToken ct)
    {
        GoogleSignIn.SetPageHeaders(context);
        var members = await directory.ListAsync(ct);
        var assessments = await ledger.ListAsync(null, ct);
        // Pending checkouts without a Stripe session, old enough for the treasurer to release.
        var unbound = (context.RequestServices.GetService<DuesCheckoutStore>() is { } checkouts
                ? await checkouts.ListUnboundAsync(DuesCheckout.ReleaseAfter, ct)
                : new List<CheckoutRecord>())
            .ToLookup(checkout => checkout.AssessmentId);
        var membersBySubject = members.ToDictionary(member => member.Subject, StringComparer.Ordinal);
        var notice = RenderNotice(context.Request.Query["notice"]);
        var entries = assessments.Count == 0
            ? """<p class="empty">No dues have been assigned.</p>"""
            : $"""<ul class="assessment-list">{string.Concat(assessments.Select(RenderEntry))}</ul>""";

        var joinLink = context.RequestServices.GetService<JoinRequestStore>() is null
            ? ""
            : $""" · <a href="{JoinRequestAdminPage.Path}">Join requests</a>""";
        return GoogleSignIn.RenderPage("Manage dues", $"""
            <div class="admin-back"><a href="/auth/account">Back to club account</a>{joinLink}</div>
            <section class="account-header">
              <div>
                <h1>Manage dues</h1>
                <p>Assign member dues and record payments you have already received.</p>
              </div>
              <span class="role">Treasurer</span>
            </section>
            {notice}
            <section class="dues">
              <h2>Assign dues</h2>
              {RenderAssignment(members)}
            </section>
            <section class="dues">
              <h2>Assigned dues</h2>
              {entries}
            </section>
            """);

        string RenderEntry(DuesAssessment assessment)
        {
            var member = membersBySubject.GetValueOrDefault(assessment.PlayerSubject);
            return RenderAssessment(assessment, member is null ? assessment.PlayerSubject : MemberLabel(member),
                unbound[assessment.Id]);
        }
    }

    private static async Task<IResult> ShowHistoryAsync(
        Guid id, HttpContext context, DuesLedger ledger, CancellationToken ct)
    {
        GoogleSignIn.SetPageHeaders(context);
        if (await ledger.DetailAsync(id, null, ct) is not { } detail)
            return Results.NotFound();

        var clubZone = TimeZoneInfo.FindSystemTimeZoneById("America/New_York");
        var entries = string.Concat(detail.Payments.Select(payment =>
        {
            var recorded = TimeZoneInfo.ConvertTimeFromUtc(payment.RecordedAt, clubZone)
                .ToString("MMM d, yyyy 'at' h:mm tt 'ET'", DollarCulture);
            return $"<li><strong>{Dollars(payment.AmountCents)}</strong> · {recorded}</li>";
        }));
        var history = entries.Length == 0
            ? """<p class="empty">No payments have been recorded.</p>"""
            : $"<ul>{entries}</ul>";

        return GoogleSignIn.RenderPage("Payment history", $"""
            <div class="admin-back"><a href="{Path}">Back to manage dues</a></div>
            <section class="account-header">
              <div>
                <h1>Payment history</h1>
                <p>{Encode(detail.Assessment.Description)}</p>
              </div>
              <span class="role">Treasurer</span>
            </section>
            <section class="dues">
              <h2>Recorded payments</h2>
              <p>Paid {Dollars(detail.Assessment.PaidCents)} · Remaining {Dollars(detail.Assessment.BalanceCents)}</p>
              {history}
            </section>
            """);
    }

    private static async Task<IResult> AssignAsync(
        HttpContext context, ClubMemberDirectory directory, DuesLedger ledger, CancellationToken ct)
    {
        if (!context.Request.HasFormContentType)
            return ReturnToPage(context, "invalid-assignment");

        var form = await context.Request.ReadFormAsync(ct);
        var subject = form["member"].ToString().Trim();
        var description = form["description"].ToString().Trim();
        var rawDueDate = form["dueDate"].ToString();
        DateOnly? dueDate = null;
        if (rawDueDate.Length != 0)
        {
            if (!DateOnly.TryParseExact(rawDueDate, "yyyy-MM-dd", CultureInfo.InvariantCulture,
                    DateTimeStyles.None, out var date) || date.Year is < 1900 or > 2200)
                return ReturnToPage(context, "invalid-date");
            dueDate = date;
        }

        if (!ReadId(form["requestId"], out var requestId) ||
            subject.Length is < 1 or > 255 || description.Length is < 1 or > 120 ||
            !TryReadCents(form["amount"], out var cents))
            return ReturnToPage(context, "invalid-assignment");

        var members = await directory.ListAsync(ct);
        if (!members.Any(member => member.Subject == subject))
            return ReturnToPage(context, "missing-member");

        var saved = await ledger.CreateAsync(new(requestId, subject, description, cents, dueDate), ct);
        return ReturnToPage(context, saved ? "assigned" : "conflict");
    }

    private static async Task<IResult> RecordAsync(
        Guid id, HttpContext context, DuesLedger ledger, CancellationToken ct)
    {
        if (!context.Request.HasFormContentType)
            return ReturnToPage(context, "invalid-payment");

        var form = await context.Request.ReadFormAsync(ct);
        if (!ReadId(form["requestId"], out var requestId) ||
            !TryReadCents(form["amount"], out var cents))
            return ReturnToPage(context, "invalid-payment");

        var admin = context.User.FindFirstValue("sub")!;
        var result = await ledger.RecordAsync(id, new(requestId, cents), admin, ct);
        return ReturnToPage(context, result switch
        {
            PaymentResult.Recorded => "recorded",
            PaymentResult.NotFound => "missing-assessment",
            PaymentResult.Overpayment => "overpayment",
            _ => "conflict"
        });
    }

    private static ValueTask<object?> SameOrigin(EndpointFilterInvocationContext context, EndpointFilterDelegate next) =>
        SameOriginGuard.Filter(context, next);

    private static IResult ReturnToPage(HttpContext context, string notice)
    {
        context.Response.Headers.Location = $"{Path}?notice={notice}";
        return Results.StatusCode(StatusCodes.Status303SeeOther);
    }

    private static bool ReadId(string? value, out Guid id) =>
        Guid.TryParseExact(value, "D", out id) && id != Guid.Empty;

    private static bool TryReadCents(string? value, out int cents)
    {
        cents = 0;
        if (!decimal.TryParse(value, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var dollars) ||
            dollars is < .01m or > int.MaxValue / 100m || decimal.Round(dollars, 2) != dollars)
            return false;
        cents = (int)(dollars * 100);
        return true;
    }

    private static string RenderAssignment(IReadOnlyList<ClubMember> members)
    {
        if (members.Count == 0)
            return """<p class="empty">A member appears here after signing in with Google.</p>""";

        var options = string.Concat(members.Select(member =>
            $"""<option value="{Encode(member.Subject)}">{Encode(MemberLabel(member))}</option>"""));
        return $"""
            <form class="assessment admin-form" action="{Path}" method="post">
              <input type="hidden" name="requestId" value="{Guid.NewGuid():D}">
              <label class="admin-field">Member
                <select name="member" required>
                  <option value="">Choose a member</option>
                  {options}
                </select>
              </label>
              <label class="admin-field">Description
                <input name="description" type="text" maxlength="120" required>
              </label>
              <div class="admin-fields">
                <label class="admin-field">Amount (USD)
                  <input name="amount" type="number" inputmode="decimal" min="0.01" step="0.01"
                         max="{Amount(int.MaxValue)}" required>
                </label>
                <label class="admin-field">Due date (optional)
                  <input name="dueDate" type="date" min="1900-01-01" max="2200-12-31">
                </label>
              </div>
              <button class="button" type="submit">Assign dues</button>
            </form>
            """;
    }

    private static string RenderAssessment(DuesAssessment assessment, string member, IEnumerable<CheckoutRecord> unbound)
    {
        var description = Encode(assessment.Description);
        var dueDate = assessment.DueDate is { } date ? $" · Due {date.ToString("MMM d, yyyy", DollarCulture)}" : "";
        var available = assessment.BalanceCents - assessment.PendingCheckoutCents;
        var pending = assessment.PendingCheckoutCents > 0
            ? $"<p>Pending checkout {Dollars(assessment.PendingCheckoutCents)}</p>"
            : "";
        var release = string.Concat(unbound.Select(checkout => $"""
            <form class="checkout admin-form" action="{Path}/{assessment.Id:D}/checkouts/{checkout.Id:D}/release" method="post">
              <p>This checkout never reached Stripe. Release it to let the member start a new one; Stripe is checked first.</p>
              <button class="button button-secondary" type="submit">Check Stripe and release</button>
            </form>
            """));
        var payment = available <= 0 ? "" : $"""
            <form class="checkout admin-form" action="{Path}/{assessment.Id:D}/payments" method="post">
              <input type="hidden" name="requestId" value="{Guid.NewGuid():D}">
              <div class="checkout-controls admin-record">
                <label class="admin-field">Payment received (USD)
                  <input name="amount" type="number" inputmode="decimal" min="0.01" step="0.01"
                         max="{Amount(available)}" required>
                </label>
                <button class="button" type="submit">Record payment</button>
              </div>
            </form>
            """;
        return $"""
            <li class="assessment">
              <h3>{description}</h3>
              <p class="due-date">{Encode(member)}{dueDate}</p>
              <dl class="amounts">
                <div><dt>Assessed</dt><dd>{Dollars(assessment.AmountCents)}</dd></div>
                <div><dt>Paid</dt><dd>{Dollars(assessment.PaidCents)}</dd></div>
                <div class="balance"><dt>Remaining</dt><dd>{Dollars(assessment.BalanceCents)}</dd></div>
              </dl>
              {pending}
              {release}
              <p><a class="history-link" href="{Path}/{assessment.Id:D}">View payment history</a></p>
              {payment}
            </li>
            """;
    }

    private static string RenderNotice(string? notice)
    {
        var message = notice switch
        {
            "assigned" => "Dues assigned.",
            "recorded" => "Payment recorded.",
            "invalid-assignment" => "Choose a member and enter a description and a valid USD amount.",
            "invalid-date" => "Enter a due date between 1900 and 2200.",
            "invalid-payment" => "Enter a positive USD amount with up to two decimal places.",
            "missing-member" => "Choose a member from the current list.",
            "missing-assessment" => "This assessment is no longer available.",
            "overpayment" => "The payment exceeds the available balance after pending checkout.",
            "conflict" => "This form was already used with different details. Try again from this page.",
            "checkout-released" => "Checkout released. Stripe had no payment for it, and the member can start a new one.",
            "checkout-bound" => "Stripe has a session for this checkout. It is now linked and settles through Stripe.",
            "checkout-stripe" => "Stripe could not confirm this checkout. Try again later.",
            "checkout-unchanged" => "This checkout was already settled or linked, or is less than an hour old.",
            _ => ""
        };
        if (message.Length == 0)
            return "";
        var style = notice is "assigned" or "recorded" or "checkout-released" or "checkout-bound" ? "" : " notice-error";
        return $"""<p class="checkout-note{style}" role="status">{message}</p>""";
    }

    private static string MemberLabel(ClubMember member) =>
        string.IsNullOrWhiteSpace(member.Name) ? member.Email : $"{member.Name} ({member.Email})";

    private static string Encode(string value) => HtmlEncoder.Default.Encode(value);
    private static string Dollars(long cents) => (cents / 100m).ToString("C", DollarCulture);
    private static string Amount(long cents) => (cents / 100m).ToString("0.00", CultureInfo.InvariantCulture);
}
