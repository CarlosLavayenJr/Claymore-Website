using System.Security.Cryptography;
using System.Text;

/// <summary>
/// POST /v1/internal/scrape/{fixtures|standings}, for an external scheduler. Requires
/// <c>Authorization: Bearer {Scraper:Secret}</c>. Returns 404 unless both the secret and Postgres are configured.
/// </summary>
public static class ScrapeEndpoints
{
    public static void Map(WebApplication app)
    {
        app.MapPost("/v1/internal/scrape/{kind}", async (string kind, HttpRequest request, IServiceProvider services,
            IConfiguration configuration, CancellationToken ct) =>
        {
            var secret = configuration["Scraper:Secret"];
            var scraper = services.GetService<ScrapeService>();
            if (string.IsNullOrEmpty(secret) || scraper is null)
                return Results.NotFound();
            if (!IsAuthorized(request.Headers.Authorization.ToString(), secret))
                return Results.Unauthorized();

            var query = request.Query;
            bool Flag(string name) => string.Equals(query[name], "true", StringComparison.OrdinalIgnoreCase);
            switch (kind)
            {
                case "fixtures":
                {
                    int? seasonId = null;
                    if (query["seasonId"].ToString() is { Length: > 0 } text)
                    {
                        if (!int.TryParse(text, System.Globalization.NumberStyles.None,
                                System.Globalization.CultureInfo.InvariantCulture, out var parsed) || parsed < 1)
                            return Results.BadRequest(new { error = "seasonId must be a positive integer" });
                        seasonId = parsed;
                    }
                    var defaultSeason = configuration.GetValue("Scraper:DefaultSeasonId", FixtureScrapeRequest.DefaultSeasonId);
                    var result = await scraper.ScrapeFixturesAsync(FixtureScrapeRequest.For(Flag("all"), seasonId, defaultSeason), "http", ct);
                    return Results.Json(result, statusCode: result.Status == "failed" ? StatusCodes.Status502BadGateway : StatusCodes.Status200OK);
                }
                case "standings":
                {
                    var standings = new StandingsScrapeRequest(Flag("force"), Optional(query["championshipId"]),
                        Optional(query["seasonLabel"]), Optional(query["divisionName"]));
                    try
                    {
                        ScraperCommand.ValidateStandings(standings);
                    }
                    catch (ArgumentException error)
                    {
                        return Results.BadRequest(new { error = error.Message });
                    }
                    var result = await scraper.ScrapeStandingsAsync(standings, "http", ct);
                    return Results.Json(result, statusCode: result.Status == "failed" ? StatusCodes.Status502BadGateway : StatusCodes.Status200OK);
                }
                default:
                    return Results.NotFound();
            }
        }).ExcludeFromDescription();
    }

    private static string? Optional(Microsoft.Extensions.Primitives.StringValues value) =>
        value.ToString() is { Length: > 0 } text ? text : null;

    /// <summary>Constant-time comparison of the bearer token with the configured secret.</summary>
    public static bool IsAuthorized(string authorizationHeader, string secret)
    {
        const string prefix = "Bearer ";
        if (!authorizationHeader.StartsWith(prefix, StringComparison.Ordinal)) return false;
        var provided = SHA256.HashData(Encoding.UTF8.GetBytes(authorizationHeader[prefix.Length..]));
        var expected = SHA256.HashData(Encoding.UTF8.GetBytes(secret));
        return CryptographicOperations.FixedTimeEquals(provided, expected);
    }
}
