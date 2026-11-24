using System.Text.Json;
using System.Text.RegularExpressions;
using Npgsql;
using NpgsqlTypes;

public sealed record TeamRef(long Id, string Name);

public sealed record FixtureUpsert(ScrapedFixture Fixture, TeamRef Home, TeamRef Away, int ClubId, int SeasonId, string? Venue);

/// <param name="Retired">Scraper rows of the page that this run no longer saw and that were retired.</param>
public sealed record UpsertCounts(int Inserted, int Updated, int Unchanged, int SkippedManualOverride, int Retired = 0)
{
    public static UpsertCounts operator +(UpsertCounts a, UpsertCounts b) =>
        new(a.Inserted + b.Inserted, a.Updated + b.Updated, a.Unchanged + b.Unchanged,
            a.SkippedManualOverride + b.SkippedManualOverride, a.Retired + b.Retired);
}

/// <summary>One rugbyfl.com club page (club and season) that was fetched and parsed successfully.</summary>
public sealed record ScrapedPage(int ClubId, int SeasonId);

public sealed record ChampionshipConfig(bool Active, string ChampionshipId, string SeasonLabel, string? DivisionName);

public sealed record StoredFixture(
    string Id, DateOnly Date, string HomeTeam, string AwayTeam, long HomeTeamId, long AwayTeamId,
    int? HomeScore, int? AwayScore, string Status, string? MatchType, string? Competition, string? Note,
    string? KickoffTime, string? Venue, bool ManualOverride);

