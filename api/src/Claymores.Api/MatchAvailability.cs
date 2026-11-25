using System.Security.Claims;
using Npgsql;

/// <param name="Status">available, maybe or unavailable.</param>
/// <param name="Note">Up to 200 characters, e.g. "first half only".</param>
internal sealed record AvailabilityAnswer(string? Status, string? Note);

internal sealed record AvailabilityCounts(int Available, int Maybe, int Unavailable, int NoReply);

/// <summary>What a member sees on a match: their own answer, the counts, and whether answers are still open.</summary>
internal sealed record MyAvailability(string FixtureId, string? Status, string? Note, DateTimeOffset? UpdatedAt,
    AvailabilityCounts Counts, bool Open);

/// <summary>One member's answer for admins. Status null means no reply yet.</summary>
internal sealed record MemberAvailability(string Subject, string Email, string? Name, string? Status, string? Note,
    DateTimeOffset? UpdatedAt);

internal sealed record LineupSlot(int Number, string Position, string Subject, string? Name);

/// <param name="Status">none (nothing saved), draft or published.</param>
internal sealed record Lineup(string FixtureId, string Status, DateTimeOffset? PublishedAt, DateTimeOffset? UpdatedAt,
    IReadOnlyList<LineupSlot> Slots);

internal sealed record LineupSlotInput(int Number, string? Subject);

/// <param name="Publish">true shows it to members; false keeps (or puts) it back to a draft.</param>
internal sealed record SaveLineup(IReadOnlyList<LineupSlotInput>? Slots, bool Publish);

internal enum AnswerResult { Saved, Invalid, NotFound, Closed }

internal enum LineupResult { Saved, Invalid, NotFound, NotMember }

/// <summary>
/// Match availability (match_availability) and lineups (match_lineups, match_lineup_slots).
/// Answers stay open until the end of match day in Orlando. Members see counts and the
/// published lineup; admins see who said what and build the lineup.
/// </summary>
internal sealed class MatchAvailability(NpgsqlDataSource dataSource, ClubMemberDirectory members)
{
    internal static readonly string[] Statuses = ["available", "maybe", "unavailable"];
    internal const int MaxNote = 200;

    internal static readonly string[] Positions =
    [
        "Loosehead prop", "Hooker", "Tighthead prop", "Lock", "Lock", "Blindside flanker", "Openside flanker",
        "Number 8", "Scrum-half", "Fly-half", "Left wing", "Inside centre", "Outside centre", "Right wing", "Fullback",
    ];

    internal static string PositionOf(int number) => number <= 15 ? Positions[number - 1] : "Replacement";

    private static readonly TimeZoneInfo Orlando = TimeZoneInfo.FindSystemTimeZoneById("America/New_York");

