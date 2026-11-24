using System.Security.Claims;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.OpenApi;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);
var connectionString = builder.Configuration.GetConnectionString("Claymores");
var authority = builder.Configuration["Authentication:Authority"];
var audience = builder.Configuration["Authentication:Audience"];
var duesEnabled = builder.Configuration.GetValue<bool>("Dues:Enabled");
var checkoutEnabled = builder.Configuration.GetValue<bool>("Stripe:CheckoutEnabled");
var publicOrigins = builder.Configuration.GetSection("Cors:PublicOrigins").Get<string[]>() ?? [];

if (publicOrigins.Any(origin =>
        !Uri.TryCreate(origin, UriKind.Absolute, out var uri) ||
        (uri.Scheme != Uri.UriSchemeHttps && !(uri.Scheme == Uri.UriSchemeHttp && uri.IsLoopback)) ||
        uri.UserInfo.Length != 0 || origin != uri.GetLeftPart(UriPartial.Authority)))
    throw new InvalidOperationException("Public API CORS requires exact HTTPS origins or HTTP loopback origins.");

if (string.IsNullOrWhiteSpace(authority) != string.IsNullOrWhiteSpace(audience))
    throw new InvalidOperationException("Set both Authentication:Authority and Authentication:Audience.");

builder.Services.AddProblemDetails();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddCors(options => options.AddPolicy("PublicReads",
    policy => policy.WithOrigins(publicOrigins).WithMethods("GET")));
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "Claymores API",
        Version = "v1",
        Description = "Public rugby fixtures, standings, teams, players, and practices, with a protected endpoint for the current identity."
    });
    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        Description = "Enter the API access token. Swagger UI adds the Bearer prefix."
    });
    options.AddSecurityDefinition("ClubSession", new OpenApiSecurityScheme
    {
        Type = SecuritySchemeType.ApiKey,
        In = ParameterLocation.Cookie,
        Name = "__Host-claymores-session",
        Description = "Sign in to the API origin with Google in the same browser."
    });
    options.OperationFilter<BearerOperationFilter>();
});
builder.Services.AddHttpClient<SanityData>(client =>
{
    client.BaseAddress = new Uri("https://bw1seoll.api.sanity.io/v2024-01-01/data/query/production");
    client.Timeout = TimeSpan.FromSeconds(10);
});
var authentication = builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = false;
        if (!string.IsNullOrWhiteSpace(authority))
        {
            options.Authority = authority;
            options.Audience = audience;
        }
    });
builder.Services.AddAuthorization();
var googleEnabled = GoogleSignIn.Configure(authentication, builder.Configuration);
if (duesEnabled && (!googleEnabled || string.IsNullOrWhiteSpace(connectionString)))
    throw new InvalidOperationException("Dues requires Google sign-in and a Postgres connection.");

if (!string.IsNullOrWhiteSpace(connectionString))
{
    builder.Services.AddSingleton(_ => NpgsqlDataSource.Create(connectionString));
    builder.Services.AddSingleton<FixtureDatabase>();
    if (duesEnabled)
    {
        builder.Services.AddSingleton<DuesLedger>();
        builder.Services.AddSingleton<ClubMemberDirectory>();
    }
}

if (checkoutEnabled)
{
    if (!duesEnabled)
        throw new InvalidOperationException("Enable dues before enabling Stripe test checkout.");

    var checkoutSettings = CheckoutSettings.Read(builder.Configuration);
    builder.Services.AddSingleton(checkoutSettings);
    builder.Services.AddSingleton(new Stripe.Checkout.SessionService(new Stripe.StripeClient(checkoutSettings.SecretKey)));
    builder.Services.AddSingleton<DuesCheckoutStore>();
    builder.Services.AddSingleton<DuesCheckout>();
}

