using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace Claymores.Api.Tests;

public sealed class JoinRequestTests(PostgresDatabase database) : IClassFixture<PostgresDatabase>, IAsyncLifetime
{
    private ApiFactory? _factory;

    private static readonly string SigningKey = Convert.ToBase64String(Enumerable.Range(1, 32).Select(i => (byte)i).ToArray());

    internal static Dictionary<string, string?> Settings(string connectionString, int permitsPerMinute) => new()
    {
        ["ConnectionStrings:Claymores"] = connectionString,
        ["Authentication:Google:ClientId"] = "web-client.apps.googleusercontent.com",
        ["Authentication:Google:ClientSecret"] = "test-secret",
        ["Authentication:Tokens:SigningKey"] = SigningKey,
        ["Authentication:Apple:ClientIds:0"] = "com.claymoresrfc.claymores",
        ["MobileAuth:Enabled"] = "true",
        ["Dues:Enabled"] = "true",
        ["JoinRequests:PermitsPerMinute"] = permitsPerMinute.ToString(),
    };

    internal static void Fakes(IServiceCollection services)
    {
        services.AddSingleton<IGoogleIdTokenValidator, FakeGoogleValidator>();
        services.AddSingleton<IAppleIdentityTokenValidator, FakeAppleValidator>();
    }

    public ValueTask InitializeAsync()
    {
        if (database.ConnectionString is not null)
            _factory = ApiFactory.With(Settings(database.ConnectionString, 10_000), Fakes);
        return ValueTask.CompletedTask;
    }

