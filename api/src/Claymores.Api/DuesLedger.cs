using System.Security.Claims;
using Npgsql;

internal sealed record DuesAssessment(
    Guid Id, string PlayerSubject, string Description, int AmountCents, DateOnly? DueDate,
    long PaidCents, long BalanceCents, long PendingCheckoutCents);
internal sealed record DuesPayment(Guid Id, int AmountCents, DateTime RecordedAt);
internal sealed record DuesDetail(DuesAssessment Assessment, IReadOnlyList<DuesPayment> Payments);
internal sealed record CreateAssessment(Guid Id, string? PlayerSubject, string? Description, int AmountCents, DateOnly? DueDate);
internal sealed record RecordDuesPayment(Guid Id, int AmountCents);

internal sealed class DuesLedger(NpgsqlDataSource dataSource)
{
    private const string AssessmentQuery = """
        SELECT a.id, a.player_subject, a.description, a.amount_cents, a.due_date,
          COALESCE((SELECT sum(amount_cents) FROM dues_payments WHERE assessment_id = a.id), 0),
          COALESCE((SELECT sum(amount_cents) FROM dues_checkouts
                    WHERE assessment_id = a.id AND status = 'pending'), 0)
        FROM dues_assessments a
        """;

    public async Task<List<DuesAssessment>> ListAsync(string? subject, CancellationToken ct)
    {
        var sql = AssessmentQuery + (subject is null ? "" : " WHERE a.player_subject = @subject") +
            " ORDER BY a.created_at DESC, a.id";
        await using var cmd = dataSource.CreateCommand(sql);
        if (subject is not null) cmd.Parameters.AddWithValue("subject", subject);
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        var results = new List<DuesAssessment>();
        while (await reader.ReadAsync(ct)) results.Add(ReadAssessment(reader));
        return results;
    }

    public async Task<DuesDetail?> DetailAsync(Guid id, string? subject, CancellationToken ct)
    {
        await using var connection = await dataSource.OpenConnectionAsync(ct);
        await using var transaction = await connection.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead, ct);
        var sql = AssessmentQuery + " WHERE a.id = @id" + (subject is null ? "" : " AND a.player_subject = @subject");
        DuesAssessment assessment;
        await using (var cmd = new NpgsqlCommand(sql, connection, transaction))
        {
            cmd.Parameters.AddWithValue("id", id);
            if (subject is not null) cmd.Parameters.AddWithValue("subject", subject);
            await using var reader = await cmd.ExecuteReaderAsync(ct);
            if (!await reader.ReadAsync(ct)) return null;
            assessment = ReadAssessment(reader);
        }

        await using var payments = new NpgsqlCommand("""
            SELECT id, amount_cents, recorded_at FROM dues_payments
            WHERE assessment_id = @id ORDER BY recorded_at, id
            """, connection, transaction);
        payments.Parameters.AddWithValue("id", id);
        await using var paymentReader = await payments.ExecuteReaderAsync(ct);
        var entries = new List<DuesPayment>();
        while (await paymentReader.ReadAsync(ct))
            entries.Add(new(paymentReader.GetGuid(0), paymentReader.GetInt32(1), paymentReader.GetDateTime(2)));
        return new(assessment, entries);
    }

    public async Task<bool> CreateAsync(CreateAssessment assessment, CancellationToken ct)
    {
        await using var cmd = dataSource.CreateCommand("""
            INSERT INTO dues_assessments (id, player_subject, description, amount_cents, due_date)
            VALUES (@id, @subject, @description, @amount, @due_date)
            ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id
            WHERE dues_assessments.player_subject = EXCLUDED.player_subject
              AND dues_assessments.description = EXCLUDED.description
              AND dues_assessments.amount_cents = EXCLUDED.amount_cents
              AND dues_assessments.due_date IS NOT DISTINCT FROM EXCLUDED.due_date
            """);
        cmd.Parameters.AddWithValue("id", assessment.Id);
        cmd.Parameters.AddWithValue("subject", assessment.PlayerSubject!);
        cmd.Parameters.AddWithValue("description", assessment.Description!);
        cmd.Parameters.AddWithValue("amount", assessment.AmountCents);
        cmd.Parameters.Add("due_date", NpgsqlTypes.NpgsqlDbType.Date).Value =
            (object?)assessment.DueDate ?? DBNull.Value;
        return await cmd.ExecuteNonQueryAsync(ct) == 1;
    }

    public async Task<PaymentResult> RecordAsync(Guid assessmentId, RecordDuesPayment payment, string admin, CancellationToken ct)
    {
        await using var connection = await dataSource.OpenConnectionAsync(ct);
        await using var transaction = await connection.BeginTransactionAsync(ct);
        // Serialize payments for one assessment so concurrent partial payments cannot overpay it.
        await using var assessment = new NpgsqlCommand(
            "SELECT amount_cents FROM dues_assessments WHERE id = @id FOR UPDATE", connection, transaction);
        assessment.Parameters.AddWithValue("id", assessmentId);
        if (await assessment.ExecuteScalarAsync(ct) is not int amount) return PaymentResult.NotFound;

        await using (var replay = new NpgsqlCommand(
            "SELECT assessment_id, amount_cents FROM dues_payments WHERE id = @id", connection, transaction))
        {
            replay.Parameters.AddWithValue("id", payment.Id);
            await using var reader = await replay.ExecuteReaderAsync(ct);
            if (await reader.ReadAsync(ct))
                return reader.GetGuid(0) == assessmentId && reader.GetInt32(1) == payment.AmountCents
                    ? PaymentResult.Recorded : PaymentResult.Conflict;
        }

        await using var sum = new NpgsqlCommand(
            """
            SELECT COALESCE((SELECT sum(amount_cents) FROM dues_payments WHERE assessment_id = @id), 0)
                + COALESCE((SELECT sum(amount_cents) FROM dues_checkouts
                            WHERE assessment_id = @id AND status = 'pending'), 0)
            """, connection, transaction);
        sum.Parameters.AddWithValue("id", assessmentId);
        var paid = (long)(await sum.ExecuteScalarAsync(ct))!;
        if (payment.AmountCents > amount - paid) return PaymentResult.Overpayment;

        await using var insert = new NpgsqlCommand("""
            INSERT INTO dues_payments (id, assessment_id, amount_cents, recorded_by)
            VALUES (@id, @assessment, @amount, @admin)
            ON CONFLICT (id) DO NOTHING
            """, connection, transaction);
        insert.Parameters.AddWithValue("id", payment.Id);
        insert.Parameters.AddWithValue("assessment", assessmentId);
        insert.Parameters.AddWithValue("amount", payment.AmountCents);
        insert.Parameters.AddWithValue("admin", admin);
        if (await insert.ExecuteNonQueryAsync(ct) == 0) return PaymentResult.Conflict;
        await transaction.CommitAsync(ct);
        return PaymentResult.Recorded;
    }

    private static DuesAssessment ReadAssessment(NpgsqlDataReader reader)
    {
        var amount = reader.GetInt32(3);
        var paid = reader.GetInt64(5);
        return new(reader.GetGuid(0), reader.GetString(1), reader.GetString(2), amount,
            reader.IsDBNull(4) ? null : reader.GetFieldValue<DateOnly>(4), paid, amount - paid, reader.GetInt64(6));
    }
}

