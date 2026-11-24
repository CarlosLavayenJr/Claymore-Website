using System.Text.Json;
using System.Text.RegularExpressions;
using Npgsql;
using NpgsqlTypes;

public sealed record TeamRef(long Id, string Name);

public sealed record FixtureUpsert(ScrapedFixture Fixture, TeamRef Home, TeamRef Away, int ClubId, int SeasonId, string? Venue);

public sealed record UpsertCounts(int Inserted, int Updated, int Unchanged, int SkippedManualOverride)
{
    public static UpsertCounts operator +(UpsertCounts a, UpsertCounts b) =>
        new(a.Inserted + b.Inserted, a.Updated + b.Updated, a.Unchanged + b.Unchanged,
            a.SkippedManualOverride + b.SkippedManualOverride);
}

public sealed record ChampionshipConfig(bool Active, string ChampionshipId, string SeasonLabel, string? DivisionName);

public sealed record StoredFixture(
    string Id, DateOnly Date, string HomeTeam, string AwayTeam, long HomeTeamId, long AwayTeamId,
    int? HomeScore, int? AwayScore, string Status, string? MatchType, string? Competition, string? Note,
    string? KickoffTime, string? Venue, bool ManualOverride);

/// <summary>Postgres reads and writes for the rugbyfl.com scraper (tables from sql/007_scraped_data.sql).</summary>
public sealed partial class ScrapeStore(NpgsqlDataSource dataSource)
{
    // Refreshes the API payload of scraper rows from their typed columns, so the payload
    // matches what GET /v1/fixtures returns for Sanity rows (same field names).
    private const string RefreshPayloadSql = """
        UPDATE fixtures f SET payload = jsonb_build_object(
            'id', f.sanity_id,
            'updatedAt', f.updated_at,
            'date', to_char(f.fixture_date, 'YYYY-MM-DD'),
            'season', f.season,
            'homeTeam', f.home_team_raw,
            'awayTeam', f.away_team_raw,
            'homeScore', f.home_score,
            'awayScore', f.away_score,
            'status', f.status,
            'venue', f.venue,
            'kickoffTime', to_char(f.kickoff_time, 'FMHH12:MI AM'),
            'note', f.note,
            'matchType', f.match_type,
            'competition', f.competition,
            'recap', NULL,
            'homeLogo', h.logo_url,
            'awayLogo', a.logo_url,
            'homeTeamSlug', h.slug,
            'awayTeamSlug', a.slug,
            'homeTeamCity', h.city,
            'awayTeamCity', a.city)
        FROM teams h, teams a
        WHERE h.id = f.home_team_id AND a.id = f.away_team_id AND f.source = 'scraper'
        """;

    public async Task<TeamNameResolver> LoadResolverAsync(CancellationToken ct)
    {
        await using var command = dataSource.CreateCommand("""
            SELECT t.id, t.name, COALESCE(array_agg(a.alias) FILTER (WHERE a.alias IS NOT NULL), '{}')
            FROM teams t LEFT JOIN team_aliases a ON a.team_id = t.id
            WHERE t.source <> 'import'
            GROUP BY t.id, t.name
            """);
        await using var reader = await command.ExecuteReaderAsync(ct);
        var teams = new List<TeamCandidate>();
        while (await reader.ReadAsync(ct))
            teams.Add(new TeamCandidate(reader.GetInt64(0), reader.GetString(1), reader.GetFieldValue<string[]>(2)));
        return new TeamNameResolver(teams);
    }

    /// <summary>
    /// Resolves a name, or creates a team flagged <c>needs_review</c> for it. A raw row left by
    /// --import-fixtures with the same name is promoted instead of duplicated.
    /// Returns the team and whether it needs review.
    /// </summary>
    public async Task<(TeamRef Team, bool Created)> ResolveOrCreateAsync(TeamNameResolver resolver, string raw, CancellationToken ct)
    {
        var display = TeamNameResolver.DisplayName(raw);
        if (resolver.Resolve(display) is { } match)
            return (new TeamRef(match.TeamId, match.TeamName), false);

        await using var command = dataSource.CreateCommand("""
            WITH upsert AS (
                INSERT INTO teams (name, slug, source, needs_review)
                VALUES (@name, NULL, 'scraper', true)
                ON CONFLICT (name) DO UPDATE SET
                    source = CASE WHEN teams.source = 'import' THEN 'scraper' ELSE teams.source END,
                    needs_review = teams.needs_review OR teams.source = 'import'
                RETURNING id, name, slug
            )
            SELECT id, name, slug FROM upsert
            """);
        command.Parameters.AddWithValue("name", display);
        long id;
        string name;
        bool hasSlug;
        await using (var reader = await command.ExecuteReaderAsync(ct))
        {
            await reader.ReadAsync(ct);
            id = reader.GetInt64(0);
            name = reader.GetString(1);
            hasSlug = !reader.IsDBNull(2);
        }
        if (!hasSlug)
            await AssignSlugAsync(id, name, ct);
        resolver.Add(new TeamCandidate(id, name, []));
        return (new TeamRef(id, name), true);
    }

