using System.Net;
using System.Net.Http.Json;

namespace Claymores.Api.Tests;

/// <summary>API behavior that needs neither Postgres nor Sanity.</summary>
public sealed class ApiTests : IClassFixture<ApiFactory>
{
    private readonly HttpClient _client;

    public ApiTests(ApiFactory factory) => _client = factory.CreateClient();

    [Fact]
    public async Task Health_reports_ok()
    {
        var response = await _client.GetAsync("/health", TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Readiness_is_ok_without_a_database()
    {
        var body = await _client.GetFromJsonAsync<Dictionary<string, object>>("/health/ready",
            TestContext.Current.CancellationToken);
        Assert.Equal("not configured", body!["database"].ToString());
    }

    [Theory]
    [InlineData("/v1/fixtures?season=abc")]
    [InlineData("/v1/fixtures?season=1800")]
    [InlineData("/v1/standings?season=2025")]
    public async Task Invalid_filters_return_400(string path)
    {
        var response = await _client.GetAsync(path, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Me_requires_a_token()
    {
        var response = await _client.GetAsync("/v1/me", TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Swagger_is_off_outside_development()
    {
        var response = await _client.GetAsync("/swagger/v1/swagger.json", TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Admin_invitations_are_not_mapped_without_google_and_postgres()
    {
        var response = await _client.GetAsync("/v1/admin/invitations", TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}

/// <summary>Behind Render's proxy, X-Forwarded-Proto must make the request count as HTTPS.</summary>
public sealed class ForwardedHeaderTests
{
    [Theory]
    [InlineData(true, true)]
    [InlineData(false, false)]
    public async Task Hsts_follows_the_forwarded_scheme_only_when_enabled(bool enabled, bool expectHsts)
    {
        await using var factory = ApiFactory.With(new Dictionary<string, string?>
        {
            ["ForwardedHeaders:Enabled"] = enabled ? "true" : "false",
        });
        var request = new HttpRequestMessage(HttpMethod.Get, "/health");
        request.Headers.Host = "claymores-api.onrender.com";
        request.Headers.Add("X-Forwarded-Proto", "https");

        var response = await factory.CreateClient().SendAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(expectHsts, response.Headers.Contains("Strict-Transport-Security"));
    }
}