internal enum PaymentResult { Recorded, NotFound, Conflict, Overpayment }

internal static class DuesEndpoints
{
    public static void Map(WebApplication app)
    {
        var member = app.MapGroup("/v1/dues").WithTags("Dues").RequireAuthorization(GoogleSignIn.RolePolicy);
        member.AddEndpointFilter(NoStore);
        member.MapGet("/mine", async (ClaimsPrincipal user, DuesLedger ledger, CancellationToken ct) =>
            Results.Ok(await ledger.ListAsync(user.FindFirstValue("sub")!, ct)))
            .WithSummary("List my dues and balances").Produces<List<DuesAssessment>>().Produces(401);
        member.MapGet("/mine/{id:guid}", async (Guid id, ClaimsPrincipal user, DuesLedger ledger, CancellationToken ct) =>
            await ledger.DetailAsync(id, user.FindFirstValue("sub")!, ct) is { } detail
                ? Results.Ok(detail) : Results.NotFound())
            .WithSummary("Get my dues and payment history").Produces<DuesDetail>().Produces(401).Produces(404);

        var admin = app.MapGroup("/v1/admin/dues").WithTags("Dues").RequireAuthorization(GoogleSignIn.AdminPolicy);
        admin.AddEndpointFilter(NoStore);
        admin.MapGet("/", async (DuesLedger ledger, CancellationToken ct) => Results.Ok(await ledger.ListAsync(null, ct)))
            .WithSummary("List club dues").Produces<List<DuesAssessment>>().Produces(401).Produces(403);
        admin.MapGet("/{id:guid}", async (Guid id, DuesLedger ledger, CancellationToken ct) =>
            await ledger.DetailAsync(id, null, ct) is { } detail ? Results.Ok(detail) : Results.NotFound())
            .WithSummary("Get club dues and payment history").Produces<DuesDetail>().Produces(401).Produces(403).Produces(404);
        admin.MapPost("/", async (CreateAssessment request, DuesLedger ledger, CancellationToken ct) =>
        {
            var subject = request.PlayerSubject?.Trim();
            var description = request.Description?.Trim();
            if (request.Id == Guid.Empty || request.AmountCents <= 0 ||
                subject is null || subject.Length is < 1 or > 255 ||
                description is null || description.Length is < 1 or > 120)
                return Results.BadRequest(new { error = "Provide an ID, player subject, description, and positive amount in cents." });

            return await ledger.CreateAsync(request with { PlayerSubject = subject, Description = description }, ct)
                ? Results.Created($"/v1/admin/dues/{request.Id}", new { request.Id })
                : Results.Conflict(new { error = "Assessment ID is already in use." });
        }).AddEndpointFilter(SameOrigin)
            .WithSummary("Assign dues to a member").Produces(201).Produces(400).Produces(401).Produces(403).Produces(409);
        admin.MapPost("/{id:guid}/payments", async (Guid id, RecordDuesPayment request, ClaimsPrincipal user, DuesLedger ledger, CancellationToken ct) =>
        {
            if (request.Id == Guid.Empty || request.AmountCents <= 0)
                return Results.BadRequest(new { error = "Provide a payment ID and positive amount in cents." });

            return await ledger.RecordAsync(id, request, user.FindFirstValue("sub")!, ct) switch
            {
                PaymentResult.Recorded => Results.Ok(new { request.Id }),
                PaymentResult.NotFound => Results.NotFound(),
                PaymentResult.Overpayment => Results.Conflict(new { error = "Payment exceeds the available balance after any pending checkout." }),
                _ => Results.Conflict(new { error = "Payment ID is already in use." })
            };
        }).AddEndpointFilter(SameOrigin)
            .WithSummary("Record a full or partial payment already received").Produces(200).Produces(400).Produces(401).Produces(403).Produces(404).Produces(409);
    }

    private static ValueTask<object?> NoStore(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        context.HttpContext.Response.Headers.CacheControl = "no-store";
        return next(context);
    }

    private static ValueTask<object?> SameOrigin(EndpointFilterInvocationContext context, EndpointFilterDelegate next) =>
        SameOriginGuard.Filter(context, next);
}