    internal static DateOnly TodayInOrlando() =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, Orlando).DateTime);

    /// <summary>The fixture's date, or null when there's no such (live) fixture.</summary>
    private async Task<DateOnly?> FixtureDateAsync(string fixtureId, CancellationToken ct)
    {
        await using var command = dataSource.CreateCommand(
            "SELECT fixture_date FROM fixtures WHERE sanity_id = @id AND retired_at IS NULL");
        command.Parameters.AddWithValue("id", fixtureId);
        await using var reader = await command.ExecuteReaderAsync(ct);
        return await reader.ReadAsync(ct) ? reader.GetFieldValue<DateOnly>(0) : null;
    }

    public async Task<MyAvailability?> MineAsync(string fixtureId, string subject, CancellationToken ct)
    {
        var date = await FixtureDateAsync(fixtureId, ct);
        if (date is null) return null;
        var roster = await RosterAsync(fixtureId, ct);
        var mine = roster.FirstOrDefault(m => m.Subject == subject);
        return new(fixtureId, mine?.Status, mine?.Note, mine?.UpdatedAt, Count(roster), date >= TodayInOrlando());
    }

    /// <summary>My answers for fixtures from today on, for match cards.</summary>
    public async Task<List<AvailabilityAnswerRow>> MyUpcomingAsync(string subject, CancellationToken ct)
    {
        await using var command = dataSource.CreateCommand("""
            SELECT a.fixture_id, a.status, a.note FROM match_availability a
            JOIN fixtures f ON f.sanity_id = a.fixture_id AND f.retired_at IS NULL
            WHERE a.member_subject = @subject AND f.fixture_date >= @today
            ORDER BY f.fixture_date
            """);
        command.Parameters.AddWithValue("subject", subject);
        command.Parameters.AddWithValue("today", TodayInOrlando());
        await using var reader = await command.ExecuteReaderAsync(ct);
        var rows = new List<AvailabilityAnswerRow>();
        while (await reader.ReadAsync(ct))
            rows.Add(new(reader.GetString(0), reader.GetString(1), reader.IsDBNull(2) ? null : reader.GetString(2)));
        return rows;
    }

    public async Task<AnswerResult> AnswerAsync(string fixtureId, string subject, AvailabilityAnswer answer, CancellationToken ct)
    {
        var status = answer.Status?.Trim().ToLowerInvariant();
        var note = string.IsNullOrWhiteSpace(answer.Note) ? null : answer.Note.Trim();
        if (status is null || !Statuses.Contains(status) || note?.Length > MaxNote) return AnswerResult.Invalid;
        var date = await FixtureDateAsync(fixtureId, ct);
        if (date is null) return AnswerResult.NotFound;
        if (date < TodayInOrlando()) return AnswerResult.Closed;

        await using var command = dataSource.CreateCommand("""
            INSERT INTO match_availability (fixture_id, member_subject, status, note)
            VALUES (@fixture, @subject, @status, @note)
            ON CONFLICT (fixture_id, member_subject) DO UPDATE SET
                status = EXCLUDED.status, note = EXCLUDED.note,
                updated_at = CASE WHEN match_availability.status IS DISTINCT FROM EXCLUDED.status
                                    OR match_availability.note IS DISTINCT FROM EXCLUDED.note
                                  THEN now() ELSE match_availability.updated_at END
            """);
        command.Parameters.AddWithValue("fixture", fixtureId);
        command.Parameters.AddWithValue("subject", subject);
        command.Parameters.AddWithValue("status", status);
        command.Parameters.Add("note", NpgsqlTypes.NpgsqlDbType.Text).Value = (object?)note ?? DBNull.Value;
        await command.ExecuteNonQueryAsync(ct);
        return AnswerResult.Saved;
    }

    /// <summary>
    /// Every current member with their answer (null when they haven't replied), plus anyone who
    /// answered but is no longer a member is left out.
    /// </summary>
    public async Task<List<MemberAvailability>> RosterAsync(string fixtureId, CancellationToken ct)
    {
        var current = await members.ListAsync(ct);
        var answers = new Dictionary<string, (string Status, string? Note, DateTimeOffset UpdatedAt)>(StringComparer.Ordinal);
        await using (var command = dataSource.CreateCommand(
            "SELECT member_subject, status, note, updated_at FROM match_availability WHERE fixture_id = @id"))
        {
            command.Parameters.AddWithValue("id", fixtureId);
            await using var reader = await command.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
                answers[reader.GetString(0)] = (reader.GetString(1), reader.IsDBNull(2) ? null : reader.GetString(2),
                    reader.GetFieldValue<DateTimeOffset>(3));
        }
        return current
            .DistinctBy(m => m.Subject)
            .Select(m => answers.TryGetValue(m.Subject, out var a)
                ? new MemberAvailability(m.Subject, m.Email, m.Name, a.Status, a.Note, a.UpdatedAt)
                : new MemberAvailability(m.Subject, m.Email, m.Name, null, null, null))
            .ToList();
    }

    internal static AvailabilityCounts Count(IReadOnlyList<MemberAvailability> roster) => new(
        roster.Count(m => m.Status == "available"), roster.Count(m => m.Status == "maybe"),
        roster.Count(m => m.Status == "unavailable"), roster.Count(m => m.Status is null));

    /// <param name="publishedOnly">Members only see a published lineup; a draft reads as "none".</param>
    public async Task<Lineup?> LineupAsync(string fixtureId, bool publishedOnly, CancellationToken ct)
    {
        if (await FixtureDateAsync(fixtureId, ct) is null) return null;
        string status = "none";
        DateTimeOffset? publishedAt = null, updatedAt = null;
        await using (var command = dataSource.CreateCommand(
            "SELECT status, published_at, updated_at FROM match_lineups WHERE fixture_id = @id"))
        {
            command.Parameters.AddWithValue("id", fixtureId);
            await using var reader = await command.ExecuteReaderAsync(ct);
            if (await reader.ReadAsync(ct))
            {
                status = reader.GetString(0);
                publishedAt = reader.IsDBNull(1) ? null : reader.GetFieldValue<DateTimeOffset>(1);
                updatedAt = reader.GetFieldValue<DateTimeOffset>(2);
            }
        }
        if (status == "none" || (publishedOnly && status != "published"))
            return new(fixtureId, "none", null, null, []);

        var names = (await members.ListAsync(ct)).DistinctBy(m => m.Subject)
            .ToDictionary(m => m.Subject, m => m.Name ?? m.Email, StringComparer.Ordinal);
        var slots = new List<LineupSlot>();
        await using (var command = dataSource.CreateCommand(
            "SELECT number, member_subject FROM match_lineup_slots WHERE fixture_id = @id ORDER BY number"))
        {
            command.Parameters.AddWithValue("id", fixtureId);
            await using var reader = await command.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                var number = reader.GetInt32(0);
                var subject = reader.GetString(1);
                slots.Add(new(number, PositionOf(number), subject, names.GetValueOrDefault(subject)));
            }
        }
        return new(fixtureId, status, publishedAt, updatedAt, slots);
    }

    /// <summary>Replaces the whole lineup. Empty numbers are simply left out.</summary>
    public async Task<LineupResult> SaveLineupAsync(string fixtureId, SaveLineup request, string? admin, CancellationToken ct)
    {
        var slots = (request.Slots ?? [])
            .Where(s => !string.IsNullOrWhiteSpace(s.Subject))
            .Select(s => (s.Number, Subject: s.Subject!.Trim()))
            .ToList();
        if (slots.Any(s => s.Number is < 1 or > 23) ||
            slots.Select(s => s.Number).Distinct().Count() != slots.Count ||
            slots.Select(s => s.Subject).Distinct(StringComparer.Ordinal).Count() != slots.Count)
            return LineupResult.Invalid;
        if (await FixtureDateAsync(fixtureId, ct) is null) return LineupResult.NotFound;
        var known = (await members.ListAsync(ct)).Select(m => m.Subject).ToHashSet(StringComparer.Ordinal);
        if (slots.Any(s => !known.Contains(s.Subject))) return LineupResult.NotMember;

        await using var connection = await dataSource.OpenConnectionAsync(ct);
        await using var transaction = await connection.BeginTransactionAsync(ct);
        await using (var upsert = new NpgsqlCommand("""
            INSERT INTO match_lineups (fixture_id, status, published_at, updated_by)
            VALUES (@id, @status, CASE WHEN @publish THEN now() END, @by)
            ON CONFLICT (fixture_id) DO UPDATE SET
                status = EXCLUDED.status,
                published_at = CASE WHEN @publish THEN COALESCE(match_lineups.published_at, now()) END,
                updated_by = EXCLUDED.updated_by, updated_at = now()
            """, connection, transaction))
        {
            upsert.Parameters.AddWithValue("id", fixtureId);
            upsert.Parameters.AddWithValue("status", request.Publish ? "published" : "draft");
            upsert.Parameters.AddWithValue("publish", request.Publish);
            upsert.Parameters.Add("by", NpgsqlTypes.NpgsqlDbType.Text).Value = (object?)admin ?? DBNull.Value;
            await upsert.ExecuteNonQueryAsync(ct);
        }
        await using (var clear = new NpgsqlCommand("DELETE FROM match_lineup_slots WHERE fixture_id = @id", connection, transaction))
        {
            clear.Parameters.AddWithValue("id", fixtureId);
            await clear.ExecuteNonQueryAsync(ct);
        }
        foreach (var (number, subject) in slots)
        {
            await using var insert = new NpgsqlCommand(
                "INSERT INTO match_lineup_slots (fixture_id, number, member_subject) VALUES (@id, @number, @subject)",
                connection, transaction);
            insert.Parameters.AddWithValue("id", fixtureId);
            insert.Parameters.AddWithValue("number", number);
            insert.Parameters.AddWithValue("subject", subject);
            await insert.ExecuteNonQueryAsync(ct);
        }
        await transaction.CommitAsync(ct);
        return LineupResult.Saved;
    }
}