    public async ValueTask DisposeAsync()
    {
        if (_factory is not null) await _factory.DisposeAsync();
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private HttpClient Client() => _factory!.CreateClient(new WebApplicationFactoryClientOptions
    {
        HandleCookies = false,
        AllowAutoRedirect = false,
    });

    private Task InviteAsync(string email, string role = "player") =>
        _factory!.Services.GetRequiredService<ClubInvitations>().UpsertAsync(email, role, "test", Ct);

    private Task<HttpResponseMessage> GoogleRequestAsync(string subject, string email, string? name = "Applicant",
        string? phone = null, string? message = null) =>
        Client().PostAsJsonAsync("/v1/auth/mobile/google/request-access",
            new { idToken = FakeGoogleValidator.Token(subject, email), name, phone, message }, Ct);

    private Task<HttpResponseMessage> AppleRequestAsync(string subject, string email, string? name = "Applicant",
        string nonce = "n-1", string? rawNonce = null) =>
        Client().PostAsJsonAsync("/v1/auth/mobile/apple/request-access", new
        {
            identityToken = FakeAppleValidator.Token(subject, email, nonce),
            rawNonce = rawNonce ?? nonce,
            name,
        }, Ct);

    private async Task<string?> GoogleStatusAsync(string subject, string email)
    {
        var response = await Client().PostAsJsonAsync("/v1/auth/mobile/google/request-status",
            new { idToken = FakeGoogleValidator.Token(subject, email) }, Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<Dictionary<string, string>>(Ct))!["status"];
    }

    private async Task<string> AdminTokenAsync(string email)
    {
        await InviteAsync(email, "admin");
        var response = await Client().PostAsJsonAsync("/v1/auth/mobile/google",
            new { idToken = FakeGoogleValidator.Token("sub-" + email, email) }, Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(Ct));
        return json.RootElement.GetProperty("accessToken").GetString()!;
    }

    private static HttpRequestMessage Bearer(HttpMethod method, string path, string token, object? body = null)
    {
        var request = new HttpRequestMessage(method, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        if (body is not null) request.Content = JsonContent.Create(body);
        return request;
    }

    private async Task<Guid> RequestIdAsync(string provider, string subject)
    {
        await using var dataSource = database.CreateDataSource();
        await using var command = dataSource.CreateCommand(
            "SELECT id FROM join_requests WHERE provider = @p AND subject = @s");
        command.Parameters.AddWithValue("p", provider);
        command.Parameters.AddWithValue("s", subject);
        return (Guid)(await command.ExecuteScalarAsync(Ct))!;
    }

    private async Task<string?> InvitedRoleAsync(string email)
    {
        await using var dataSource = database.CreateDataSource();
        await using var command = dataSource.CreateCommand("SELECT role FROM club_invitations WHERE email = @e");
        command.Parameters.AddWithValue("e", email);
        return await command.ExecuteScalarAsync(Ct) as string;
    }

    [Fact]
    public async Task Google_request_access_creates_a_pending_request()
    {
        database.SkipIfUnavailable();
        Assert.Equal("none", await GoogleStatusAsync("g-new", "New.Person@Example.com"));

        var response = await GoogleRequestAsync("g-new", "New.Person@Example.com", "  New Person ", "+1 (555) 010-0000",
            " Played in college. ");
        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        Assert.Equal("no-store", response.Headers.CacheControl?.ToString());
        Assert.Equal("""{"status":"pending","email":"New.Person@Example.com"}""", await response.Content.ReadAsStringAsync(Ct));
        Assert.Equal("pending", await GoogleStatusAsync("g-new", "New.Person@Example.com"));

        await using var dataSource = database.CreateDataSource();
        await using var command = dataSource.CreateCommand(
            "SELECT provider, email, name, phone, message, status FROM join_requests WHERE subject = 'g-new'");
        await using var reader = await command.ExecuteReaderAsync(Ct);
        Assert.True(await reader.ReadAsync(Ct));
        Assert.Equal(["google", "New.Person@Example.com", "New Person", "+1 (555) 010-0000", "Played in college.", "pending"],
            Enumerable.Range(0, 6).Select(reader.GetString).ToArray());
    }

    [Fact]
    public async Task Apple_request_access_stores_the_prefixed_subject()
    {
        database.SkipIfUnavailable();
        var response = await AppleRequestAsync("001.apple", "relay1@privaterelay.appleid.com", "Apple Applicant");
        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        Assert.Equal("""{"status":"pending","email":"relay1@privaterelay.appleid.com"}""",
            await response.Content.ReadAsStringAsync(Ct));
        await RequestIdAsync("apple", "apple|001.apple");

        var status = await Client().PostAsJsonAsync("/v1/auth/mobile/apple/request-status",
            new { identityToken = FakeAppleValidator.Token("001.apple", "relay1@privaterelay.appleid.com", "n-2"), rawNonce = "n-2" }, Ct);
        Assert.Equal("""{"status":"pending"}""", await status.Content.ReadAsStringAsync(Ct));

        // The same subject from Google is a different identity.
        Assert.Equal("none", await GoogleStatusAsync("001.apple", "relay1@privaterelay.appleid.com"));
    }

    [Fact]
    public async Task Invited_members_get_already_member()
    {
        database.SkipIfUnavailable();
        await InviteAsync("member@example.com");
        var google = await GoogleRequestAsync("g-member", "Member@example.com");
        Assert.Equal(HttpStatusCode.Conflict, google.StatusCode);
        Assert.Equal("""{"status":"already_member"}""", await google.Content.ReadAsStringAsync(Ct));

        var apple = await AppleRequestAsync("a-member", "member@example.com");
        Assert.Equal(HttpStatusCode.Conflict, apple.StatusCode);
        Assert.Equal("""{"status":"already_member"}""", await apple.Content.ReadAsStringAsync(Ct));
        Assert.Equal("none", await GoogleStatusAsync("g-member", "member@example.com"));
    }

    [Fact]
    public async Task Resubmitting_updates_the_details_and_stays_pending()
    {
        database.SkipIfUnavailable();
        Assert.Equal(HttpStatusCode.Accepted, (await GoogleRequestAsync("g-again", "again@example.com", "First", "555", "hi")).StatusCode);
        var id = await RequestIdAsync("google", "g-again");

        Assert.Equal(HttpStatusCode.Accepted, (await GoogleRequestAsync("g-again", "again@example.com", "Second")).StatusCode);
        Assert.Equal(id, await RequestIdAsync("google", "g-again"));
        var request = await _factory!.Services.GetRequiredService<JoinRequestStore>().FindAsync(id, Ct);
        Assert.Equal(("Second", (string?)null, (string?)null, "pending"),
            (request!.Name, request.Phone, request.Message, request.Status));
    }

    [Fact]
    public async Task Denied_requests_can_ask_again_only_after_24_hours()
    {
        database.SkipIfUnavailable();
        Assert.Equal(HttpStatusCode.Accepted, (await GoogleRequestAsync("g-denied", "denied@example.com")).StatusCode);
        var id = await RequestIdAsync("google", "g-denied");
        var store = _factory!.Services.GetRequiredService<JoinRequestStore>();
        Assert.Equal(JoinDecisionResult.Done, (await store.DenyAsync(id, "Not a member", "admin@example.com", Ct)).Result);
        Assert.Equal("denied", await GoogleStatusAsync("g-denied", "denied@example.com"));

        var again = await GoogleRequestAsync("g-denied", "denied@example.com", "Please");
        Assert.Equal(HttpStatusCode.TooManyRequests, again.StatusCode);
        Assert.Equal("""{"status":"denied_recently"}""", await again.Content.ReadAsStringAsync(Ct));
        Assert.Equal("denied", await GoogleStatusAsync("g-denied", "denied@example.com"));

        await using var dataSource = database.CreateDataSource();
        await using var age = dataSource.CreateCommand(
            "UPDATE join_requests SET decided_at = now() - interval '25 hours' WHERE id = @id");
        age.Parameters.AddWithValue("id", id);
        await age.ExecuteNonQueryAsync(Ct);

        Assert.Equal(HttpStatusCode.Accepted, (await GoogleRequestAsync("g-denied", "denied@example.com", "Please")).StatusCode);
        var reopened = await store.FindAsync(id, Ct);
        Assert.Equal(("pending", "Please"), (reopened!.Status, reopened.Name));
    }

    [Theory]
    [InlineData(null, null, null, "name")]
    [InlineData("   ", null, null, "name")]
    [InlineData("x81", null, null, "name")]
    [InlineData("Name", "555-0100 ext. 2", null, "phone")]
    [InlineData("Name", "p31", null, "phone")]
    [InlineData("Name", "555", "m501", "message")]
    public async Task Invalid_details_get_400_with_the_field(string? name, string? phone, string? message, string field)
    {
        database.SkipIfUnavailable();
        name = name == "x81" ? new string('x', 81) : name;
        phone = phone == "p31" ? new string('5', 31) : phone;
        message = message == "m501" ? new string('m', 501) : message;

        var response = await GoogleRequestAsync("g-invalid-" + field, "invalid@example.com", name, phone, message);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal($$"""{"error":"invalid_request","field":"{{field}}"}""", await response.Content.ReadAsStringAsync(Ct));
        Assert.Equal("none", await GoogleStatusAsync("g-invalid-" + field, "invalid@example.com"));
    }

    [Fact]
    public async Task Boundary_details_are_accepted()
    {
        database.SkipIfUnavailable();
        var response = await GoogleRequestAsync("g-bounds", "bounds@example.com", new string('n', 80),
            "+44 (20) 7946-0958.", new string('m', 500));
        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
    }

    [Fact]
    public async Task Invalid_tokens_get_401()
    {
        database.SkipIfUnavailable();
        async Task Assert401(Task<HttpResponseMessage> call)
        {
            var response = await call;
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
            Assert.Equal("""{"error":"invalid_token"}""", await response.Content.ReadAsStringAsync(Ct));
        }

        await Assert401(Client().PostAsJsonAsync("/v1/auth/mobile/google/request-access",
            new { idToken = "not-a-token", name = "X" }, Ct));
        await Assert401(Client().PostAsJsonAsync("/v1/auth/mobile/google/request-access",
            new { idToken = FakeGoogleValidator.Token("g-unverified", "u@example.com", verified: false), name = "X" }, Ct));
        await Assert401(AppleRequestAsync("a-nonce", "nonce@example.com", nonce: "n1", rawNonce: "n2"));
        await Assert401(Client().PostAsJsonAsync("/v1/auth/mobile/google/request-status", new { idToken = "" }, Ct));
        await Assert401(Client().PostAsJsonAsync("/v1/auth/mobile/apple/request-status", new { identityToken = "x" }, Ct));
    }

    [Fact]
    public async Task Admin_bearer_lists_and_approves_and_the_applicant_can_sign_in()
    {
        database.SkipIfUnavailable();
        var admin = await AdminTokenAsync("approver@example.com");
        Assert.Equal(HttpStatusCode.Accepted, (await GoogleRequestAsync("g-approve", "Approve.Me@Example.com", "Approve Me", "555 0100", "Hello")).StatusCode);
        var id = await RequestIdAsync("google", "g-approve");

        var list = await Client().SendAsync(Bearer(HttpMethod.Get, "/v1/admin/join-requests?status=pending", admin), Ct);
        Assert.Equal(HttpStatusCode.OK, list.StatusCode);
        Assert.Equal("no-store", list.Headers.CacheControl?.ToString());
        var entry = (await list.Content.ReadFromJsonAsync<List<JsonElement>>(Ct))!
            .Single(item => item.GetProperty("id").GetGuid() == id);
        Assert.Equal(["id", "provider", "email", "name", "phone", "message", "status", "createdAt", "updatedAt"],
            entry.EnumerateObject().Select(p => p.Name).ToArray());
        Assert.Equal(("google", "Approve.Me@Example.com", "pending"), (entry.GetProperty("provider").GetString(),
            entry.GetProperty("email").GetString(), entry.GetProperty("status").GetString()));

        // Not signed in as a member yet.
        var before = await Client().PostAsJsonAsync("/v1/auth/mobile/google",
            new { idToken = FakeGoogleValidator.Token("g-approve", "Approve.Me@Example.com") }, Ct);
        Assert.Equal(HttpStatusCode.Forbidden, before.StatusCode);

        // A bearer write needs no Sec-Fetch-Site header.
        var approve = await Client().SendAsync(
            Bearer(HttpMethod.Post, $"/v1/admin/join-requests/{id}/approve", admin, new { role = "player" }), Ct);
        Assert.Equal(HttpStatusCode.OK, approve.StatusCode);
        Assert.Equal("approved", (await approve.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("status").GetString());
        Assert.Equal("player", await InvitedRoleAsync("approve.me@example.com"));
        Assert.Equal("approved", await GoogleStatusAsync("g-approve", "Approve.Me@Example.com"));

        await using (var dataSource = database.CreateDataSource())
        await using (var decided = dataSource.CreateCommand(
            "SELECT decided_by, decided_at IS NOT NULL FROM join_requests WHERE id = @id"))
        {
            decided.Parameters.AddWithValue("id", id);
            await using var reader = await decided.ExecuteReaderAsync(Ct);
            Assert.True(await reader.ReadAsync(Ct));
            Assert.Equal("approver@example.com", reader.GetString(0));
            Assert.True(reader.GetBoolean(1));
        }

        var signIn = await Client().PostAsJsonAsync("/v1/auth/mobile/google",
            new { idToken = FakeGoogleValidator.Token("g-approve", "Approve.Me@Example.com") }, Ct);
        Assert.Equal(HttpStatusCode.OK, signIn.StatusCode);
        using var tokens = JsonDocument.Parse(await signIn.Content.ReadAsStringAsync(Ct));
        Assert.Equal("player", tokens.RootElement.GetProperty("user").GetProperty("role").GetString());

        var pending = await Client().SendAsync(Bearer(HttpMethod.Get, "/v1/admin/join-requests?status=pending", admin), Ct);
        Assert.DoesNotContain((await pending.Content.ReadFromJsonAsync<List<JsonElement>>(Ct))!,
            item => item.GetProperty("id").GetGuid() == id);

        // And a further request-access now says already_member.
        Assert.Equal(HttpStatusCode.Conflict, (await GoogleRequestAsync("g-approve", "Approve.Me@Example.com")).StatusCode);
    }

    [Fact]
    public async Task Approving_an_apple_request_as_admin_signs_in_with_that_role()
    {
        database.SkipIfUnavailable();
        var admin = await AdminTokenAsync("approver2@example.com");
        Assert.Equal(HttpStatusCode.Accepted, (await AppleRequestAsync("a-approve", "abc@privaterelay.appleid.com")).StatusCode);
        var id = await RequestIdAsync("apple", "apple|a-approve");

        var approve = await Client().SendAsync(
            Bearer(HttpMethod.Post, $"/v1/admin/join-requests/{id}/approve", admin, new { role = "admin" }), Ct);
        Assert.Equal(HttpStatusCode.OK, approve.StatusCode);

        var signIn = await Client().PostAsJsonAsync("/v1/auth/mobile/apple", new
        {
            identityToken = FakeAppleValidator.Token("a-approve", "abc@privaterelay.appleid.com", "n"),
            rawNonce = "n",
        }, Ct);
        Assert.Equal(HttpStatusCode.OK, signIn.StatusCode);
        using var tokens = JsonDocument.Parse(await signIn.Content.ReadAsStringAsync(Ct));
        Assert.Equal("admin", tokens.RootElement.GetProperty("user").GetProperty("role").GetString());
    }

    [Fact]
    public async Task Admin_bearer_denies_and_validates()
    {
        database.SkipIfUnavailable();
        var admin = await AdminTokenAsync("denier@example.com");
        Assert.Equal(HttpStatusCode.Accepted, (await GoogleRequestAsync("g-deny", "deny@example.com")).StatusCode);
        var id = await RequestIdAsync("google", "g-deny");

        Assert.Equal(HttpStatusCode.BadRequest, (await Client().SendAsync(
            Bearer(HttpMethod.Get, "/v1/admin/join-requests?status=weird", admin), Ct)).StatusCode);
        var badRole = await Client().SendAsync(
            Bearer(HttpMethod.Post, $"/v1/admin/join-requests/{id}/approve", admin, new { role = "owner" }), Ct);
        Assert.Equal(HttpStatusCode.BadRequest, badRole.StatusCode);
        Assert.Equal("""{"error":"invalid_request","field":"role"}""", await badRole.Content.ReadAsStringAsync(Ct));
        Assert.Equal(HttpStatusCode.BadRequest, (await Client().SendAsync(Bearer(HttpMethod.Post,
            $"/v1/admin/join-requests/{id}/deny", admin, new { reason = new string('r', 501) }), Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Client().SendAsync(Bearer(HttpMethod.Post,
            $"/v1/admin/join-requests/{Guid.NewGuid()}/approve", admin, new { role = "player" }), Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Client().SendAsync(Bearer(HttpMethod.Post,
            $"/v1/admin/join-requests/{Guid.NewGuid()}/deny", admin, new { }), Ct)).StatusCode);

        var deny = await Client().SendAsync(
            Bearer(HttpMethod.Post, $"/v1/admin/join-requests/{id}/deny", admin, new { reason = "Unknown" }), Ct);
        Assert.Equal(HttpStatusCode.OK, deny.StatusCode);
        Assert.Equal("denied", (await deny.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("status").GetString());
        Assert.Equal("denied", await GoogleStatusAsync("g-deny", "deny@example.com"));
        Assert.Null(await InvitedRoleAsync("deny@example.com"));

        // Only pending requests can be denied; a body-less deny is fine.
        var again = await Client().SendAsync(Bearer(HttpMethod.Post, $"/v1/admin/join-requests/{id}/deny", admin), Ct);
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);

        var denied = await Client().SendAsync(Bearer(HttpMethod.Get, "/v1/admin/join-requests?status=denied", admin), Ct);
        Assert.Contains((await denied.Content.ReadFromJsonAsync<List<JsonElement>>(Ct))!,
            item => item.GetProperty("id").GetGuid() == id);
    }

    [Fact]
    public async Task Approve_requires_a_pending_request()
    {
        database.SkipIfUnavailable();
        var admin = await AdminTokenAsync("stale-approver@example.com");
        Assert.Equal(HttpStatusCode.Accepted, (await GoogleRequestAsync("g-stale", "stale@example.com")).StatusCode);
        var id = await RequestIdAsync("google", "g-stale");
        var path = $"/v1/admin/join-requests/{id}/approve";

        Assert.Equal(HttpStatusCode.OK,
            (await Client().SendAsync(Bearer(HttpMethod.Post, path, admin, new { role = "player" }), Ct)).StatusCode);
        // Promoted to admin through the invitations route afterwards...
        Assert.Equal(HttpStatusCode.OK, (await Client().SendAsync(Bearer(HttpMethod.Put,
            "/v1/admin/invitations/stale@example.com", admin, new { role = "admin" }), Ct)).StatusCode);

        // ...a stale approve (another tab, a retry) can't demote them.
        var again = await Client().SendAsync(Bearer(HttpMethod.Post, path, admin, new { role = "player" }), Ct);
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
        Assert.Equal("""{"error":"not_pending"}""", await again.Content.ReadAsStringAsync(Ct));
        Assert.Equal("admin", await InvitedRoleAsync("stale@example.com"));

        // A denied request can't be approved either.
        Assert.Equal(HttpStatusCode.Accepted, (await GoogleRequestAsync("g-stale-denied", "stale-denied@example.com")).StatusCode);
        var denied = await RequestIdAsync("google", "g-stale-denied");
        Assert.Equal(HttpStatusCode.OK, (await Client().SendAsync(
            Bearer(HttpMethod.Post, $"/v1/admin/join-requests/{denied}/deny", admin, new { }), Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Client().SendAsync(Bearer(HttpMethod.Post,
            $"/v1/admin/join-requests/{denied}/approve", admin, new { role = "player" }), Ct)).StatusCode);
        Assert.Null(await InvitedRoleAsync("stale-denied@example.com"));
    }

    [Fact]
    public async Task A_direct_invitation_approves_the_pending_request_for_that_email()
    {
        database.SkipIfUnavailable();
        var admin = await AdminTokenAsync("direct-inviter@example.com");
        Assert.Equal(HttpStatusCode.Accepted, (await GoogleRequestAsync("g-direct", "Direct@Example.com")).StatusCode);
        var id = await RequestIdAsync("google", "g-direct");

        Assert.Equal(HttpStatusCode.OK, (await Client().SendAsync(Bearer(HttpMethod.Put,
            "/v1/admin/invitations/direct@example.com", admin, new { role = "player" }), Ct)).StatusCode);
        Assert.Equal("approved", await GoogleStatusAsync("g-direct", "Direct@Example.com"));
        await using (var dataSource = database.CreateDataSource())
        await using (var decided = dataSource.CreateCommand("SELECT decided_by FROM join_requests WHERE id = @id"))
        {
            decided.Parameters.AddWithValue("id", id);
            Assert.Equal("direct-inviter@example.com", await decided.ExecuteScalarAsync(Ct));
        }

        // It no longer shows as pending, and approving it now is a conflict.
        var pending = await Client().SendAsync(Bearer(HttpMethod.Get, "/v1/admin/join-requests?status=pending", admin), Ct);
        Assert.DoesNotContain((await pending.Content.ReadFromJsonAsync<List<JsonElement>>(Ct))!,
            item => item.GetProperty("id").GetGuid() == id);
        Assert.Equal(HttpStatusCode.Conflict, (await Client().SendAsync(Bearer(HttpMethod.Post,
            $"/v1/admin/join-requests/{id}/approve", admin, new { role = "admin" }), Ct)).StatusCode);
        Assert.Equal("player", await InvitedRoleAsync("direct@example.com"));
    }

    [Fact]
    public async Task Approving_as_player_keeps_an_existing_admin_invitation()
    {
        database.SkipIfUnavailable();
        var admin = await AdminTokenAsync("keep-approver@example.com");
        Assert.Equal(HttpStatusCode.Accepted, (await GoogleRequestAsync("g-keep", "keep@example.com")).StatusCode);
        var id = await RequestIdAsync("google", "g-keep");
        // An admin invitation written outside the API (an older build, or SQL) leaves the request pending.
        await using (var dataSource = database.CreateDataSource())
        await using (var insert = dataSource.CreateCommand(
            "INSERT INTO club_invitations (email, role, invited_by) VALUES ('keep@example.com', 'admin', 'sql')"))
            await insert.ExecuteNonQueryAsync(Ct);

        var approve = await Client().SendAsync(
            Bearer(HttpMethod.Post, $"/v1/admin/join-requests/{id}/approve", admin, new { role = "player" }), Ct);
        Assert.Equal(HttpStatusCode.OK, approve.StatusCode);
        Assert.Equal("approved", (await approve.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("status").GetString());
        Assert.Equal("admin", await InvitedRoleAsync("keep@example.com"));
    }

    [Fact]
    public async Task Non_admins_cannot_use_the_admin_routes()
    {
        database.SkipIfUnavailable();
        await InviteAsync("justplayer@example.com");
        var signIn = await Client().PostAsJsonAsync("/v1/auth/mobile/google",
            new { idToken = FakeGoogleValidator.Token("g-justplayer", "justplayer@example.com") }, Ct);
        using var tokens = JsonDocument.Parse(await signIn.Content.ReadAsStringAsync(Ct));
        var player = tokens.RootElement.GetProperty("accessToken").GetString()!;
        Assert.Equal(HttpStatusCode.Accepted, (await GoogleRequestAsync("g-target", "target@example.com")).StatusCode);
        var id = await RequestIdAsync("google", "g-target");

        Assert.Equal(HttpStatusCode.Forbidden,
            (await Client().SendAsync(Bearer(HttpMethod.Get, "/v1/admin/join-requests", player), Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Client().SendAsync(
            Bearer(HttpMethod.Post, $"/v1/admin/join-requests/{id}/approve", player, new { role = "player" }), Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Client().SendAsync(
            Bearer(HttpMethod.Get, JoinRequestAdminPage.Path, player), Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await Client().GetAsync("/v1/admin/join-requests", Ct)).StatusCode);
        Assert.Null(await InvitedRoleAsync("target@example.com"));
    }

    [Fact]
    public async Task Cookie_writes_need_same_origin_but_bearer_writes_do_not()
    {
        database.SkipIfUnavailable();
        await InviteAsync("cookieadmin@example.com", "admin");
        var cookie = SessionCookie("sub-cookieadmin", "cookieadmin@example.com", "admin");
        var bearer = await AdminTokenAsync("beareradmin@example.com");
        Assert.Equal(HttpStatusCode.Accepted, (await GoogleRequestAsync("g-csrf", "csrf@example.com")).StatusCode);
        var id = await RequestIdAsync("google", "g-csrf");

        HttpRequestMessage WithCookie(HttpMethod method, string path, object? body, bool sameOrigin)
        {
            var request = new HttpRequestMessage(method, path);
            if (body is not null) request.Content = JsonContent.Create(body);
            request.Headers.Add("Cookie", cookie);
            if (sameOrigin) request.Headers.Add("Sec-Fetch-Site", "same-origin");
            return request;
        }

        var approvePath = $"/v1/admin/join-requests/{id}/approve";
        Assert.Equal(HttpStatusCode.Forbidden,
            (await Client().SendAsync(WithCookie(HttpMethod.Post, approvePath, new { role = "player" }, false), Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Client().SendAsync(WithCookie(HttpMethod.Put,
            "/v1/admin/invitations/csrf-victim@example.com", new { role = "admin" }, false), Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Client().SendAsync(WithCookie(HttpMethod.Post, "/v1/admin/dues",
            new { id = Guid.NewGuid(), playerSubject = "s", description = "d", amountCents = 100 }, false), Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden,
            (await Client().SendAsync(WithCookie(HttpMethod.Post, "/auth/logout", null, false), Ct)).StatusCode);
        Assert.Null(await InvitedRoleAsync("csrf@example.com"));
        Assert.Null(await InvitedRoleAsync("csrf-victim@example.com"));

        // Adding a bearer header to a cookie request doesn't bypass the check.
        var mixed = WithCookie(HttpMethod.Post, approvePath, new { role = "player" }, false);
        mixed.Headers.Authorization = new AuthenticationHeaderValue("Bearer", bearer);
        Assert.Equal(HttpStatusCode.Forbidden, (await Client().SendAsync(mixed, Ct)).StatusCode);

        // Same-origin cookie writes work.
        Assert.Equal(HttpStatusCode.OK,
            (await Client().SendAsync(WithCookie(HttpMethod.Post, approvePath, new { role = "player" }, true), Ct)).StatusCode);
        Assert.Equal("player", await InvitedRoleAsync("csrf@example.com"));

        // Bearer writes work without the header across the admin routes.
        Assert.Equal(HttpStatusCode.OK, (await Client().SendAsync(Bearer(HttpMethod.Put,
            "/v1/admin/invitations/bearer-invite@example.com", bearer, new { role = "player" }), Ct)).StatusCode);
        Assert.Equal("player", await InvitedRoleAsync("bearer-invite@example.com"));
        Assert.Equal(HttpStatusCode.NoContent, (await Client().SendAsync(Bearer(HttpMethod.Delete,
            "/v1/admin/invitations/bearer-invite@example.com", bearer), Ct)).StatusCode);
        var dues = Guid.NewGuid();
        Assert.Equal(HttpStatusCode.Created, (await Client().SendAsync(Bearer(HttpMethod.Post, "/v1/admin/dues", bearer,
            new { id = dues, playerSubject = "g-csrf", description = "Season", amountCents = 5000 }), Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Client().SendAsync(Bearer(HttpMethod.Post, $"/v1/admin/dues/{dues}/payments",
            bearer, new { id = Guid.NewGuid(), amountCents = 1000 }), Ct)).StatusCode);
    }

    [Fact]
    public async Task Admin_page_lists_requests_and_its_forms_approve_and_deny()
    {
        database.SkipIfUnavailable();
        await InviteAsync("pageadmin@example.com", "admin");
        var cookie = SessionCookie("sub-pageadmin", "pageadmin@example.com", "admin");
        Assert.Equal(HttpStatusCode.Accepted,
            (await GoogleRequestAsync("g-page1", "page1@example.com", "<b>Page</b> One", message: "Let me in")).StatusCode);
        Assert.Equal(HttpStatusCode.Accepted, (await GoogleRequestAsync("g-page2", "page2@example.com", "Page Two")).StatusCode);
        var first = await RequestIdAsync("google", "g-page1");
        var second = await RequestIdAsync("google", "g-page2");

        var page = new HttpRequestMessage(HttpMethod.Get, JoinRequestAdminPage.Path);
        page.Headers.Add("Cookie", cookie);
        var response = await Client().SendAsync(page, Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var html = await response.Content.ReadAsStringAsync(Ct);
        Assert.Contains("&lt;b&gt;Page&lt;/b&gt; One", html);
        Assert.DoesNotContain("<b>Page</b>", html);
        Assert.Contains($"{JoinRequestAdminPage.Path}/{first:D}/approve", html);
        Assert.Contains("Let me in", html);

        var account = new HttpRequestMessage(HttpMethod.Get, "/auth/account");
        account.Headers.Add("Cookie", cookie);
        Assert.Contains(JoinRequestAdminPage.Path, await (await Client().SendAsync(account, Ct)).Content.ReadAsStringAsync(Ct));

        HttpRequestMessage Form(string path, Dictionary<string, string> fields, bool sameOrigin)
        {
            var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = new FormUrlEncodedContent(fields) };
            request.Headers.Add("Cookie", cookie);
            if (sameOrigin) request.Headers.Add("Sec-Fetch-Site", "same-origin");
            return request;
        }

        var approvePath = $"{JoinRequestAdminPage.Path}/{first:D}/approve";
        Assert.Equal(HttpStatusCode.Forbidden,
            (await Client().SendAsync(Form(approvePath, new() { ["role"] = "player" }, false), Ct)).StatusCode);
        var approved = await Client().SendAsync(Form(approvePath, new() { ["role"] = "player" }, true), Ct);
        Assert.Equal(HttpStatusCode.SeeOther, approved.StatusCode);
        Assert.Equal($"{JoinRequestAdminPage.Path}?notice=approved", approved.Headers.Location?.ToString());
        Assert.Equal("player", await InvitedRoleAsync("page1@example.com"));

        var denied = await Client().SendAsync(
            Form($"{JoinRequestAdminPage.Path}/{second:D}/deny", new() { ["reason"] = "" }, true), Ct);
        Assert.Equal($"{JoinRequestAdminPage.Path}?notice=denied", denied.Headers.Location?.ToString());
        Assert.Equal("denied", await GoogleStatusAsync("g-page2", "page2@example.com"));
    }

    /// <summary>A session cookie as the Google sign-in flow would issue it.</summary>
    private string SessionCookie(string subject, string email, string role)
    {
        var options = _factory!.Services.GetRequiredService<IOptionsMonitor<CookieAuthenticationOptions>>()
            .Get(GoogleSignIn.Session);
        var identity = new ClaimsIdentity(
        [
            new Claim("sub", subject),
            new Claim("email", email),
            new Claim("email_verified", "true"),
            new Claim("name", "Cookie Admin"),
            new Claim(ClaimsIdentity.DefaultRoleClaimType, role),
        ], "ClubGoogle");
        var ticket = new AuthenticationTicket(new ClaimsPrincipal(identity), new AuthenticationProperties
        {
            IssuedUtc = DateTimeOffset.UtcNow,
            ExpiresUtc = DateTimeOffset.UtcNow.AddHours(1),
        }, GoogleSignIn.Session);
        return $"{options.Cookie.Name}={options.TicketDataFormat.Protect(ticket)}";
    }
}

public sealed class JoinRequestRateLimitTests(PostgresDatabase database) : IClassFixture<PostgresDatabase>
{
    [Fact]
    public async Task Request_access_is_rate_limited_per_ip()
    {
        database.SkipIfUnavailable();
        await using var factory = ApiFactory.With(JoinRequestTests.Settings(database.ConnectionString!, 3), JoinRequestTests.Fakes);
        var client = factory.CreateClient();
        var ct = TestContext.Current.CancellationToken;

        Task<HttpResponseMessage> Request(int i) => client.PostAsJsonAsync("/v1/auth/mobile/google/request-access",
            new { idToken = FakeGoogleValidator.Token($"g-limit-{i}", $"limit{i}@example.com"), name = "Limit" }, ct);

        for (var i = 0; i < 3; i++)
            Assert.Equal(HttpStatusCode.Accepted, (await Request(i)).StatusCode);
        var limited = await Request(3);
        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
        Assert.Equal("""{"error":"rate_limited"}""", await limited.Content.ReadAsStringAsync(ct));
        Assert.NotNull(limited.Headers.RetryAfter);

        // The status endpoint shares the limit.
        var status = await client.PostAsJsonAsync("/v1/auth/mobile/google/request-status",
            new { idToken = FakeGoogleValidator.Token("g-limit-0", "limit0@example.com") }, ct);
        Assert.Equal(HttpStatusCode.TooManyRequests, status.StatusCode);
    }

    [Fact]
    public async Task Behind_the_proxy_the_limit_uses_the_right_most_forwarded_address()
    {
        database.SkipIfUnavailable();
        var settings = JoinRequestTests.Settings(database.ConnectionString!, 2);
        settings["ForwardedHeaders:Enabled"] = "true";
        await using var factory = ApiFactory.With(settings, JoinRequestTests.Fakes);
        var client = factory.CreateClient();
        var ct = TestContext.Current.CancellationToken;
        var n = 0;

        Task<HttpResponseMessage> Request(string forwardedFor)
        {
            var request = new HttpRequestMessage(HttpMethod.Post, "/v1/auth/mobile/google/request-status")
            {
                Content = JsonContent.Create(new { idToken = FakeGoogleValidator.Token($"g-fwd-{n++}", "fwd@example.com") })
            };
            // Render's proxy appends the address it saw; anything to the left came from the client.
            request.Headers.Add("X-Forwarded-For", forwardedFor);
            return client.SendAsync(request, ct);
        }

        Assert.Equal(HttpStatusCode.OK, (await Request("198.51.100.1, 203.0.113.10")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Request("198.51.100.2, 203.0.113.10")).StatusCode);
        // A different spoofed left-hand entry doesn't open a new partition.
        Assert.Equal(HttpStatusCode.TooManyRequests, (await Request("198.51.100.3, 203.0.113.10")).StatusCode);
        // Another client (a different address appended by the proxy) has its own limit.
        Assert.Equal(HttpStatusCode.OK, (await Request("203.0.113.20")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Request("203.0.113.10, 203.0.113.20")).StatusCode);
    }
}