    private async Task AssignSlugAsync(long id, string name, CancellationToken ct)
    {
        var baseSlug = Slugify(name);
        for (var n = 1; ; n++)
        {
            var candidate = n == 1 ? baseSlug : $"{baseSlug}-{n}";
            await using var command = dataSource.CreateCommand("""
                UPDATE teams SET slug = @slug WHERE id = @id AND slug IS NULL
                AND NOT EXISTS (SELECT 1 FROM teams WHERE slug = @slug)
                """);
            command.Parameters.AddWithValue("slug", candidate);
            command.Parameters.AddWithValue("id", id);
            if (await command.ExecuteNonQueryAsync(ct) == 1) return;
        }
    }

    public static string Slugify(string text)
    {
        var slug = NonSlug().Replace(text.ToLowerInvariant(), "-").Trim('-');
        return slug.Length == 0 ? "team" : slug;
    }

    public static string FixtureId(DateOnly date, long homeTeamId, long awayTeamId) =>
        $"rfl-{date:yyyy-MM-dd}-{homeTeamId}-{awayTeamId}";

    /// <summary>
    /// Inserts new games and updates scores, status, notes and the rest on existing ones, keyed by
    /// (date, home team, away team). Rows with manual_override are never touched. A venue or kickoff
    /// that the current run did not capture keeps its stored value. Runs in one transaction.
    /// </summary>
    public async Task<UpsertCounts> UpsertFixturesAsync(IReadOnlyList<FixtureUpsert> fixtures, DateTimeOffset scrapedAt, CancellationToken ct)
    {
        var counts = new UpsertCounts(0, 0, 0, 0);
        if (fixtures.Count == 0) return counts;

        await using var connection = await dataSource.OpenConnectionAsync(ct);
        await using var transaction = await connection.BeginTransactionAsync(ct);
        var ids = new List<string>();
        foreach (var item in fixtures
                     .DistinctBy(item => (item.Fixture.Date, item.Home.Id, item.Away.Id))
                     .OrderBy(item => item.Fixture.Date).ThenBy(item => item.Home.Id).ThenBy(item => item.Away.Id))
        {
            var f = item.Fixture;
            await using var command = new NpgsqlCommand("""
                INSERT INTO fixtures AS f (
                    sanity_id, source, fixture_date, season, home_team, away_team, home_team_id, away_team_id,
                    home_team_raw, away_team_raw, status, match_type, competition, note, home_score, away_score,
                    kickoff_time, venue, source_club_id, source_season_id, source_game_id,
                    first_scraped_at, last_scraped_at, updated_at, payload)
                VALUES (
                    @id, 'scraper', @date, @season, @home, @away, @home_id, @away_id,
                    @home_raw, @away_raw, @status, @match_type, @competition, @note, @home_score, @away_score,
                    @kickoff, @venue, @club_id, @season_id, @game_id,
                    @scraped_at, @scraped_at, @scraped_at, '{}'::jsonb)
                ON CONFLICT (fixture_date, home_team_id, away_team_id) WHERE source = 'scraper' DO UPDATE SET
                    season = EXCLUDED.season,
                    home_team_raw = EXCLUDED.home_team_raw,
                    away_team_raw = EXCLUDED.away_team_raw,
                    status = EXCLUDED.status,
                    match_type = EXCLUDED.match_type,
                    competition = EXCLUDED.competition,
                    note = EXCLUDED.note,
                    home_score = EXCLUDED.home_score,
                    away_score = EXCLUDED.away_score,
                    kickoff_time = COALESCE(EXCLUDED.kickoff_time, f.kickoff_time),
                    venue = COALESCE(EXCLUDED.venue, f.venue),
                    source_club_id = EXCLUDED.source_club_id,
                    source_season_id = EXCLUDED.source_season_id,
                    source_game_id = COALESCE(EXCLUDED.source_game_id, f.source_game_id),
                    last_scraped_at = EXCLUDED.last_scraped_at,
                    updated_at = EXCLUDED.updated_at
                WHERE NOT f.manual_override AND (
                    f.season, f.home_team_raw, f.away_team_raw, f.status, f.match_type, f.competition, f.note,
                    f.home_score, f.away_score, f.kickoff_time, f.venue, f.source_game_id)
                    IS DISTINCT FROM (
                    EXCLUDED.season, EXCLUDED.home_team_raw, EXCLUDED.away_team_raw, EXCLUDED.status,
                    EXCLUDED.match_type, EXCLUDED.competition, EXCLUDED.note, EXCLUDED.home_score,
                    EXCLUDED.away_score, COALESCE(EXCLUDED.kickoff_time, f.kickoff_time),
                    COALESCE(EXCLUDED.venue, f.venue), COALESCE(EXCLUDED.source_game_id, f.source_game_id))
                RETURNING sanity_id, (xmax = 0) AS inserted
                """, connection, transaction);
            var p = command.Parameters;
            p.AddWithValue("id", FixtureId(f.Date, item.Home.Id, item.Away.Id));
            p.AddWithValue("date", f.Date);
            p.AddWithValue("season", f.Season);
            p.AddWithValue("home", item.Home.Name);
            p.AddWithValue("away", item.Away.Name);
            p.AddWithValue("home_id", item.Home.Id);
            p.AddWithValue("away_id", item.Away.Id);
            p.AddWithValue("home_raw", f.HomeTeam);
            p.AddWithValue("away_raw", f.AwayTeam);
            p.AddWithValue("status", f.Status);
            p.AddWithValue("match_type", f.MatchType);
            p.Add("competition", NpgsqlDbType.Text).Value = (object?)f.Competition ?? DBNull.Value;
            p.Add("note", NpgsqlDbType.Text).Value = (object?)f.Note ?? DBNull.Value;
            p.AddWithValue("home_score", f.HomeScore);
            p.AddWithValue("away_score", f.AwayScore);
            p.Add("kickoff", NpgsqlDbType.Time).Value = f.Kickoff is { } kickoff ? kickoff : DBNull.Value;
            p.Add("venue", NpgsqlDbType.Text).Value = (object?)item.Venue ?? DBNull.Value;
            p.AddWithValue("club_id", item.ClubId);
            p.AddWithValue("season_id", item.SeasonId);
            p.Add("game_id", NpgsqlDbType.Integer).Value = f.GameId is { } gameId ? gameId : DBNull.Value;
            p.AddWithValue("scraped_at", scrapedAt);

            await using (var reader = await command.ExecuteReaderAsync(ct))
            {
                if (await reader.ReadAsync(ct))
                {
                    ids.Add(reader.GetString(0));
                    counts += reader.GetBoolean(1) ? new UpsertCounts(1, 0, 0, 0) : new UpsertCounts(0, 1, 0, 0);
                    continue;
                }
            }

            // No row returned: either nothing changed or the row is locked by manual_override.
            await using var check = new NpgsqlCommand("""
                SELECT manual_override FROM fixtures
                WHERE source = 'scraper' AND fixture_date = @date AND home_team_id = @home_id AND away_team_id = @away_id
                """, connection, transaction);
            check.Parameters.AddWithValue("date", f.Date);
            check.Parameters.AddWithValue("home_id", item.Home.Id);
            check.Parameters.AddWithValue("away_id", item.Away.Id);
            var locked = (bool)(await check.ExecuteScalarAsync(ct))!;
            counts += locked ? new UpsertCounts(0, 0, 0, 1) : new UpsertCounts(0, 0, 1, 0);
            if (!locked)
            {
                // Unchanged rows still record that this run saw them.
                await using var touch = new NpgsqlCommand("""
                    UPDATE fixtures SET last_scraped_at = @scraped_at
                    WHERE source = 'scraper' AND fixture_date = @date AND home_team_id = @home_id AND away_team_id = @away_id
                    """, connection, transaction);
                touch.Parameters.AddWithValue("scraped_at", scrapedAt);
                touch.Parameters.AddWithValue("date", f.Date);
                touch.Parameters.AddWithValue("home_id", item.Home.Id);
                touch.Parameters.AddWithValue("away_id", item.Away.Id);
                await touch.ExecuteNonQueryAsync(ct);
            }
        }

        if (ids.Count > 0)
        {
            await using var refresh = new NpgsqlCommand(RefreshPayloadSql + " AND f.sanity_id = ANY(@ids)", connection, transaction);
            refresh.Parameters.AddWithValue("ids", ids.ToArray());
            await refresh.ExecuteNonQueryAsync(ct);
        }
        await transaction.CommitAsync(ct);
        return counts;
    }

