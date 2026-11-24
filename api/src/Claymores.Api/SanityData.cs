using System.Text.Json;

public sealed class SanityData(HttpClient client)
{
    private const string FixtureFields = """
        {"id": _id,"updatedAt": _updatedAt,date,season,homeTeam,awayTeam,homeScore,awayScore,status,
        venue,kickoffTime,note,matchType,competition,recap,
        "homeLogo": homeTeamRef->image.asset->url,
        "awayLogo": awayTeamRef->image.asset->url,
        "homeTeamSlug": homeTeamRef->slug.current,
        "awayTeamSlug": awayTeamRef->slug.current,
        "homeTeamCity": homeTeamRef->city,
        "awayTeamCity": awayTeamRef->city}
        """;

    private const string StandingsFields = """
        {"id": _id,"updatedAt": _updatedAt,championshipId,seasonLabel,divisionName,lastUpdated,rows,playoffs}
        """;

    private const string PlayerFields = """
        {"id": _id, "updatedAt": _updatedAt, name, "slug": slug.current, active, position, height,
        weight, "imageUrl": image.asset->url, "imageAlt": image.alt, description,
        "mediaTag": mediaTag->name.current}
        """;

    public async Task<JsonElement[]> FixturesAsync(int? season, CancellationToken ct)
    {
        var filter = season.HasValue ? " && season == $season" : "";
        var query = "*[_type == \"match\" && hidden != true" + filter + "] | order(date asc, _id asc) " + FixtureFields;
        var result = await QueryAsync(query, season.HasValue ? ("season", season.Value) : null, ct);
        return result.EnumerateArray().Select(item => item.Clone()).ToArray();
    }

    /// <summary>Every match with the fields --adopt-sanity-overrides needs, including manualOverride.</summary>
    public async Task<JsonElement[]> FixturesForAdoptionAsync(CancellationToken ct)
    {
        var result = await QueryAsync("""
            *[_type == "match"] | order(date asc, _id asc) {
              "id": _id, date, season, homeTeam, awayTeam, homeScore, awayScore, status,
              venue, kickoffTime, note, matchType, competition, manualOverride, hidden
            }
            """, null, ct);
        return result.EnumerateArray().Select(item => item.Clone()).ToArray();
    }

    public Task<JsonElement> FixtureAsync(string id, CancellationToken ct) =>
        QueryAsync("*[_type == \"match\" && _id == $id && hidden != true][0] " + FixtureFields, ("id", id), ct);

    public Task<JsonElement> StandingsAsync(string? season, CancellationToken ct)
    {
        const string current = """
            coalesce(
              *[_type == "leagueChampionship" && _id == "leagueChampionship"][0] {
                "doc": *[_type == "leagueStandings" && championshipId == ^.championshipId][0]
              }.doc,
              *[_type == "leagueStandings"] | order(seasonLabel desc, _updatedAt desc) [0]
            )
            """;
        return season is null
            ? QueryAsync(current + StandingsFields, null, ct)
            : QueryAsync("*[_type == \"leagueStandings\" && seasonLabel == $season] | order(_updatedAt desc)[0] "
                + StandingsFields, ("season", season), ct);
    }

    public Task<JsonElement> StandingsSeasonsAsync(CancellationToken ct) =>
        QueryAsync("""
            *[_type == "leagueStandings"] | order(seasonLabel desc) {
              seasonLabel,divisionName,lastUpdated,
              "teamCount": count(rows),
              "claymoresPosition": rows[teamName match "*Claymore*"][0].position
            }
            """, null, ct);

    public Task<JsonElement> ChampionshipAsync(CancellationToken ct) =>
        QueryAsync("""
            *[_type == "leagueChampionship" && _id == "leagueChampionship"][0] {
              active, championshipId, seasonLabel, divisionName, lastScrapedAt, lastScrapeStatus
            }
            """, null, ct);

    public Task<JsonElement> TeamsAsync(CancellationToken ct) =>
        QueryAsync("""
            *[_type == "team"] | order(name asc, _id asc) {
              "id": _id, "updatedAt": _updatedAt, name, "slug": slug.current, aliases,
              "logoUrl": image.asset->url, "logoAlt": image.alt, city, website, description
            }
            """, null, ct);

    public Task<JsonElement> PracticesAsync(CancellationToken ct) =>
        QueryAsync("""
            *[_type in ["practice", "festival", "event"] && active == true] | order(startDate asc, _id asc) {
              "id": _id, "updatedAt": _updatedAt, title, active, "iconUrl": icon.asset->url,
              "iconAlt": icon.alt, startDate, time, address, description, recurring, weekdays,
              skipDates, "eventType": _type, venue, participants, socialVenue, socialAddress
            }
            """, null, ct);

    public Task<JsonElement> PracticeScheduleAsync(CancellationToken ct) =>
        QueryAsync("""
            *[_type == "practiceSchedule" && _id == "practiceSchedule"][0] {
              seasonLabel, weekday, time, venueName, venueAddress, venueStreet, venueCity,
              venueRegion, venuePostalCode, mapEmbedUrl, seasonalNote
            }
            """, null, ct);

    public Task<JsonElement> PlayersAsync(CancellationToken ct) =>
        QueryAsync("*[_type == \"player\" && active == true] | order(name asc, _id asc) " + PlayerFields, null, ct);

    public Task<JsonElement> PlayerAsync(string slug, CancellationToken ct) =>
        QueryAsync("*[_type == \"player\" && active == true && slug.current == $slug][0] " + PlayerFields, ("slug", slug), ct);

    private async Task<JsonElement> QueryAsync(string query, (string Name, object Value)? parameter, CancellationToken ct)
    {
        var url = client.BaseAddress + "?perspective=published&query=" + Uri.EscapeDataString(query);
        if (parameter is { } value)
            url += "&$" + value.Name + "=" + Uri.EscapeDataString(JsonSerializer.Serialize(value.Value));

        using var response = await client.GetAsync(url, ct);
        response.EnsureSuccessStatusCode();
        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        using var document = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
        return document.RootElement.GetProperty("result").Clone();
    }
}
