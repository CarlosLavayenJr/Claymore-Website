using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Npgsql;

/// <summary>A push message to one device or to a topic (exactly one of the two).</summary>
internal sealed record PushMessage(string Title, string Body, IReadOnlyDictionary<string, string> Data,
    string? Token = null, string? Topic = null);

internal enum PushOutcome { Sent, Unregistered, Failed }

internal interface IPushSender
{
    bool Enabled { get; }
    Task<PushOutcome> SendAsync(PushMessage message, CancellationToken ct);
}

/// <summary>Push switched off: no Firebase service account configured.</summary>
internal sealed class DisabledPushSender : IPushSender
{
    public bool Enabled => false;
    public Task<PushOutcome> SendAsync(PushMessage message, CancellationToken ct) => Task.FromResult(PushOutcome.Failed);
}

/// <summary>
/// Firebase Cloud Messaging (HTTP v1). Push:FirebaseServiceAccount holds the service account JSON
/// from Firebase (Project settings → Service accounts → Generate new private key). Firebase relays
/// to Apple with the APNs key uploaded in its Cloud Messaging settings.
/// </summary>
internal sealed class FirebasePushSender(HttpClient http, string serviceAccountJson, ILogger<FirebasePushSender> logger) : IPushSender
{
    private readonly ServiceAccount account = ServiceAccount.Parse(serviceAccountJson);
    private string? accessToken;
    private DateTimeOffset accessTokenExpires;
    private readonly SemaphoreSlim tokenLock = new(1, 1);

    public bool Enabled => true;

    public async Task<PushOutcome> SendAsync(PushMessage message, CancellationToken ct)
    {
        var token = await AccessTokenAsync(ct);
        var body = new Dictionary<string, object?>
        {
            ["notification"] = new { title = message.Title, body = message.Body },
            ["data"] = message.Data,
            ["apns"] = new { payload = new { aps = new { sound = "default" } } },
        };
        if (message.Token is not null) body["token"] = message.Token;
        else body["topic"] = message.Topic;

        using var request = new HttpRequestMessage(HttpMethod.Post,
            $"https://fcm.googleapis.com/v1/projects/{account.ProjectId}/messages:send")
        {
            Content = JsonContent.Create(new { message = body }),
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        using var response = await http.SendAsync(request, ct);
        if (response.IsSuccessStatusCode) return PushOutcome.Sent;
        var text = await response.Content.ReadAsStringAsync(ct);
        // A device that uninstalled the app or turned push off: forget its token.
        if ((int)response.StatusCode is 404 or 400 && (text.Contains("UNREGISTERED") || text.Contains("registration-token-not-registered")))
            return PushOutcome.Unregistered;
        logger.LogWarning("Firebase push failed with {Status}: {Body}", (int)response.StatusCode, text.Length > 300 ? text[..300] : text);
        return PushOutcome.Failed;
    }

    private async Task<string> AccessTokenAsync(CancellationToken ct)
    {
        await tokenLock.WaitAsync(ct);
        try
        {
            if (accessToken is not null && accessTokenExpires > DateTimeOffset.UtcNow.AddMinutes(5)) return accessToken;
            var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            var header = Base64Url(JsonSerializer.SerializeToUtf8Bytes(new { alg = "RS256", typ = "JWT" }));
            var claims = Base64Url(JsonSerializer.SerializeToUtf8Bytes(new
            {
                iss = account.ClientEmail,
                scope = "https://www.googleapis.com/auth/firebase.messaging",
                aud = account.TokenUri,
                iat = now,
                exp = now + 3600,
            }));
            using var rsa = RSA.Create();
            rsa.ImportFromPem(account.PrivateKey);
            var signature = rsa.SignData(Encoding.ASCII.GetBytes($"{header}.{claims}"), HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
            var assertion = $"{header}.{claims}.{Base64Url(signature)}";

            using var response = await http.PostAsync(account.TokenUri, new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["grant_type"] = "urn:ietf:params:oauth:grant-type:jwt-bearer",
                ["assertion"] = assertion,
            }), ct);
            response.EnsureSuccessStatusCode();
            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
            accessToken = json.RootElement.GetProperty("access_token").GetString()!;
            accessTokenExpires = DateTimeOffset.UtcNow.AddSeconds(json.RootElement.GetProperty("expires_in").GetInt32());
            return accessToken;
        }
        finally
        {
            tokenLock.Release();
        }
    }