    public async Task<StoredFixture[]> ScrapedFixturesAsync(CancellationToken ct)
    {
        await using var command = dataSource.CreateCommand("""
            SELECT sanity_id, fixture_date, home_team_raw, away_team_raw, home_team_id, away_team_id,
                   home_score, away_score, status, match_type, competition, note,
                   to_char(kickoff_time, 'FMHH12:MI AM'), venue, manual_override
            FROM fixtures WHERE source = 'scraper' ORDER BY fixture_date, sanity_id
            """);
        await using var reader = await command.ExecuteReaderAsync(ct);
        var rows = new List<StoredFixture>();
        while (await reader.ReadAsync(ct))
            rows.Add(new StoredFixture(reader.GetString(0), reader.GetFieldValue<DateOnly>(1), reader.GetString(2),
                reader.GetString(3), reader.GetInt64(4), reader.GetInt64(5), NullableInt(reader, 6), NullableInt(reader, 7),
                reader.GetString(8), NullableString(reader, 9), NullableString(reader, 10), NullableString(reader, 11),
                NullableString(reader, 12), NullableString(reader, 13), reader.GetBoolean(14)));
        return rows.ToArray();
    }

    // ── Championship config and standings ───────────────────────────────────

    public async Task<ChampionshipConfig?> ChampionshipConfigAsync(CancellationToken ct)
    {
        await using var command = dataSource.CreateCommand(
            "SELECT active, championship_id, season_label, division_name FROM championship_config");
        await using var reader = await command.ExecuteReaderAsync(ct);
        return await reader.ReadAsync(ct)
            ? new ChampionshipConfig(reader.GetBoolean(0), reader.GetString(1), reader.GetString(2), NullableString(reader, 3))
            : null;
    }