/// <summary>Postgres reads and writes for the rugbyfl.com scraper (tables from sql/007_scraped_data.sql).</summary>
public sealed partial class ScrapeStore(NpgsqlDataSource dataSource)
{
    // Refreshes the stored payload of scraper rows. The public endpoints build it at read time
    // (FixtureDatabase.ScraperPayloadQuery); the stored copy is for SQL inspection and matches it.
    private const string RefreshPayloadSql =
        "UPDATE fixtures f SET payload = p.payload FROM (" + FixtureDatabase.ScraperPayloadQuery + """
        ) p WHERE p.id = f.sanity_id AND f.source = 'scraper'
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
    /// that the current run did not capture keeps its stored value. A retired row seen again is
    /// un-retired. Runs in one transaction.
    /// </summary>
    /// <param name="page">
    /// The page these fixtures came from, after a successful fetch and parse. Its other scraper rows
    /// (same club and season, not manual_override) that this run didn't see are retired in the same
    /// transaction: the game was rescheduled (new date, so a new key), a team was re-resolved (new key),
    /// or the game was removed. Null skips retirement. A page with no fixtures retires nothing: an empty
    /// parse more likely means the markup changed than that every game was removed.
    /// </param>
    public async Task<UpsertCounts> UpsertFixturesAsync(IReadOnlyList<FixtureUpsert> fixtures, DateTimeOffset scrapedAt,
        CancellationToken ct, ScrapedPage? page = null)
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
                    updated_at = EXCLUDED.updated_at,
                    retired_at = NULL
                WHERE NOT f.manual_override AND (
                    f.season, f.home_team_raw, f.away_team_raw, f.status, f.match_type, f.competition, f.note,
                    f.home_score, f.away_score, f.kickoff_time, f.venue, f.source_game_id, f.retired_at)
                    IS DISTINCT FROM (
                    EXCLUDED.season, EXCLUDED.home_team_raw, EXCLUDED.away_team_raw, EXCLUDED.status,
                    EXCLUDED.match_type, EXCLUDED.competition, EXCLUDED.note, EXCLUDED.home_score,
                    EXCLUDED.away_score, COALESCE(EXCLUDED.kickoff_time, f.kickoff_time),
                    COALESCE(EXCLUDED.venue, f.venue), COALESCE(EXCLUDED.source_game_id, f.source_game_id),
                    NULL::timestamptz)
                RETURNING sanity_id, (xmax = 0) AS inserted
                """, connection, transaction);
            var p = command.Parameters;
            // The id is used only for a new row. A row adopted from Sanity and then moved can still
            // hold the id derived from this key; take a free one rather than fail the whole batch.
            p.AddWithValue("id", await FreeFixtureIdAsync(connection, transaction,
                FixtureId(f.Date, item.Home.Id, item.Away.Id), f.Date, item.Home.Id, item.Away.Id, null, ct));
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

        if (page is { } scraped)
        {
            // Every row this run saw now has last_scraped_at = scrapedAt (inserted, updated, or touched as
            // unchanged). Locked rows (manual_override; every adopted row has it) are never retired.
            await using var retire = new NpgsqlCommand("""
                UPDATE fixtures SET retired_at = @scraped_at, updated_at = @scraped_at
                WHERE source = 'scraper' AND retired_at IS NULL AND NOT manual_override AND origin_sanity_id IS NULL
                  AND source_club_id = @club_id AND source_season_id = @season_id
                  AND (last_scraped_at IS NULL OR last_scraped_at < @scraped_at)
                """, connection, transaction);
            retire.Parameters.AddWithValue("scraped_at", scrapedAt);
            retire.Parameters.AddWithValue("club_id", scraped.ClubId);
            retire.Parameters.AddWithValue("season_id", scraped.SeasonId);
            counts += new UpsertCounts(0, 0, 0, 0, await retire.ExecuteNonQueryAsync(ct));
        }
        await transaction.CommitAsync(ct);
        return counts;
    }

    /// <summary>
    /// <paramref name="baseId"/>, or <c>{baseId}-2</c>, <c>-3</c> and so on when another row holds it.
    /// The row that already has this natural key (date, home, away) owns the id, and so does
    /// <paramref name="self"/> (a row being moved to this key).
    /// </summary>
    private static async Task<string> FreeFixtureIdAsync(NpgsqlConnection connection, NpgsqlTransaction transaction,
        string baseId, DateOnly date, long homeTeamId, long awayTeamId, string? self, CancellationToken ct)
    {
        for (var n = 1; ; n++)
        {
            var candidate = n == 1 ? baseId : $"{baseId}-{n}";
            await using var taken = new NpgsqlCommand("""
                SELECT EXISTS (SELECT 1 FROM fixtures WHERE sanity_id = @id
                    AND sanity_id IS DISTINCT FROM @self
                    AND NOT (source = 'scraper' AND fixture_date = @date
                             AND home_team_id = @home_id AND away_team_id = @away_id))
                """, connection, transaction);
            taken.Parameters.AddWithValue("id", candidate);
            taken.Parameters.Add("self", NpgsqlDbType.Text).Value = (object?)self ?? DBNull.Value;
            taken.Parameters.AddWithValue("date", date);
            taken.Parameters.AddWithValue("home_id", homeTeamId);
            taken.Parameters.AddWithValue("away_id", awayTeamId);
            if (!(bool)(await taken.ExecuteScalarAsync(ct))!)
                return candidate;
        }
    }

    /// <summary>
    /// Hides scraper fixtures that never happened: retires them and sets manual_override, so later
    /// scrapes neither update nor un-retire them. This is the API's equivalent of deleting the
    /// match doc in Sanity Studio. To bring one back, clear both columns.
    /// </summary>
    /// <returns>"id date home vs away" for each row found.</returns>
    public async Task<List<string>> HideFixturesAsync(IReadOnlyList<string> ids, CancellationToken ct)
    {
        await using var command = dataSource.CreateCommand("""
            UPDATE fixtures SET retired_at = COALESCE(retired_at, now()), manual_override = true, updated_at = now()
            WHERE source = 'scraper' AND sanity_id = ANY(@ids)
            RETURNING sanity_id, fixture_date, home_team_raw, away_team_raw
            """);
        command.Parameters.AddWithValue("ids", ids.ToArray());
        await using var reader = await command.ExecuteReaderAsync(ct);
        var lines = new List<string>();
        while (await reader.ReadAsync(ct))
            lines.Add($"{reader.GetString(0)} {reader.GetFieldValue<DateOnly>(1):yyyy-MM-dd} {reader.GetString(2)} vs {reader.GetString(3)}");
        lines.Sort(StringComparer.Ordinal);
        return lines;
    }

    /// <summary>Scraper rows that are not retired, for the Sanity comparison.</summary>
    public async Task<StoredFixture[]> ScrapedFixturesAsync(CancellationToken ct)
    {
        await using var command = dataSource.CreateCommand("""
            SELECT sanity_id, fixture_date, home_team_raw, away_team_raw, home_team_id, away_team_id,
                   home_score, away_score, status, match_type, competition, note,
                   to_char(kickoff_time, 'FMHH12:MI AM'), venue, manual_override
            FROM fixtures WHERE source = 'scraper' AND retired_at IS NULL ORDER BY fixture_date, sanity_id
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

    /// <summary>
    /// Writes Sanity hand edits onto scraper rows (see <see cref="SanityAdoption"/>), in one transaction.
    /// The row is found by (date, home team, away team), else by the Sanity document it was adopted
    /// from earlier (the document's date or teams changed, so the row moves), else it is inserted.
    /// Sanity's values win, except that a blank kickoff or venue keeps the stored one. Every adopted
    /// row gets manual_override, so later scrapes leave it alone. Rerunning changes nothing.
    /// </summary>
    public async Task<AdoptionOutcome[]> AdoptFixturesAsync(IReadOnlyList<AdoptionItem> items, CancellationToken ct)
    {
        var outcomes = new AdoptionOutcome[items.Count];
        if (items.Count == 0) return outcomes;

        await using var connection = await dataSource.OpenConnectionAsync(ct);
        await using var transaction = await connection.BeginTransactionAsync(ct);
        var ids = new List<string>();
        for (var i = 0; i < items.Count; i++)
        {
            var (c, home, away) = (items[i].Candidate, items[i].Home, items[i].Away);
            void Bind(NpgsqlParameterCollection p)
            {
                p.AddWithValue("date", c.Date);
                p.AddWithValue("season", c.Season);
                p.AddWithValue("home", home.Name);
                p.AddWithValue("away", away.Name);
                p.AddWithValue("home_id", home.Id);
                p.AddWithValue("away_id", away.Id);
                p.AddWithValue("home_raw", TeamNameResolver.DisplayName(c.HomeTeam));
                p.AddWithValue("away_raw", TeamNameResolver.DisplayName(c.AwayTeam));
                p.AddWithValue("status", c.Status);
                p.Add("match_type", NpgsqlDbType.Text).Value = (object?)c.MatchType ?? DBNull.Value;
                p.Add("competition", NpgsqlDbType.Text).Value = (object?)c.Competition ?? DBNull.Value;
                p.Add("note", NpgsqlDbType.Text).Value = (object?)c.Note ?? DBNull.Value;
                p.Add("home_score", NpgsqlDbType.Integer).Value = c.HomeScore is { } hs ? hs : DBNull.Value;
                p.Add("away_score", NpgsqlDbType.Integer).Value = c.AwayScore is { } @as ? @as : DBNull.Value;
                p.Add("kickoff", NpgsqlDbType.Time).Value = c.Kickoff is { } kickoff ? kickoff : DBNull.Value;
                p.Add("venue", NpgsqlDbType.Text).Value = (object?)c.Venue ?? DBNull.Value;
                p.AddWithValue("origin", c.SanityId);
            }

            string? existing;
            bool moved = false;
            await using (var find = new NpgsqlCommand("""
                SELECT sanity_id FROM fixtures
                WHERE source = 'scraper' AND fixture_date = @date AND home_team_id = @home_id AND away_team_id = @away_id
                """, connection, transaction))
            {
                find.Parameters.AddWithValue("date", c.Date);
                find.Parameters.AddWithValue("home_id", home.Id);
                find.Parameters.AddWithValue("away_id", away.Id);
                existing = (string?)await find.ExecuteScalarAsync(ct);
            }
            if (existing is null)
            {
                await using var byOrigin = new NpgsqlCommand("""
                    SELECT sanity_id FROM fixtures WHERE source = 'scraper' AND origin_sanity_id = @origin
                    ORDER BY sanity_id LIMIT 1
                    """, connection, transaction);
                byOrigin.Parameters.AddWithValue("origin", c.SanityId);
                existing = (string?)await byOrigin.ExecuteScalarAsync(ct);
                moved = existing is not null;
            }

            if (existing is null)
            {
                var id = await FreeFixtureIdAsync(connection, transaction, FixtureId(c.Date, home.Id, away.Id),
                    c.Date, home.Id, away.Id, null, ct);
                await using var insert = new NpgsqlCommand("""
                    INSERT INTO fixtures (
                        sanity_id, source, fixture_date, season, home_team, away_team, home_team_id, away_team_id,
                        home_team_raw, away_team_raw, status, match_type, competition, note, home_score, away_score,
                        kickoff_time, venue, manual_override, origin_sanity_id, updated_at, payload)
                    VALUES (
                        @id, 'scraper', @date, @season, @home, @away, @home_id, @away_id,
                        @home_raw, @away_raw, @status, @match_type, @competition, @note, @home_score, @away_score,
                        @kickoff, @venue, true, @origin, now(), '{}'::jsonb)
                    """, connection, transaction);
                insert.Parameters.AddWithValue("id", id);
                Bind(insert.Parameters);
                await insert.ExecuteNonQueryAsync(ct);
                ids.Add(id);
                outcomes[i] = AdoptionOutcome.Adopted;
                continue;
            }

            // A moved row takes the document's date, teams and names, and a fresh id derived from its new
            // key (origin_sanity_id still links it to the document). Keeping the old rfl-{oldDate}-... id
            // would make a later scrape of the old key collide with it on the primary key.
            // Otherwise the scraped names and the id stay. Adopting also un-retires the row.
            var newId = moved
                ? await FreeFixtureIdAsync(connection, transaction, FixtureId(c.Date, home.Id, away.Id),
                    c.Date, home.Id, away.Id, existing, ct)
                : existing;
            await using var update = new NpgsqlCommand("""
                UPDATE fixtures f SET
                    sanity_id = @new_id, retired_at = NULL,
                    fixture_date = @date, home_team = @home, away_team = @away, home_team_id = @home_id, away_team_id = @away_id,
                    home_team_raw = CASE WHEN @moved THEN @home_raw ELSE f.home_team_raw END,
                    away_team_raw = CASE WHEN @moved THEN @away_raw ELSE f.away_team_raw END,
                    season = @season, status = @status, match_type = @match_type, competition = @competition, note = @note,
                    home_score = @home_score, away_score = @away_score,
                    kickoff_time = COALESCE(@kickoff, f.kickoff_time), venue = COALESCE(@venue, f.venue),
                    manual_override = true, origin_sanity_id = @origin, updated_at = now()
                WHERE f.sanity_id = @id AND (
                    f.fixture_date, f.home_team_id, f.away_team_id, f.season, f.status, f.match_type, f.competition, f.note,
                    f.home_score, f.away_score, f.kickoff_time, f.venue, f.manual_override, f.origin_sanity_id,
                    f.sanity_id, f.retired_at)
                    IS DISTINCT FROM (
                    @date, @home_id, @away_id, @season, @status, @match_type, @competition, @note,
                    @home_score, @away_score, COALESCE(@kickoff, f.kickoff_time), COALESCE(@venue, f.venue), true, @origin,
                    @new_id, NULL::timestamptz)
                """, connection, transaction);
            update.Parameters.AddWithValue("id", existing);
            update.Parameters.AddWithValue("new_id", newId);
            update.Parameters.AddWithValue("moved", moved);
            Bind(update.Parameters);
            if (await update.ExecuteNonQueryAsync(ct) == 1)
            {
                ids.Add(newId);
                outcomes[i] = AdoptionOutcome.Updated;
            }
            else
                outcomes[i] = AdoptionOutcome.Unchanged;
        }

        if (ids.Count > 0)
        {
            await using var refresh = new NpgsqlCommand(RefreshPayloadSql + " AND f.sanity_id = ANY(@ids)", connection, transaction);
            refresh.Parameters.AddWithValue("ids", ids.ToArray());
            await refresh.ExecuteNonQueryAsync(ct);
        }
        await transaction.CommitAsync(ct);
        return outcomes;
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