    private static string Base64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private sealed record ServiceAccount(string ProjectId, string ClientEmail, string PrivateKey, string TokenUri)
    {
        public static ServiceAccount Parse(string json)
        {
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            return new(root.GetProperty("project_id").GetString()!, root.GetProperty("client_email").GetString()!,
                root.GetProperty("private_key").GetString()!,
                root.TryGetProperty("token_uri", out var uri) ? uri.GetString()! : "https://oauth2.googleapis.com/token");
        }
    }
}

internal sealed record RegisterDevice(string? Token, string? Platform);

/// <summary>Device push tokens (push_devices), each linked to the member signed in on it.</summary>
internal sealed class PushDevices(NpgsqlDataSource dataSource)
{
    public async Task RegisterAsync(string token, string platform, string subject, CancellationToken ct)
    {
        await using var command = dataSource.CreateCommand("""
            INSERT INTO push_devices (token, member_subject, platform) VALUES (@token, @subject, @platform)
            ON CONFLICT (token) DO UPDATE SET member_subject = EXCLUDED.member_subject,
                platform = EXCLUDED.platform, updated_at = now()
            """);
        command.Parameters.AddWithValue("token", token);
        command.Parameters.AddWithValue("subject", subject);
        command.Parameters.AddWithValue("platform", platform);
        await command.ExecuteNonQueryAsync(ct);
    }

    public async Task RemoveAsync(string token, string? subject, CancellationToken ct)
    {
        await using var command = dataSource.CreateCommand(subject is null
            ? "DELETE FROM push_devices WHERE token = @token"
            : "DELETE FROM push_devices WHERE token = @token AND member_subject = @subject");
        command.Parameters.AddWithValue("token", token);
        if (subject is not null) command.Parameters.AddWithValue("subject", subject);
        await command.ExecuteNonQueryAsync(ct);
    }

    /// <summary>Tokens per member subject.</summary>
    public async Task<ILookup<string, string>> TokensAsync(CancellationToken ct)
    {
        await using var command = dataSource.CreateCommand("SELECT member_subject, token FROM push_devices");
        await using var reader = await command.ExecuteReaderAsync(ct);
        var rows = new List<(string Subject, string Token)>();
        while (await reader.ReadAsync(ct)) rows.Add((reader.GetString(0), reader.GetString(1)));
        return rows.ToLookup(r => r.Subject, r => r.Token, StringComparer.Ordinal);
    }

    public async Task RemoveAccountAsync(string subject, CancellationToken ct)
    {
        await using var command = dataSource.CreateCommand("DELETE FROM push_devices WHERE member_subject = @subject");
        command.Parameters.AddWithValue("subject", subject);
        await command.ExecuteNonQueryAsync(ct);
    }
}

internal sealed record UpcomingMatch(string Id, DateOnly Date, string Opponent, bool Home, string? Kickoff, string? Venue);