    public async Task SaveChampionshipConfigAsync(ChampionshipConfig config, CancellationToken ct)
    {
        await using var command = dataSource.CreateCommand("""
            INSERT INTO championship_config (active, championship_id, season_label, division_name)
            VALUES (@active, @id, @season, @division)
            ON CONFLICT (singleton) DO UPDATE SET active = EXCLUDED.active, championship_id = EXCLUDED.championship_id,
                season_label = EXCLUDED.season_label, division_name = EXCLUDED.division_name, updated_at = now()
            """);
        command.Parameters.AddWithValue("active", config.Active);
        command.Parameters.AddWithValue("id", config.ChampionshipId);
        command.Parameters.AddWithValue("season", config.SeasonLabel);
        command.Parameters.Add("division", NpgsqlDbType.Text).Value = (object?)config.DivisionName ?? DBNull.Value;
        await command.ExecuteNonQueryAsync(ct);
    }

    public async Task StampChampionshipAsync(string status, CancellationToken ct)
    {
        await using var command = dataSource.CreateCommand(
            "UPDATE championship_config SET last_scraped_at = now(), last_scrape_status = @status");
        command.Parameters.AddWithValue("status", status);
        await command.ExecuteNonQueryAsync(ct);
    }

    /// <summary>Replaces the standings and playoffs for one championship, like Sanity's createOrReplace.</summary>
    public async Task ReplaceStandingsAsync(string championshipId, string seasonLabel, string? divisionName,
        string sourceUrl, ParsedChampionship parsed, TeamNameResolver resolver, CancellationToken ct)
    {
        // Resolve outside the transaction: auto-created teams survive a failed write, which is harmless.
        var teamIds = new Dictionary<string, long>(StringComparer.Ordinal);
        foreach (var name in parsed.Rows.Select(r => r.Row.TeamName)
                     .Concat(parsed.Playoffs.SelectMany(p => new[] { p.HomeTeam, p.AwayTeam })).Distinct())
            teamIds[name] = (await ResolveOrCreateAsync(resolver, name, ct)).Team.Id;

        await using var connection = await dataSource.OpenConnectionAsync(ct);
        await using var transaction = await connection.BeginTransactionAsync(ct);
        await using (var header = new NpgsqlCommand("""
            INSERT INTO standings (championship_id, season_label, division_name, source, source_url, last_updated)
            VALUES (@id, @season, @division, @source, @url, now())
            ON CONFLICT (championship_id) DO UPDATE SET season_label = EXCLUDED.season_label,
                division_name = EXCLUDED.division_name, source = EXCLUDED.source, source_url = EXCLUDED.source_url,
                last_updated = EXCLUDED.last_updated;
            DELETE FROM standings_rows WHERE championship_id = @id;
            DELETE FROM standings_playoffs WHERE championship_id = @id;
            """, connection, transaction))
        {
            header.Parameters.AddWithValue("id", championshipId);
            header.Parameters.AddWithValue("season", seasonLabel);
            header.Parameters.Add("division", NpgsqlDbType.Text).Value = (object?)divisionName ?? DBNull.Value;
            header.Parameters.AddWithValue("source", parsed.Source == StandingsSource.StandingsTable
                ? "standings-table" : "computed-from-schedule");
            header.Parameters.AddWithValue("url", sourceUrl);
            await header.ExecuteNonQueryAsync(ct);
        }

        await using var batch = new NpgsqlBatch(connection, transaction);
        foreach (var (position, row) in parsed.Rows)
        {
            var command = new NpgsqlBatchCommand("""
                INSERT INTO standings_rows (championship_id, position, team_name, team_id, pool, played, won, lost,
                    drawn, points_for, points_against, points_difference, bonus_points, total_points)
                VALUES (@id, @position, @name, @team_id, @pool, @p, @w, @l, @d, @pf, @pa, @pd, @bp, @tp)
                """);
            var p = command.Parameters;
            p.AddWithValue("id", championshipId);
            p.AddWithValue("position", position);
            p.AddWithValue("name", row.TeamName);
            p.AddWithValue("team_id", teamIds[row.TeamName]);
            p.AddWithValue("pool", row.Pool);
            p.AddWithValue("p", row.Played);
            p.AddWithValue("w", row.Won);
            p.AddWithValue("l", row.Lost);
            p.AddWithValue("d", row.Drawn);
            p.AddWithValue("pf", row.PointsFor);
            p.AddWithValue("pa", row.PointsAgainst);
            p.AddWithValue("pd", row.PointsDifference);
            p.AddWithValue("bp", row.BonusPoints);
            p.AddWithValue("tp", row.TotalPoints);
            batch.BatchCommands.Add(command);
        }
        foreach (var (playoff, ordinal) in parsed.Playoffs.Select((playoff, index) => (playoff, index)))
        {
            var command = new NpgsqlBatchCommand("""
                INSERT INTO standings_playoffs (championship_id, ordinal, round, label, match_date, home_team, away_team,
                    home_team_id, away_team_id, home_score, away_score)
                VALUES (@id, @ordinal, @round, @label, @date, @home, @away, @home_id, @away_id, @home_score, @away_score)
                """);
            var p = command.Parameters;
            p.AddWithValue("id", championshipId);
            p.AddWithValue("ordinal", ordinal);
            p.AddWithValue("round", playoff.Round);
            p.AddWithValue("label", playoff.Label);
            p.Add("date", NpgsqlDbType.Date).Value =
                DateOnly.TryParseExact(playoff.Date, "yyyy-MM-dd", out var date) ? date : DBNull.Value;
            p.AddWithValue("home", playoff.HomeTeam);
            p.AddWithValue("away", playoff.AwayTeam);
            p.AddWithValue("home_id", teamIds[playoff.HomeTeam]);
            p.AddWithValue("away_id", teamIds[playoff.AwayTeam]);
            p.Add("home_score", NpgsqlDbType.Integer).Value = playoff.HomeScore is { } hs ? hs : DBNull.Value;
            p.Add("away_score", NpgsqlDbType.Integer).Value = playoff.AwayScore is { } @as ? @as : DBNull.Value;
            batch.BatchCommands.Add(command);
        }
        if (batch.BatchCommands.Count > 0)
            await batch.ExecuteNonQueryAsync(ct);
        await transaction.CommitAsync(ct);
    }

