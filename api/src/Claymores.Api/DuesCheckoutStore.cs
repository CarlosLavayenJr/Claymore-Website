using Npgsql;

/// <param name="ReturnTo">Where Stripe returns the player; null for rows created before it was stored.</param>
/// <param name="Mode">The Stripe mode that created the row; null for rows created before it was stored (test).</param>
internal sealed record CheckoutReservation(Guid Id, int AmountCents, DateTime CreatedAt, string? SessionId,
    CheckoutReturn? ReturnTo = null, StripeMode? Mode = null);
internal sealed record ReservationResult(CheckoutReservation? Checkout, int ErrorStatus = 0, string? Error = null);

internal sealed class DuesCheckoutStore(NpgsqlDataSource dataSource)
{
    public async Task<ReservationResult> ReserveAsync(Guid assessmentId, string subject, int requested,
        CheckoutReturn returnTo, StripeMode mode, CancellationToken ct)
    {
        await using var connection = await dataSource.OpenConnectionAsync(ct);
        await using var tx = await connection.BeginTransactionAsync(ct);
        await using var assessment = new NpgsqlCommand("""
            SELECT amount_cents FROM dues_assessments
            WHERE id = @id AND player_subject = @subject FOR UPDATE
            """, connection, tx);
        assessment.Parameters.AddWithValue("id", assessmentId);
        assessment.Parameters.AddWithValue("subject", subject);
        if (await assessment.ExecuteScalarAsync(ct) is not int assessmentAmount)
            return new(null, 404, "Dues assessment not found.");

        await using (var pending = new NpgsqlCommand("""
            SELECT id, amount_cents, created_at, stripe_session_id, return_to, stripe_mode FROM dues_checkouts
            WHERE assessment_id = @assessment AND status = 'pending'
            """, connection, tx))
        {
            pending.Parameters.AddWithValue("assessment", assessmentId);
            await using var reader = await pending.ExecuteReaderAsync(ct);
            if (await reader.ReadAsync(ct))
            {
                // Always resume the original amount, even if a browser retries with different input.
                return new(new(reader.GetGuid(0), reader.GetInt32(1), reader.GetDateTime(2),
                    reader.IsDBNull(3) ? null : reader.GetString(3),
                    reader.IsDBNull(4) ? null : ParseReturn(reader.GetString(4)),
                    reader.IsDBNull(5) ? null : reader.GetString(5) == "live" ? StripeMode.Live : StripeMode.Test));
            }
        }

        await using var sum = new NpgsqlCommand(
            "SELECT COALESCE(sum(amount_cents), 0) FROM dues_payments WHERE assessment_id = @id", connection, tx);
        sum.Parameters.AddWithValue("id", assessmentId);
        var paid = (long)(await sum.ExecuteScalarAsync(ct))!;
        if (requested > assessmentAmount - paid)
            return new(null, 409, "Payment exceeds the remaining balance.");

        var attempt = Guid.NewGuid();
        await using var insert = new NpgsqlCommand("""
            INSERT INTO dues_checkouts (id, assessment_id, amount_cents, status, return_to, stripe_mode)
            VALUES (@id, @assessment, @amount, 'pending', @return_to, @mode) RETURNING created_at
            """, connection, tx);
        insert.Parameters.AddWithValue("id", attempt);
        insert.Parameters.AddWithValue("assessment", assessmentId);
        insert.Parameters.AddWithValue("amount", requested);
        insert.Parameters.AddWithValue("return_to", DuesCheckout.Name(returnTo));
        insert.Parameters.AddWithValue("mode", ModeName(mode));
        var created = (DateTime)(await insert.ExecuteScalarAsync(ct))!;
        await tx.CommitAsync(ct);
        return new(new(attempt, requested, created, null, returnTo, mode));
    }

    public async Task BindAsync(Guid id, string sessionId, CancellationToken ct)
    {
        await using var cmd = dataSource.CreateCommand("""
            UPDATE dues_checkouts SET stripe_session_id = @session
            WHERE id = @id AND (stripe_session_id IS NULL OR stripe_session_id = @session)
            """);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("session", sessionId);
        if (await cmd.ExecuteNonQueryAsync(ct) != 1)
            throw new InvalidOperationException("Stripe session did not match its checkout reservation.");
    }

    private static CheckoutReturn ParseReturn(string value) => value switch
    {
        "app" => CheckoutReturn.App,
        "web" => CheckoutReturn.Web,
        _ => CheckoutReturn.Account
    };

    private static string ModeName(StripeMode mode) => mode == StripeMode.Live ? "live" : "test";

    /// <summary>
    /// Applies a verified event. Rows from another Stripe mode never match (rows without a stored mode are test).
    /// A paid event records the payment as <c>stripe</c> (live) or <c>stripe-test</c>.
    /// </summary>
    public async Task<bool> ApplyEventAsync(Guid attempt, string sessionId, long amount, bool paid, StripeMode mode,
        CancellationToken ct)
    {
        await using var connection = await dataSource.OpenConnectionAsync(ct);
        await using var tx = await connection.BeginTransactionAsync(ct);
        await using var assessment = new NpgsqlCommand("""
            SELECT a.id FROM dues_assessments a
            JOIN dues_checkouts c ON c.assessment_id = a.id WHERE c.id = @id
            FOR UPDATE OF a
            """, connection, tx);
        assessment.Parameters.AddWithValue("id", attempt);
        if (await assessment.ExecuteScalarAsync(ct) is not Guid assessmentId)
            return false;

        string current;
        await using (var reservation = new NpgsqlCommand("""
            SELECT amount_cents, status, stripe_session_id, COALESCE(stripe_mode, 'test') FROM dues_checkouts
            WHERE id = @id FOR UPDATE
            """, connection, tx))
        {
            reservation.Parameters.AddWithValue("id", attempt);
            await using var reader = await reservation.ExecuteReaderAsync(ct);
            if (!await reader.ReadAsync(ct) || reader.GetInt32(0) != amount ||
                (!reader.IsDBNull(2) && reader.GetString(2) != sessionId) || reader.GetString(3) != ModeName(mode))
                return false;
            current = reader.GetString(1);
        }

        if (current != "pending")
            return current == (paid ? "paid" : "expired");

        if (paid)
        {
            await using var credit = new NpgsqlCommand("""
                INSERT INTO dues_payments (id, assessment_id, amount_cents, recorded_by, checkout_id)
                VALUES (@id, @assessment, @amount, @recorded_by, @checkout)
                """, connection, tx);
            credit.Parameters.AddWithValue("id", Guid.NewGuid());
            credit.Parameters.AddWithValue("checkout", attempt);
            credit.Parameters.AddWithValue("recorded_by", CheckoutSettings.RecordedByFor(mode));
            credit.Parameters.AddWithValue("assessment", assessmentId);
            credit.Parameters.AddWithValue("amount", checked((int)amount));
            await credit.ExecuteNonQueryAsync(ct);
        }

        await using var update = new NpgsqlCommand("""
            UPDATE dues_checkouts SET status = @status, stripe_session_id = @session WHERE id = @id
            """, connection, tx);
        update.Parameters.AddWithValue("id", attempt);
        update.Parameters.AddWithValue("session", sessionId);
        update.Parameters.AddWithValue("status", paid ? "paid" : "expired");
        await update.ExecuteNonQueryAsync(ct);
        await tx.CommitAsync(ct);
        return true;
    }
}
