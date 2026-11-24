using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.OpenApi;
using Swashbuckle.AspNetCore.SwaggerGen;

internal sealed class BearerOperationFilter : IOperationFilter
{
    public void Apply(OpenApiOperation operation, OperationFilterContext context)
    {
        var metadata = context.ApiDescription.ActionDescriptor.EndpointMetadata;
        if (metadata.OfType<IAllowAnonymous>().Any() || !metadata.OfType<IAuthorizeData>().Any())
            return;

        var policy = metadata.OfType<IAuthorizeData>().Select(item => item.Policy);
        // Club routes take the browser session or, with mobile sign-in on, an API bearer token.
        string[] schemes = policy.Any(name => name is GoogleSignIn.RolePolicy or GoogleSignIn.AdminPolicy)
            ? ["ClubSession", "Bearer"] : ["Bearer"];
        operation.Security ??= [];
        foreach (var scheme in schemes)
            operation.Security.Add(new OpenApiSecurityRequirement
            {
                [new OpenApiSecuritySchemeReference(scheme, context.Document)] = []
            });
    }
}

internal sealed record HealthResponse(string Status);

internal sealed record CurrentIdentityResponse(string? Subject, string? Name, string? Email, string? Role);

internal sealed record FixtureResponse(
    string Id,
    DateTimeOffset? UpdatedAt,
    DateOnly Date,
    int? Season,
    string HomeTeam,
    string AwayTeam,
    int? HomeScore,
    int? AwayScore,
    string? Status,
    string? Venue,
    string? KickoffTime,
    string? Note,
    string? MatchType,
    Uri? HomeLogo,
    Uri? AwayLogo,
    string? Competition,
    JsonElement[]? Recap,
    string? HomeTeamSlug,
    string? AwayTeamSlug,
    string? HomeTeamCity,
    string? AwayTeamCity);

internal sealed record StandingsResponse(
    string Id,
    DateTimeOffset? UpdatedAt,
    string? ChampionshipId,
    string? SeasonLabel,
    string? DivisionName,
    string? LastUpdated,
    Dictionary<string, JsonElement>[]? Rows,
    Dictionary<string, JsonElement>[]? Playoffs);


internal sealed record StandingsSeasonResponse(
    string SeasonLabel,
    string? DivisionName,
    string? LastUpdated,
    int? TeamCount,
    int? ClaymoresPosition);

internal sealed record TeamResponse(
    string Id,
    DateTimeOffset UpdatedAt,
    string Name,
    string? Slug,
    string[]? Aliases,
    Uri? LogoUrl,
    string? LogoAlt,
    string? City,
    string? Website,
    string? Description);

internal sealed record PracticeResponse(
    string Id,
    DateTimeOffset UpdatedAt,
    string Title,
    bool Active,
    Uri? IconUrl,
    string? IconAlt,
    DateOnly? StartDate,
    string? Time,
    string? Address,
    string? Description,
    bool? Recurring,
    string[]? Weekdays,
    DateOnly[]? SkipDates,
    string EventType,
    string? Venue,
    string[]? Participants,
    string? SocialVenue,
    string? SocialAddress);

internal sealed record PracticeScheduleResponse(
    string? SeasonLabel,
    string? Weekday,
    string? Time,
    string? VenueName,
    string? VenueAddress,
    string? VenueStreet,
    string? VenueCity,
    string? VenueRegion,
    string? VenuePostalCode,
    string? MapEmbedUrl,
    string? SeasonalNote);

internal sealed record PlayerResponse(
    string Id,
    DateTimeOffset UpdatedAt,
    string Name,
    string? Slug,
    bool Active,
    string? Position,
    string? Height,
    string? Weight,
    Uri? ImageUrl,
    string? ImageAlt,
    string? Description,
    string? MediaTag);