    public async Task<(RankedStandingsRow[] Rows, PlayoffEntry[] Playoffs)?> StandingsAsync(string championshipId, CancellationToken ct)
    {
        await using var connection = await dataSource.OpenConnectionAsync(ct);
        await using (var exists = new NpgsqlCommand("SELECT 1 FROM standings WHERE championship_id = @id", connection))
        {
            exists.Parameters.AddWithValue("id", championshipId);
            if (await exists.ExecuteScalarAsync(ct) is null) return null;
        }

        var rows = new List<RankedStandingsRow>();
        await using (var command = new NpgsqlCommand("""
            SELECT position, team_name, pool, played, won, lost, drawn, points_for, points_against,
                   points_difference, bonus_points, total_points
            FROM standings_rows WHERE championship_id = @id ORDER BY position
            """, connection))
        {
            command.Parameters.AddWithValue("id", championshipId);
            await using var reader = await command.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
                rows.Add(new RankedStandingsRow(reader.GetInt32(0), new StandingsRow(reader.GetString(1), reader.GetString(2),
                    reader.GetInt32(3), reader.GetInt32(4), reader.GetInt32(5), reader.GetInt32(6), reader.GetInt32(7),
                    reader.GetInt32(8), reader.GetInt32(9), reader.GetInt32(10), reader.GetInt32(11))));
        }

        var playoffs = new List<PlayoffEntry>();
        await using (var command = new NpgsqlCommand("""
            SELECT round, label, COALESCE(to_char(match_date, 'YYYY-MM-DD'), ''), home_team, away_team, home_score, away_score
            FROM standings_playoffs WHERE championship_id = @id ORDER BY ordinal
            """, connection))
        {
            command.Parameters.AddWithValue("id", championshipId);
            await using var reader = await command.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
                playoffs.Add(new PlayoffEntry(reader.GetString(0), reader.GetString(1), reader.GetString(2),
                    reader.GetString(3), reader.GetString(4), NullableInt(reader, 5), NullableInt(reader, 6)));
        }
        return (rows.ToArray(), playoffs.ToArray());
    }