/// <summary>
/// Match reminders, run hourly by the claymores-send-reminders cron (--send-reminders). On 21, 14,
/// 7, 5 and 2 days before a match, the day before, and on match day, each member's devices get a
/// reminder once the clock passes 10 AM in Orlando: members who haven't answered are asked if
/// they can play; members who said they can't play aren't reminded. The public match updates
/// topic gets the week-out, day-before and match-day reminders. push_sent makes each one go out once.
/// </summary>
internal sealed class MatchReminders(NpgsqlDataSource dataSource, FixtureDatabase fixtures, MatchAvailability availability,
    PushDevices devices, IPushSender sender, ILogger<MatchReminders> logger)
{
    internal static readonly int[] DaysBefore = [21, 14, 7, 5, 2, 1, 0];
    internal static readonly int[] TopicDays = [7, 1, 0];
    internal const string MatchesTopic = "claymores_matches";
    internal const int SendFromHour = 10;

    private static readonly TimeZoneInfo Orlando = TimeZoneInfo.FindSystemTimeZoneById("America/New_York");

    internal static string When(int days, DateOnly date) => days switch
    {
        0 => "today",
        1 => "tomorrow",
        7 => "in 1 week",
        14 => "in 2 weeks",
        21 => "in 3 weeks",
        _ => $"in {days} days",
    } + (days > 1 ? $" ({date:ddd MMM d})" : "");

    internal static string Title(UpcomingMatch m) => m.Home ? $"Claymores vs {m.Opponent}" : $"{m.Opponent} vs Claymores";

    /// <returns>How many messages were sent.</returns>
    public async Task<int> RunAsync(DateTimeOffset now, CancellationToken ct)
    {
        if (!sender.Enabled)
        {
            logger.LogInformation("Push isn't configured (Push:FirebaseServiceAccount); no reminders sent.");
            return 0;
        }
        var local = TimeZoneInfo.ConvertTime(now, Orlando);
        if (local.Hour < SendFromHour) return 0;
        var today = DateOnly.FromDateTime(local.DateTime);

        var sent = 0;
        var tokens = await devices.TokensAsync(ct);
        foreach (var match in await UpcomingAsync(today, ct))
        {
            var days = match.Date.DayNumber - today.DayNumber;
            if (!DaysBefore.Contains(days)) continue;
            if (!await ClaimAsync(match.Id, $"reminder-{days}", ct)) continue;

            var roster = await availability.RosterAsync(match.Id, ct);
            var details = string.Join(", ", new[] { match.Kickoff is { Length: > 0 } k ? $"kickoff {k}" : null, match.Venue }
                .Where(s => !string.IsNullOrWhiteSpace(s)));
            foreach (var member in roster)
            {
                if (member.Status == "unavailable") continue;
                string body = member.Status is null && days > 0
                    ? $"{Title(match)} is {When(days, match.Date)}. Can you play? Tap to let the club know."
                    : days == 0
                        ? $"Game day: {Title(match)}{(details.Length > 0 ? $", {details}" : "")}."
                        : $"{Title(match)} is {When(days, match.Date)}.";
                foreach (var token in tokens[member.Subject])
                    sent += await SendAsync(new PushMessage(days == 0 ? "Game day" : "Match reminder", body,
                        Data(match), Token: token), ct);
            }
            if (TopicDays.Contains(days))
                sent += await SendAsync(new PushMessage(days == 0 ? "Game day" : "Claymores match",
                    days == 0 ? $"{Title(match)} today{(details.Length > 0 ? $", {details}" : "")}. Come support!"
                              : $"{Title(match)} is {When(days, match.Date)}.",
                    Data(match), Topic: MatchesTopic), ct);
        }
        sent += await ResultsAsync(today, tokens, ct);
        return sent;
    }

    /// <summary>
    /// "Final: Claymores 24–17 Lakeland" to every member's devices and the public match updates topic,
    /// once per match, when a score for a match in the last three days comes in.
    /// </summary>
    private async Task<int> ResultsAsync(DateOnly today, ILookup<string, string> tokens, CancellationToken ct)
    {
        var sent = 0;
        foreach (var result in await RecentResultsAsync(today, ct))
        {
            if (!await ClaimAsync(result.Match.Id, "result", ct)) continue;
            var body = result.Text;
            var message = (string? token, string? topic) => new PushMessage(result.Title, body, Data(result.Match), token, topic);
            foreach (var member in (await availability.MembersAsync(ct)).DistinctBy(m => m.Subject))
                foreach (var token in tokens[member.Subject])
                    sent += await SendAsync(message(token, null), ct);
            sent += await SendAsync(message(null, MatchesTopic), ct);
        }
        return sent;
    }

    internal sealed record MatchResult(UpcomingMatch Match, string Title, string Text);

    /// <summary>Claymores matches from the last three days that have a final score (or a forfeit).</summary>
    internal async Task<List<MatchResult>> RecentResultsAsync(DateOnly today, CancellationToken ct)
    {
        var results = new List<MatchResult>();
        foreach (var payload in await fixtures.ListAsync(null, ct))
        {
            if (!payload.TryGetProperty("id", out var id) || !payload.TryGetProperty("date", out var dateText) ||
                !DateOnly.TryParse(dateText.GetString(), out var date) ||
                date > today || today.DayNumber - date.DayNumber > 3)
                continue;
            var home = Text(payload, "homeTeam") ?? "";
            var away = Text(payload, "awayTeam") ?? "";
            var claymoresHome = IsClaymores(home);
            if (!claymoresHome && !IsClaymores(away)) continue;
            var opponent = claymoresHome ? away : home;
            if (IsClaymores(opponent)) continue;
            var status = Text(payload, "status") ?? "";
            var match = new UpcomingMatch(id.GetString()!, date, opponent, claymoresHome, null, null);
            if (status.StartsWith("forfeit", StringComparison.OrdinalIgnoreCase))
            {
                var weWin = status.Equals("forfeit_them", StringComparison.OrdinalIgnoreCase);
                results.Add(new(match, weWin ? "Claymores win" : "Result",
                    weWin ? $"{opponent} forfeited: the win goes to the Claymores." : $"Claymores forfeited the match vs {opponent}."));
                continue;
            }
            if (Score(payload, "homeScore") is not int homeScore || Score(payload, "awayScore") is not int awayScore) continue;
            var (us, them) = claymoresHome ? (homeScore, awayScore) : (awayScore, homeScore);
            var outcome = us > them ? "Claymores win" : us < them ? "Final score" : "Draw";
            results.Add(new(match, outcome,
                $"Final: Claymores {us}–{them} {opponent}." + (us > them ? " Up the Claymores!" : "")));
        }
        return results;
    }

    private static int? Score(JsonElement payload, string name) =>
        payload.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var n) ? n : null;

    /// <summary>Tells the players in a newly published lineup where they're playing.</summary>
    public async Task<int> LineupPublishedAsync(string fixtureId, CancellationToken ct)
    {
        if (!sender.Enabled || !await ClaimAsync(fixtureId, "lineup", ct)) return 0;
        var lineup = await availability.LineupAsync(fixtureId, publishedOnly: true, ct);
        var match = (await UpcomingAsync(MatchAvailability.TodayInOrlando(), ct)).FirstOrDefault(m => m.Id == fixtureId);
        if (lineup is null || match is null) return 0;
        var tokens = await devices.TokensAsync(ct);
        var sent = 0;
        foreach (var slot in lineup.Slots)
        {
            var role = slot.Number <= 15 ? $"starting at {slot.Number} ({slot.Position})" : $"on the bench ({slot.Number})";
            foreach (var token in tokens[slot.Subject])
                sent += await SendAsync(new PushMessage("Lineup is out",
                    $"You're {role} for {Title(match)} {When(match.Date.DayNumber - MatchAvailability.TodayInOrlando().DayNumber, match.Date)}.",
                    Data(match), Token: token), ct);
        }
        return sent;
    }

    private static Dictionary<string, string> Data(UpcomingMatch m) => new() { ["fixtureId"] = m.Id, ["type"] = "match" };

    private async Task<int> SendAsync(PushMessage message, CancellationToken ct)
    {
        var outcome = await sender.SendAsync(message, ct);
        if (outcome == PushOutcome.Unregistered && message.Token is not null)
            await devices.RemoveAsync(message.Token, null, ct);
        return outcome == PushOutcome.Sent ? 1 : 0;
    }

    /// <summary>Records that a reminder went out; false when it already had.</summary>
    private async Task<bool> ClaimAsync(string fixtureId, string kind, CancellationToken ct)
    {
        await using var command = dataSource.CreateCommand(
            "INSERT INTO push_sent (fixture_id, kind) VALUES (@id, @kind) ON CONFLICT DO NOTHING");
        command.Parameters.AddWithValue("id", fixtureId);
        command.Parameters.AddWithValue("kind", kind);
        return await command.ExecuteNonQueryAsync(ct) == 1;
    }

    /// <summary>Claymores matches from today through three weeks out, as the public API lists them.</summary>
    internal async Task<List<UpcomingMatch>> UpcomingAsync(DateOnly today, CancellationToken ct)
    {
        var matches = new List<UpcomingMatch>();
        foreach (var payload in await fixtures.ListAsync(null, ct))
        {
            if (!payload.TryGetProperty("id", out var id) || !payload.TryGetProperty("date", out var dateText) ||
                !DateOnly.TryParse(dateText.GetString(), out var date) ||
                date < today || date.DayNumber - today.DayNumber > DaysBefore.Max())
                continue;
            var home = Text(payload, "homeTeam") ?? "";
            var away = Text(payload, "awayTeam") ?? "";
            if (Text(payload, "status") is { } status && status.Contains("cancel", StringComparison.OrdinalIgnoreCase)) continue;
            var claymoresHome = IsClaymores(home);
            if (!claymoresHome && !IsClaymores(away)) continue;
            var opponent = claymoresHome ? away : home;
            if (IsClaymores(opponent)) continue; // club events like the Highland Games aren't matches
            matches.Add(new(id.GetString()!, date, opponent, claymoresHome,
                Text(payload, "kickoffTime") ?? Text(payload, "kickoff"), Text(payload, "venue")));
        }
        return matches;
    }

    private static bool IsClaymores(string name) => name.Contains("Claymores", StringComparison.OrdinalIgnoreCase);

    private static string? Text(JsonElement payload, string name) =>
        payload.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
}