var app = builder.Build();
if (args is ["--import-fixtures"])
{
    var database = app.Services.GetService<FixtureDatabase>()
        ?? throw new InvalidOperationException("Set ConnectionStrings:Claymores before importing.");
    var sanity = app.Services.GetRequiredService<SanityData>();
    var fixtures = await sanity.FixturesAsync(null, CancellationToken.None);
    Console.WriteLine($"Upserted {await database.ImportAsync(fixtures, CancellationToken.None)} fixtures.");
    await app.DisposeAsync();
    return;
}

app.UseExceptionHandler(new ExceptionHandlerOptions
{
    StatusCodeSelector = error => error switch
    {
        HttpRequestException => StatusCodes.Status502BadGateway,
        OperationCanceledException { InnerException: TimeoutException } => StatusCodes.Status504GatewayTimeout,
        _ => StatusCodes.Status500InternalServerError
    }
});
if (app.Environment.IsDevelopment() || app.Configuration.GetValue<bool>("Swagger:Enabled"))
{
    app.UseSwagger();
    app.UseSwaggerUI(options => options.SwaggerEndpoint("./v1/swagger.json", "Claymores API v1"));
}
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
GoogleSignIn.Map(app, googleEnabled);
if (duesEnabled)
{
    DuesEndpoints.Map(app);
    DuesAdminPage.Map(app);
}
if (checkoutEnabled)
    DuesCheckout.Map(app);

app.MapGet("/health", () => Results.Ok(new HealthResponse("ok")))
    .WithTags("Health")
    .WithSummary("Check that the API is running")
    .Produces<HealthResponse>();
var api = app.MapGroup("/v1").RequireCors("PublicReads");

api.MapGet("/fixtures", async (int? season, SanityData sanity, CancellationToken ct) =>
{
    if (season is < 1900 or > 2200)
        return Results.BadRequest(new { error = "season must be a four-digit year." });

    var database = app.Services.GetService<FixtureDatabase>();
    var fixtures = database is null
        ? await sanity.FixturesAsync(season, ct)
        : await database.ListAsync(season, ct);
    return Results.Ok(fixtures);
})
    .WithTags("Fixtures")
    .WithSummary("List fixtures")
    .WithDescription("Returns fixtures ordered by date and ID. Optionally filter by a four-digit season, such as 2027.")
    .Produces<FixtureResponse[]>()
    .Produces(StatusCodes.Status400BadRequest)
    .ProducesProblem(StatusCodes.Status502BadGateway)
    .ProducesProblem(StatusCodes.Status504GatewayTimeout);

api.MapGet("/fixtures/{id}", async (string id, SanityData sanity, CancellationToken ct) =>
{
    var database = app.Services.GetService<FixtureDatabase>();
    var fixture = database is null
        ? await sanity.FixtureAsync(id, ct)
        : await database.FindAsync(id, ct);
    return fixture.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined
        ? Results.NotFound()
        : Results.Ok(fixture);
})
    .WithTags("Fixtures")
    .WithSummary("Get a fixture by ID")
    .WithDescription("Use the fixture ID returned by the list endpoint.")
    .Produces<FixtureResponse>()
    .Produces(StatusCodes.Status404NotFound)
    .ProducesProblem(StatusCodes.Status502BadGateway)
    .ProducesProblem(StatusCodes.Status504GatewayTimeout);

api.MapGet("/standings", async (string? season, SanityData sanity, CancellationToken ct) =>
{
    if (season is not null && !Regex.IsMatch(season, @"\A[0-9]{4}-[0-9]{4}\z"))
        return Results.BadRequest(new { error = "season must use YYYY-YYYY." });

    var standings = await sanity.StandingsAsync(season, ct);
    return standings.ValueKind == JsonValueKind.Null ? Results.NotFound() : Results.Ok(standings);
})
    .WithTags("Standings")
    .WithSummary("Get league standings")
    .WithDescription("Returns the current standings by default. Request a historical season with a label such as 2025-2026.")
    .Produces<StandingsResponse>()
    .Produces(StatusCodes.Status400BadRequest)
    .Produces(StatusCodes.Status404NotFound)
    .ProducesProblem(StatusCodes.Status502BadGateway)
    .ProducesProblem(StatusCodes.Status504GatewayTimeout);