    public async Task<(string ChampionshipId, string SeasonLabel)[]> StandingsListAsync(CancellationToken ct)
    {
        await using var command = dataSource.CreateCommand(
            "SELECT championship_id, season_label FROM standings ORDER BY season_label DESC, championship_id");
        await using var reader = await command.ExecuteReaderAsync(ct);
        var list = new List<(string, string)>();
        while (await reader.ReadAsync(ct))
            list.Add((reader.GetString(0), reader.GetString(1)));
        return list.ToArray();
    }

    // ── Reference data from Sanity ──────────────────────────────────────────

    /// <summary>
    /// Copies Sanity team profiles (slug, city, website, logo URL, aliases) onto team rows by name.
    /// Existing aliases are never reassigned to another team. Returns the number of teams written.
    /// </summary>
    public async Task<int> ImportTeamsAsync(JsonElement teams, CancellationToken ct)
    {
        var written = 0;
        foreach (var team in teams.EnumerateArray())
        {
            var name = team.TryGetProperty("name", out var n) && n.ValueKind == JsonValueKind.String ? n.GetString()!.Trim() : "";
            if (name.Length == 0) continue;

            await using var command = dataSource.CreateCommand("""
                INSERT INTO teams (name, source, city, website, logo_url) VALUES (@name, 'manual', @city, @website, @logo)
                ON CONFLICT (name) DO UPDATE SET
                    source = CASE WHEN teams.source IN ('import', 'scraper') THEN 'manual' ELSE teams.source END,
                    city = COALESCE(EXCLUDED.city, teams.city),
                    website = COALESCE(EXCLUDED.website, teams.website),
                    logo_url = COALESCE(EXCLUDED.logo_url, teams.logo_url)
                RETURNING id, slug
                """);
            command.Parameters.AddWithValue("name", name);
            command.Parameters.Add("city", NpgsqlDbType.Text).Value = Text(team, "city") ?? (object)DBNull.Value;
            command.Parameters.Add("website", NpgsqlDbType.Text).Value = Text(team, "website") ?? (object)DBNull.Value;
            command.Parameters.Add("logo", NpgsqlDbType.Text).Value = Text(team, "logoUrl") ?? (object)DBNull.Value;
            long id;
            string? slug;
            await using (var reader = await command.ExecuteReaderAsync(ct))
            {
                await reader.ReadAsync(ct);
                id = reader.GetInt64(0);
                slug = NullableString(reader, 1);
            }

            if (Text(team, "slug") is { } sanitySlug && sanitySlug != slug)
            {
                await using var setSlug = dataSource.CreateCommand("""
                    UPDATE teams SET slug = @slug WHERE id = @id AND NOT EXISTS (SELECT 1 FROM teams WHERE slug = @slug)
                    """);
                setSlug.Parameters.AddWithValue("slug", sanitySlug);
                setSlug.Parameters.AddWithValue("id", id);
                if (await setSlug.ExecuteNonQueryAsync(ct) == 0 && slug is null)
                    await AssignSlugAsync(id, name, ct);
            }
            else if (slug is null)
                await AssignSlugAsync(id, name, ct);

            if (team.TryGetProperty("aliases", out var aliases) && aliases.ValueKind == JsonValueKind.Array)
                foreach (var alias in aliases.EnumerateArray().Where(a => a.ValueKind == JsonValueKind.String))
                    await AddAliasAsync(alias.GetString()!, id, ct);
            written++;
        }
        return written;
    }