internal static class PushEndpoints
{
    public static void Map(WebApplication app)
    {
        var me = app.MapGroup("/v1/me/devices").WithTags("Push").RequireAuthorization(GoogleSignIn.RolePolicy);
        me.MapPost("/", async (RegisterDevice request, ClaimsPrincipal user, PushDevices devices, CancellationToken ct) =>
            {
                var token = request.Token?.Trim();
                var platform = request.Platform?.Trim().ToLowerInvariant();
                if (string.IsNullOrEmpty(token) || token.Length > 4096 || platform is not ("ios" or "android"))
                    return Results.BadRequest(new { error = "Provide the device's push token and platform (ios or android)." });
                await devices.RegisterAsync(token, platform, user.FindFirstValue("sub")!, ct);
                return Results.NoContent();
            })
            .AddEndpointFilter(SameOriginGuard.Filter)
            .WithSummary("Register this device for match reminders and lineup alerts").Produces(204).Produces(400).Produces(401);
        me.MapPost("/remove", async (RegisterDevice request, ClaimsPrincipal user, PushDevices devices, CancellationToken ct) =>
            {
                if (string.IsNullOrWhiteSpace(request.Token)) return Results.BadRequest(new { error = "Provide the token." });
                await devices.RemoveAsync(request.Token.Trim(), user.FindFirstValue("sub")!, ct);
                return Results.NoContent();
            })
            .AddEndpointFilter(SameOriginGuard.Filter)
            .WithSummary("Stop reminders on this device (sign out)").Produces(204).Produces(400).Produces(401);
    }
}