api.MapGet("/standings/seasons", async (SanityData sanity, CancellationToken ct) =>
    Results.Ok(await sanity.StandingsSeasonsAsync(ct)))
    .WithTags("Standings")
    .WithSummary("List standings seasons")
    .WithDescription("Returns the season cards used by the website standings index, newest first.")
    .Produces<StandingsSeasonResponse[]>()
    .ProducesProblem(StatusCodes.Status502BadGateway)
    .ProducesProblem(StatusCodes.Status504GatewayTimeout);

api.MapGet("/teams", async (SanityData sanity, CancellationToken ct) =>
    Results.Ok(await sanity.TeamsAsync(ct)))
    .WithTags("Teams")
    .WithSummary("List teams")
    .WithDescription("Returns published team profiles, logos, and alternate names ordered by team name.")
    .Produces<TeamResponse[]>()
    .ProducesProblem(StatusCodes.Status502BadGateway)
    .ProducesProblem(StatusCodes.Status504GatewayTimeout);

api.MapGet("/practices", async (SanityData sanity, CancellationToken ct) =>
    Results.Ok(await sanity.PracticesAsync(ct)))
    .WithTags("Practices")
    .WithSummary("List active calendar activities")
    .WithDescription("Returns published and active practices, festivals, and events ordered by start date. The list includes recurring activity definitions.")
    .Produces<PracticeResponse[]>()
    .ProducesProblem(StatusCodes.Status502BadGateway)
    .ProducesProblem(StatusCodes.Status504GatewayTimeout);

api.MapGet("/practices/schedule", async (SanityData sanity, CancellationToken ct) =>
{
    var schedule = await sanity.PracticeScheduleAsync(ct);
    return schedule.ValueKind == JsonValueKind.Null ? Results.NotFound() : Results.Ok(schedule);
})
    .WithTags("Practices")
    .WithSummary("Get the regular practice schedule")
    .WithDescription("Returns the published practice schedule, including the weeknight, time, and location.")
    .Produces<PracticeScheduleResponse>()
    .Produces(StatusCodes.Status404NotFound)
    .ProducesProblem(StatusCodes.Status502BadGateway)
    .ProducesProblem(StatusCodes.Status504GatewayTimeout);

api.MapGet("/players", async (SanityData sanity, CancellationToken ct) =>
    Results.Ok(await sanity.PlayersAsync(ct)))
    .WithTags("Players")
    .WithSummary("List active roster players")
    .WithDescription("Returns public, active player profiles from the club roster, ordered by name.")
    .Produces<PlayerResponse[]>()
    .ProducesProblem(StatusCodes.Status502BadGateway)
    .ProducesProblem(StatusCodes.Status504GatewayTimeout);

api.MapGet("/players/{slug}", async (string slug, SanityData sanity, CancellationToken ct) =>
{
    var player = await sanity.PlayerAsync(slug, ct);
    return player.ValueKind == JsonValueKind.Null ? Results.NotFound() : Results.Ok(player);
})
    .WithTags("Players")
    .WithSummary("Get an active roster player")
    .WithDescription("Looks up a public, active roster profile by its website slug.")
    .Produces<PlayerResponse>()
    .Produces(StatusCodes.Status404NotFound)
    .ProducesProblem(StatusCodes.Status502BadGateway)
    .ProducesProblem(StatusCodes.Status504GatewayTimeout);

app.MapGet("/v1/me", (ClaimsPrincipal user) => Results.Ok(new CurrentIdentityResponse(
    user.FindFirstValue("sub"),
    user.FindFirstValue("name") ?? user.Identity?.Name)))
    .RequireAuthorization()
    .WithTags("Identity")
    .WithSummary("Get the current API identity")
    .WithDescription("Provide an access token issued for this API to see the subject and name claims.")
    .Produces<CurrentIdentityResponse>()
    .Produces(StatusCodes.Status401Unauthorized);

await app.RunAsync();