    public async Task<bool> AddAliasAsync(string alias, long teamId, CancellationToken ct)
    {
        var normalized = TeamNameResolver.Normalize(alias);
        if (normalized.Length == 0) return false;
        await using var command = dataSource.CreateCommand("""
            INSERT INTO team_aliases (alias, alias_normalized, team_id) VALUES (@alias, @normalized, @team)
            ON CONFLICT (alias_normalized) DO NOTHING
            """);
        command.Parameters.AddWithValue("alias", alias.Trim());
        command.Parameters.AddWithValue("normalized", normalized);
        command.Parameters.AddWithValue("team", teamId);
        return await command.ExecuteNonQueryAsync(ct) == 1;
    }

    // ── Scrape log ──────────────────────────────────────────────────────────

    public async Task<long> StartRunAsync(string kind, string trigger, object parameters, CancellationToken ct)
    {
        await using var command = dataSource.CreateCommand("""
            INSERT INTO scrape_runs (kind, trigger, parameters) VALUES (@kind, @trigger, @parameters) RETURNING id
            """);
        command.Parameters.AddWithValue("kind", kind);
        command.Parameters.AddWithValue("trigger", trigger);
        command.Parameters.AddWithValue("parameters", NpgsqlDbType.Jsonb, JsonSerializer.Serialize(parameters, JsonOptions));
        return (long)(await command.ExecuteScalarAsync(ct))!;
    }

    public async Task FinishRunAsync(long id, string status, object? summary, string? error, CancellationToken ct)
    {
        await using var command = dataSource.CreateCommand("""
            UPDATE scrape_runs SET finished_at = now(), status = @status, summary = @summary, error = @error WHERE id = @id
            """);
        command.Parameters.AddWithValue("id", id);
        command.Parameters.AddWithValue("status", status);
        command.Parameters.Add("summary", NpgsqlDbType.Jsonb).Value =
            summary is null ? DBNull.Value : JsonSerializer.Serialize(summary, JsonOptions);
        command.Parameters.Add("error", NpgsqlDbType.Text).Value = (object?)error ?? DBNull.Value;
        await command.ExecuteNonQueryAsync(CancellationToken.None);
    }

    internal static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private static string? Text(JsonElement element, string property) =>
        element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String &&
        value.GetString() is { Length: > 0 } text ? text.Trim() : null;

    private static int? NullableInt(NpgsqlDataReader reader, int ordinal) => reader.IsDBNull(ordinal) ? null : reader.GetInt32(ordinal);
    private static string? NullableString(NpgsqlDataReader reader, int ordinal) => reader.IsDBNull(ordinal) ? null : reader.GetString(ordinal);

    [GeneratedRegex("[^a-z0-9]+")]
    private static partial Regex NonSlug();
}