internal sealed record AvailabilityAnswerRow(string FixtureId, string Status, string? Note);

internal static class MatchAvailabilityEndpoints
{
    public static void Map(WebApplication app)
    {
        var member = app.MapGroup("/v1").WithTags("Availability").RequireAuthorization(GoogleSignIn.RolePolicy);
        member.AddEndpointFilter(NoStore);
        member.MapGet("/availability/mine", async (ClaimsPrincipal user, MatchAvailability store, CancellationToken ct) =>
                Results.Ok(await store.MyUpcomingAsync(user.FindFirstValue("sub")!, ct)))
            .WithSummary("My availability answers for upcoming matches").Produces<List<AvailabilityAnswerRow>>().Produces(401);
        member.MapGet("/fixtures/{id}/availability", async (string id, ClaimsPrincipal user, MatchAvailability store, CancellationToken ct) =>
                await store.MineAsync(id, user.FindFirstValue("sub")!, ct) is { } mine ? Results.Ok(mine) : Results.NotFound())
            .WithSummary("My answer for a match, the club's counts, and whether answers are open")
            .Produces<MyAvailability>().Produces(401).Produces(404);
        member.MapPut("/fixtures/{id}/availability", async (string id, AvailabilityAnswer request, ClaimsPrincipal user,
                MatchAvailability store, CancellationToken ct) =>
                await store.AnswerAsync(id, user.FindFirstValue("sub")!, request, ct) switch
                {
                    AnswerResult.Saved => Results.Ok(await store.MineAsync(id, user.FindFirstValue("sub")!, ct)),
                    AnswerResult.NotFound => Results.NotFound(),
                    AnswerResult.Closed => Results.Conflict(new { error = "This match has been played, so answers are closed." }),
                    _ => Results.BadRequest(new { error = "Status must be available, maybe or unavailable, and the note at most 200 characters." }),
                })
            .AddEndpointFilter(SameOriginGuard.Filter)
            .WithSummary("Say whether I can play a match (until the end of match day)")
            .Produces<MyAvailability>().Produces(400).Produces(401).Produces(404).Produces(409);
        member.MapGet("/fixtures/{id}/lineup", async (string id, MatchAvailability store, CancellationToken ct) =>
                await store.LineupAsync(id, publishedOnly: true, ct) is { } lineup ? Results.Ok(lineup) : Results.NotFound())
            .WithSummary("The published lineup for a match (status none until an admin publishes it)")
            .Produces<Lineup>().Produces(401).Produces(404);

        var admin = app.MapGroup("/v1/admin/fixtures").WithTags("Availability").RequireAuthorization(GoogleSignIn.AdminPolicy);
        admin.AddEndpointFilter(NoStore);
        admin.MapGet("/{id}/availability", async (string id, MatchAvailability store, CancellationToken ct) =>
            {
                var roster = await store.RosterAsync(id, ct);
                return Results.Ok(new { fixtureId = id, counts = MatchAvailability.Count(roster), members = roster });
            })
            .WithSummary("Every member's answer for a match (status null: no reply)").Produces(200).Produces(401).Produces(403);
        admin.MapGet("/{id}/lineup", async (string id, MatchAvailability store, CancellationToken ct) =>
                await store.LineupAsync(id, publishedOnly: false, ct) is { } lineup ? Results.Ok(lineup) : Results.NotFound())
            .WithSummary("The lineup for a match, draft or published").Produces<Lineup>().Produces(401).Produces(403).Produces(404);
        admin.MapPut("/{id}/lineup", async (string id, SaveLineup request, ClaimsPrincipal user, MatchAvailability store,
                MatchReminders reminders, CancellationToken ct) =>
            {
                switch (await store.SaveLineupAsync(id, request, user.FindFirstValue("email"), ct))
                {
                    case LineupResult.Saved:
                        // The first publish tells the selected players (once per match).
                        if (request.Publish) await reminders.LineupPublishedAsync(id, ct);
                        return Results.Ok(await store.LineupAsync(id, publishedOnly: false, ct));
                    case LineupResult.NotFound:
                        return Results.NotFound();
                    case LineupResult.NotMember:
                        return Results.BadRequest(new { error = "Everyone in a lineup must be a club member who has signed in." });
                    default:
                        return Results.BadRequest(new { error = "Numbers run 1 to 23, each used once, and each player at most once." });
                }
            })
            .AddEndpointFilter(SameOriginGuard.Filter)
            .WithSummary("Save a match lineup (1-15 starters, 16-23 replacements) as a draft or publish it")
            .Produces<Lineup>().Produces(400).Produces(401).Produces(403).Produces(404);
    }

    private static ValueTask<object?> NoStore(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        context.HttpContext.Response.Headers.CacheControl = "no-store";
        return next(context);
    }
}
