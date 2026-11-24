# Claymores API

A standalone ASP.NET Core 10 API for the Claymores site and Flutter app. It exposes public fixtures, standings, teams, players, and practice data and validates bearer access tokens for protected routes. The website is the first integration target. Local website integration is in the separate `codex/claymores-api-integration` worktree. The production website and Flutter app have yet to switch.

With no database connection configured, fixture endpoints read published fixtures from Sanity. Once Postgres is configured and seeded, fixture endpoints read from Postgres. Standings, teams, players, and practice data come from Sanity in both modes. The importer reads Sanity and writes to Postgres.

## Handoff

The website is the first integration target. The local branch `codex/claymores-api-integration` is at `b96e2d9` in the `work/claymores-website-api` worktree and has no remote tracking branch. Desktop and mobile Playwright checks passed. The API source is in `api/` and the Flutter source is in `mobile/` in this repository, on the same branch as the website integration. The branch has not been pushed.

| Local surface | URL |
| --- | --- |
| API-backed website | [Website preview](http://127.0.0.1:5300) |
| API-backed Flutter web build | [Flutter preview](http://127.0.0.1:8766) |
| API explorer | [Swagger](http://localhost:5294/swagger) |

Resume with one invited player and one admin signing in through the development Google OAuth client. Use the prepared local Postgres preview, assign $100.00 in dues, then complete a $25.00 Stripe sandbox payment and confirm $75.00 remains after the webhook. Google redirect and role checks, the treasurer UI, and the Stripe flow with a simulated provider passed locally. Real Google account sign-in and a payment through the Stripe sandbox are pending. Keep OAuth and payment credentials in local secrets.

Production still reads Sanity. Keep source documents and assets in place while the website and API depend on them. No push, deployment, live charge, or Sanity deletion is part of this handoff.

## Run locally

Install the [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0). The API project is in [`src/Claymores.Api`](src/Claymores.Api) and its tests are in [`tests/Claymores.Api.Tests`](tests/Claymores.Api.Tests). From `src/Claymores.Api`, run:

```sh
dotnet --version
dotnet restore
dotnet run --launch-profile http
```

The HTTP profile starts in Development at `http://localhost:5294`. A first run needs internet access to restore packages and query the published Sanity dataset.

- [Swagger UI](http://localhost:5294/swagger)
- [OpenAPI JSON](http://localhost:5294/swagger/v1/swagger.json)
- [Health check](http://localhost:5294/health)

Swagger is enabled by default in Development. To expose it in another environment, set `Swagger__Enabled=true`.

## Endpoints

| Method and path | Access | Response |
| --- | --- | --- |
| `GET /health` | Public | `200` and `{"status":"ok"}` when the API process is running |
| `GET /health/ready` | Public | `200` when Postgres is reachable and fully migrated (or not configured). `503` otherwise. Render uses this as the health check. |
| `GET /v1/fixtures` | Public | `200` and an array sorted by date and ID. Add `?season=2027` to filter by fixture year. |
| `GET /v1/fixtures/{id}` | Public | `200` and the fixture object, or `404` for an unknown ID. Copy an `id` from the list. |
| `GET /v1/standings` | Public | `200` and the current standings document. Add `?season=2025-2026` to request a specific season. Returns `404` when no standings match. |
| `GET /v1/standings/seasons` | Public | `200` and an array of season summaries for the standings index. |
| `GET /v1/teams` | Public | `200` and an array of published teams. |
| `GET /v1/players` | Public | `200` and an array of published active player profiles ordered by name. |
| `GET /v1/players/{slug}` | Public | `200` and the active player profile, or `404` for an unknown or inactive profile. |
| `GET /v1/practices` | Public | `200` and an array of published practice and event records. |
| `GET /v1/practices/schedule` | Public | `200` and the practice schedule, or `404` when no schedule is published. |
| `GET /v1/me` | Bearer token | `200` and `{"subject","name","email","role"}` from the token, or `401` for a missing or invalid token. `role` is set for tokens from [mobile sign-in](#mobile-sign-in). |
| `POST /v1/internal/scrape/{fixtures\|standings}` | `Scraper:Secret` bearer | Runs the rugbyfl.com scraper. See [Scraper](#scraper). `404` unless the secret and Postgres are configured. Not in Swagger. |

Fixture filters take a numeric year from 1900 through 2200. Standings filters take a season label in `YYYY-YYYY` format. Invalid filters return `400`. A successful fixture list with no matches returns `[]`. Health reports process liveness. To verify the data path, request fixtures or standings as well.

```sh
curl -fsS 'http://localhost:5294/v1/fixtures?season=2027'
curl -fsS 'http://localhost:5294/v1/standings'
curl -fsS 'http://localhost:5294/v1/standings?season=2025-2026'
curl -fsS 'http://localhost:5294/v1/standings/seasons'
curl -fsS 'http://localhost:5294/v1/teams'
curl -fsS 'http://localhost:5294/v1/players'
curl -fsS 'http://localhost:5294/v1/practices'
curl -i 'http://localhost:5294/v1/practices/schedule'
curl -i 'http://localhost:5294/v1/me'
```

## Google sign-in for players and admins

Both roles start at the same Google sign-in URL. The API checks the verified Google email against the configured club invitations and assigns either `player` or `admin`. The roster remains public and does not grant access. These configuration lists are for the initial preview, before invitation management moves into Postgres.

1. In Google Cloud, make a separate **Web application** OAuth client for local development. Register `https://localhost:7057/signin-google` as its authorized redirect URI. If the Google consent screen is in testing, add the test accounts there too.
2. Set the client ID and client secret in .NET user secrets. Add the invited emails in the matching role list. The admin list takes precedence if an email is on both lists.

   ```sh
   dotnet user-secrets init
   dotnet user-secrets set 'Authentication:Google:ClientId' '<client ID>'
   printf 'Google client secret: '
   read -rs CLAYMORES_GOOGLE_SECRET
   printf '\n'
   dotnet user-secrets set 'Authentication:Google:ClientSecret' "$CLAYMORES_GOOGLE_SECRET"
   unset CLAYMORES_GOOGLE_SECRET
   dotnet user-secrets set 'Authentication:Google:AdminEmails:0' '<admin Google email>'
   dotnet user-secrets set 'Authentication:Google:PlayerEmails:0' '<player Google email>'
   dotnet dev-certs https --trust
   dotnet run --launch-profile https
   ```

3. Open [Google sign-in](https://localhost:7057/auth/google) directly in your browser. It redirects back to `/auth/account`, where you can see your role and sign out. The JSON session check is at `/auth/session`. Use an incognito window to test the second account, and verify that a Google account outside both lists gets `403`. Use Swagger separately to explore the public API.
4. To test from the website, start the local integration branch with `CLAYMORES_GOOGLE_SIGN_IN_ORIGIN=https://localhost:7057` alongside the site variables below. Open `/sign-in` and select **Continue with Google**. The website entry is available only with an HTTPS auth origin and is disabled on Vercel Production.

### Invite members

Who can sign in is stored in the `club_invitations` table. The `AdminEmails` and `PlayerEmails` settings still work and are meant for bootstrapping: set one admin email there, then invite everyone else. An admin role from either source wins. Role changes take effect within 30 seconds, including for members who are already signed in.

- From the command line, with the database configured: `dotnet run -- --invite player@example.com player` (or `admin`).
- Through the API, signed in as an admin on the API origin:

  | Method and path | Behavior |
  | --- | --- |
  | `GET /v1/admin/invitations` | Lists invited emails and roles |
  | `PUT /v1/admin/invitations/{email}` with `{"role":"player"}` or `{"role":"admin"}` | Invites a member or changes their role |
  | `DELETE /v1/admin/invitations/{email}` | Removes an invitation. Admins can't remove or demote themselves. |

  The `PUT` and `DELETE` requests require the same-origin browser session, like the other admin writes.

The website entry hands off to the API-hosted account page. The Flutter app uses [mobile sign-in](#mobile-sign-in) instead. Keep local OAuth client settings separate from any future preview or production settings.

## Mobile sign-in

The Flutter app signs in with native Google sign-in, then trades the Google ID token for API tokens. The same invitations decide who gets in and with which role. Set `MobileAuth:Enabled=true`; it requires Google sign-in and Postgres to be configured, and the refresh tokens live in `mobile_refresh_tokens` (migration `008`).

| Method and path | Body | Response |
| --- | --- | --- |
| `POST /v1/auth/mobile/google` | `{"idToken":"<Google ID token>"}` | `200` with tokens (below). `401 {"error":"invalid_token"}` for a bad, expired, wrong-audience, or unverified-email token. `403 {"error":"not_invited"}` when the email isn't invited. |
| `POST /v1/auth/mobile/refresh` | `{"refreshToken":"..."}` | `200` with new tokens. The old refresh token stops working. `401` for an unknown, expired, or revoked token. `403 {"error":"not_invited"}` if the invitation was removed (the session is revoked). |
| `POST /v1/auth/mobile/logout` | `{"refreshToken":"..."}` | `204`. Revokes that sign-in session. |

```json
{
  "accessToken": "<JWT>",
  "accessTokenExpiresAt": "2026-11-24T18:00:00+00:00",
  "refreshToken": "<43 characters>",
  "user": { "subject": "<Google subject>", "name": "Pat Player", "email": "pat@example.com", "role": "player" }
}
```

- **Access tokens** are JWTs signed by the API (HS256 with `Authentication:Tokens:SigningKey`, issuer and audience `claymores-api`), valid for one hour. Send them as `Authorization: Bearer <token>` to `/v1/me`, `/v1/dues/mine`, `/v1/dues/mine/{id}`, and `/v1/dues/{id}/checkout-session`. The invitation is re-checked on every request, so removing or changing an invitation takes effect within 30 seconds. Admin writes still require the same-origin browser session.
- **Refresh tokens** last 60 days and rotate on every refresh. Only a SHA-256 hash is stored. Presenting a token that was already rotated or revoked revokes every token in that sign-in session, so the app must store the newest refresh token before using it, and must not refresh twice in parallel.
- **Signing key:** base64 for at least 32 random bytes, for example `openssl rand -base64 32`. The API refuses to start with mobile sign-in on and no valid key. Changing the key invalidates current access tokens at once; the app recovers by refreshing.

### Google Cloud setup

In the same Google Cloud project as the web client:

1. Create an **iOS** OAuth client with the app's bundle ID. Put its client ID in the Flutter app (and the reversed client ID URL scheme in `Info.plist`).
2. Create an **Android** OAuth client with the package name and the SHA-1 of each signing certificate (debug, upload, and Play app signing).
3. Native Google sign-in on Android asks for an ID token for a *server* client ID. Use the existing **Web application** client ID for that (`serverClientId` in `google_sign_in`).
4. List every client ID that can appear as a token's audience in `Authentication:Google:MobileClientIds` (`Authentication__Google__MobileClientIds__0`, `__1`, and so on): at least the iOS client ID. The web `Authentication:Google:ClientId` is always accepted, which covers Android tokens minted for the server client ID.

The API checks each ID token's signature against Google's published keys, its issuer (`https://accounts.google.com` or `accounts.google.com`), its audience, its expiry, and `email_verified`.

### App checkout and the `claymores://` link

With checkout and mobile sign-in both enabled, `POST /v1/dues/{id}/checkout-session` with `{"amountCents":2500}` returns `{"url":"https://checkout.stripe.com/..."}`. Open that URL in the browser. Stripe sends the player back to `Stripe:AppReturnUrl` with `?checkout=returned` or `?checkout=cancelled`, for example `claymores://dues?checkout=returned`. Register the `claymores` scheme in the app (iOS `CFBundleURLTypes`, Android intent filter) and refresh dues when it opens. The balance changes only after Stripe's signed webhook arrives, never because of the return link.

`Stripe:AppReturnUrl` is required when both features are on. It must be a custom scheme or HTTPS URL without a query. The amount must be from 50 to 99,999,999 cents and no more than the remaining balance (`409`). Another member's assessment is `404`. If the assessment already has a pending checkout, its session is resumed with the original amount, the same as the browser form. A browser session cookie may call this endpoint only from the same origin (`Sec-Fetch-Site: same-origin`).

These routes are outside the public CORS policy. Native apps don't need CORS. If the Flutter web build ever uses them, give its exact origin a separate CORS policy for these routes instead of adding it to `Cors:PublicOrigins`.

In the Codex workspace, `work/postgres-check/local-preview.mjs` starts an embedded local Postgres, builds `src/Claymores.Api`, imports fixtures (which also migrates), and starts the HTTPS Google and dues preview at `https://localhost:7057`.

## Test authentication locally

From a second terminal in the project directory, create a one-hour Development token with the .NET SDK:

```sh
CLAYMORES_DEV_JWT="$(dotnet user-jwts create --name claymores-demo --audience http://localhost:5294 --valid-for 1h --output token)"
```

The SDK may add a user-secrets ID and Development settings to your checkout. Signing keys are stored in local user secrets. Restart the Development API after creating the first token so it loads these settings. Then send the token in the `Authorization` header from the second terminal:

```sh
curl -i -H "Authorization: Bearer $CLAYMORES_DEV_JWT" 'http://localhost:5294/v1/me'
unset CLAYMORES_DEV_JWT
```

You can also select **Authorize** in Swagger, paste the access token by itself, and use **Try it out** on `GET /v1/me`.

For hosted authentication, configure both environment variables:

| Variable | Value |
| --- | --- |
| `Authentication__Authority` | HTTPS OIDC authority from your identity provider |
| `Authentication__Audience` | Audience registered for the Claymores API |

The API validates access tokens issued for that audience. Hosted sign-in still requires selecting an identity provider and configuring clients to obtain its access tokens. The API currently serves data and validates tokens. The provider handles sign-in, registration, and token issuance.

## Migrate and import fixtures into Postgres

Migrations run automatically. On startup, the API applies every script in [`src/Claymores.Api/sql`](src/Claymores.Api/sql) that the database hasn't recorded yet, in name order, each in its own transaction, and records it in `schema_migrations`. A Postgres advisory lock keeps two instances from migrating at once. The scripts are idempotent, so databases set up by hand before the runner existed migrate cleanly. Set `Database__MigrateOnStartup=false` to turn this off, and run `dotnet run -- --migrate` to migrate without starting the server. To change the schema, add a new numbered script; don't edit one that has already been applied.

1. Create a development database in Neon or another Postgres instance.
2. In the terminal where you run the API, set `ConnectionStrings__Claymores` to an Npgsql connection string, or set `DATABASE_URL` to a `postgres://` URL as Render and Neon provide it. `ConnectionStrings__Claymores` wins if both are set. An Npgsql connection string has this shape:

   ```text
   Host=<host>;Port=5432;Database=<database>;Username=<user>;Password=<password>;SSL Mode=Require
   ```

   Store the real value in development secrets or your hosting platform's secret settings. To give it to the current terminal session without putting the value into shell history, use:

   ```sh
   printf 'Paste the Npgsql connection string: '
   read -rs ConnectionStrings__Claymores
   printf '\n'
   export ConnectionStrings__Claymores
   ```

3. Import the published Sanity fixtures. This applies any pending migrations first. Run the same command again to check repeatability.

   ```sh
   dotnet run -- --import-fixtures
   dotnet run -- --import-fixtures
   ```

   Both runs report how many fixtures they processed. The importer uses the Sanity document ID as the fixture primary key and updates existing rows on conflict. It preserves rows absent from a later import. The import runs in a transaction. Rerun it when Sanity changes or when the API imports additional fixture fields.

4. In the SQL editor, verify the row counts and check that no Sanity ID appears more than once:

   ```sql
   SELECT count(*) AS fixtures, count(DISTINCT sanity_id) AS unique_fixtures
   FROM fixtures;

   SELECT count(*) AS teams FROM teams;
   ```

   The initial verification returned 63 fixtures after both imports. Subsequent totals can grow as fixtures are published in Sanity.

5. From the same terminal, run `dotnet run --launch-profile http` and try the fixture endpoints again. The configured API reads fixtures from Postgres, so import before starting it in this mode. To switch back to Sanity-backed fixture reads, unset `ConnectionStrings__Claymores` and restart the API.

## Scraper

The API can scrape rugbyfl.com into Postgres. It ports the website's `app/api/scrape-rugby` and `app/api/scrape-standings` routes, which write to Sanity. Both run side by side until cutover. The Vercel crons stay as they are.

**Shadow mode.** Scraped fixtures are stored with `source = 'scraper'`. `GET /v1/fixtures` serves only `source = 'sanity'` rows, which `--import-fixtures` writes, until you set `Fixtures__Source=scraper`. Standings endpoints still read Sanity. Scraped standings are stored in Postgres, and no endpoint serves them yet.

### Run it

| Command | What it does |
| --- | --- |
| `dotnet run -- --scrape-fixtures` | Club 117, season ID 28 (`Scraper:DefaultSeasonId`). Also opens each game's detail page to read the venue. |
| `dotnet run -- --scrape-fixtures --season-id 27` | One earlier season |
| `dotnet run -- --scrape-fixtures --all` | Clubs 117 and 51 (IR/Claymores), season IDs 10 through 28. Skips venue lookups. Venues already stored are kept. |
| `dotnet run -- --scrape-standings [--force]` | Scrapes the championship in `championship_config`. `--force` runs even when `active` is false. |
| `dotnet run -- --scrape-standings --championship-id 162 --season-label 2023-2024 [--division-name ...]` | Backfills one championship without stamping `championship_config` |
| `dotnet run -- --import-reference-data` | Copies Sanity team profiles to Postgres (slug, city, website, logo URL, aliases) and copies the `leagueChampionship` singleton to `championship_config`. It never writes to Sanity. |
| `dotnet run -- --compare-with-sanity` | Reports differences between scraped Postgres data and Sanity. See [Cutover](#cutover). |

Each command applies pending migrations first, then prints a JSON summary. A run where every page fails exits with code 1. Every run is logged in `scrape_runs` with its kind, trigger, parameters, status, summary, and error.

**HTTP trigger.** `POST /v1/internal/scrape/fixtures?seasonId=28&all=true` and `POST /v1/internal/scrape/standings?force=true&championshipId=…&seasonLabel=…&divisionName=…` take the same options. Send `Authorization: Bearer <Scraper__Secret>`. The token is compared in constant time. Without a configured secret or Postgres, the route returns `404`. It returns `401` for a wrong token, `400` for invalid options, and `502` when every fetch failed.

**Schedule.** `render.yaml` defines two Render cron jobs. Both use the API's Dockerfile and `DATABASE_URL`:

- `claymores-scrape-fixtures` runs `--scrape-fixtures` at `0 3 * * 1` (Mondays 03:00 UTC).
- `claymores-scrape-standings` runs `--scrape-standings` at `0 11 * * 1` (Mondays 11:00 UTC).

Running the CLI in a cron container is simpler than calling the endpoint. It shares no secret, doesn't depend on the web service being awake, and has no request timeout. The endpoint is for manual or external triggers.

### Rules

These carry over unchanged from the website scraper:

- **Source pages:** `https://rugbyfl.com/Clubs/Club.asp?Club_ID={club}&Season_ID={season}` for fixtures and `…/Season/Championships/Championship_Print.asp?Championship_ID={id}` for standings, both fetched with the `ClaymoresScraper/1.0` user agent.
- **Fixture markup:** walk `td.SectionTitleSec` (date, such as "Saturday, September 20, 2025"), `td.TableRowBig` (competition, from `a font`) and `td.TeamGame` (needs two links) in document order. The first team is home, and the first score is the home score. Scores are `font[color="#FF0000"] strong`. The note is the `.TableRowNoLine` text in the next row. Like Sanity, it includes the "Note:" label.
- **Claymores detection:** `/claymore/i`. That side becomes "Claymores", so "IR/Claymores" and "Claymores (D3)" both become "Claymores". The opponent is stored raw. Only games involving Claymores are kept.
- **Status:** fewer than two scores is `upcoming`. A note containing "forfeit" is `forfeit_us` if it matches `/claymore.{0,15}forfeit|forfeit.{0,10}by.{0,10}claymore/i`, otherwise `forfeit_them`. Anything else is `played`. A forfeit score is forced to 20–0 for the side that did not forfeit. Upcoming games store 0–0, as in Sanity.
- **Season:** the closing year. Games in August or later count toward the next year.
- **Match type:** `/friendl/i` on the competition is `friendly`, otherwise `league`.
- **Standings table:** the first table whose first row mentions pos, pool, team, played, and total. Rows need at least 19 direct cells and a `Team.asp` link in cell 2. Cells used: 1 pool, 3–6 P/W/L/D, 11–13 PF/PA/difference, 17 bonus, 18 total.
- **Fallback from the schedule** when no standings are published (header has date, home, tries, away and two "bp" columns; rows need 14 cells; "(31)" is a played score). Skip cancelled games (note matches `/game not played/i`, or starts with "cancel(l)ed" and doesn't mention a forfeit), playoff games, and unplayed games. A win is 4 points and a draw is 2. A team earns +1 for four or more tries and +1 for losing by seven or fewer. Forfeits earn no bonus points.
- **Ranking:** total points descending, then points difference descending, then team name. Positions are numbered from 1.
- **Playoffs:** any non-cancelled schedule game whose note matches semi-final, quarter-final, state final, gulf coast, super regional, cup/grand/championship/clubs final, playoff, or 3rd/third place. Each is classified as quarter, semi, third, then final, in that order. "QF1" is not a keyword, as before.
- **Championship config:** `active` is the off-season switch. A scrape records `last_scraped_at` and `last_scrape_status`, which is "success", "success (computed from schedule)", "HTTP n", "fetch error: …", "parsed 0 rows — page structure may have changed", or "write error: …". Backfills with an explicit championship don't stamp it. Each scrape replaces that championship's standings and playoffs.

These are fixed compared with the website scraper:

1. **Dedupe** uses the natural key (date, home team, away team) after name resolution, enforced by the partial unique index `fixtures_scraper_natural_key`. Two games on the same day are both kept. The website matched on date alone. The same game listed under clubs 117 and 51 is stored once. Scraped rows have the ID `rfl-{date}-{homeTeamId}-{awayTeamId}`.
2. **Re-scrapes update** scores, status, note, competition, match type, kickoff, and venue on existing rows, unless `manual_override` is true. An unchanged row only has `last_scraped_at` touched. A kickoff or venue that a run didn't capture keeps its stored value.
3. **Kickoff and venue** are captured. Kickoff comes from the `TableRowBig` time ("1:00 PM", stored as `time`). Venue comes from the "Field:" line and street address on each game's `Game_Detail.asp` page. "Pending", "TBD", and missing fields stay null.
4. **One name resolver** (`TeamNameResolver`) replaces the four normalizers in the website:
   - **Normalize:** lowercase, then strip parentheticals, a leading "IR/", "F.C.", "RFC", "FC", "Rugby Football Club", "Rugby Club", "Rugby", trailing D1–D4 tokens, and trailing season years such as "Orlando Otters 2026", which appears on rugbyfl.com. Collapse punctuation.
   - **Resolve:** Claymores detection, then exact normalized team name, then exact normalized alias (`team_aliases`), then a guarded fuzzy match. The fuzzy match requires that every token of exactly one team's name or alias appear in the input. It is rejected if the input adds a side marker, such as B, II, 2nds, reserves, women, or youth, so a B side joins its club only through an alias.
   - **Unresolved names** create a team with `source = 'scraper'` and `needs_review = true`. Raw names written by `--import-fixtures` (`source = 'import'`) are never matched against. They are promoted instead of duplicated.
   - **Aliases:** the seed comes from `scripts/add-team-aliases.ts` in migration 007. Add aliases with `INSERT INTO team_aliases (alias, alias_normalized, team_id)`. Use the normalized form, for example "fsu b".

The standings header check also differs. The website looked for "total points", but the cell is "Total<br>Points". It matched only because the page footer happens to contain "Total Points". The API checks for "total".

**Tables (migration 007).** `teams` gains `id`, `slug`, `city`, `website`, `logo_url`, `needs_review`, and `source`. `team_aliases` is new. `fixtures` gains `source`, `home_team_id`/`away_team_id`, `*_raw` display names, `status`, `match_type`, `competition`, `note`, `home_score`/`away_score`, `kickoff_time`, `venue`, `manual_override`, `source_club_id`/`source_season_id`/`source_game_id`, `first_scraped_at`/`last_scraped_at`, and `updated_at`. `payload` is rebuilt from these columns in the shape `GET /v1/fixtures` returns. New tables are `championship_config`, a singleton seeded with Sanity's schema defaults, plus `standings`, `standings_rows`, `standings_playoffs` (keyed by championship ID, with a season label), and `scrape_runs`.

**Review queues:**

```sql
SELECT id, name, slug FROM teams WHERE needs_review ORDER BY created_at;   -- add an alias or merge
SELECT * FROM scrape_runs ORDER BY started_at DESC LIMIT 20;
```

### Cutover

1. Run `--import-reference-data` once so logos, slugs, aliases, and the current championship come from Sanity. Then run `--scrape-fixtures --all` and `--scrape-fixtures` (to add venues), plus `--scrape-standings` and the standings backfills you need.
2. Run `--compare-with-sanity`. It matches games on (date, home, away) after resolution and lists games only in Sanity, games only in Postgres, field differences, and duplicate Sanity documents for one game. Standings rows are compared by team, and playoff lists are compared too. A kickoff time or venue that Sanity leaves blank is counted as enrichment, not as a difference.
3. Review each difference. Sanity edits made by hand show up as differences, such as a status changed to `cancelled` or a renamed competition. Set `manual_override = true` on those rows after copying the values, or the next scrape replaces them. Resolve teams in `needs_review`.
4. Set `Fixtures__Source=scraper` on the web service to serve scraped fixtures, then turn off the Vercel crons. Standings endpoints need a Postgres read path before they can switch.

## Player dues

The dues ledger records USD amounts in integer cents. An admin assigns the amount due and records payments the club has already received. The signed-in account page shows the player’s own amount due, total paid, and remaining balance. The dues detail endpoint also shows their payment history. The ledger does not charge cards.

For local testing, configure Google sign-in and a development Postgres database, then start the HTTPS API with `Dues__Enabled=true`. The dues tables are created by the automatic migrations. Dues routes appear in Swagger when that flag is enabled and Google and Postgres are configured.

| Method and path | Access | Behavior |
| --- | --- | --- |
| `GET /v1/dues/mine` | Player or admin | Lists the signed-in member's assessments |
| `GET /v1/dues/mine/{id}` | Player or admin | Shows payment history for an assessment belonging to the signed-in member |
| `POST /v1/dues/{id}/checkout-session` | Player or admin | Returns a Stripe test checkout URL for the app. See [App checkout](#app-checkout-and-the-claymores-link). |

Member routes accept the browser session cookie or, with mobile sign-in on, an API bearer token.
| `GET /v1/admin/dues` | Admin | Lists club dues and balances |
| `GET /v1/admin/dues/{id}` | Admin | Shows a specific assessment and its payment history |
| `POST /v1/admin/dues` | Admin | Assigns an assessment to a member's Google subject |
| `POST /v1/admin/dues/{id}/payments` | Admin | Records an already-received payment, including a partial payment |

Sign in once with the invited player’s Google account. The treasurer can then sign in with an admin account, open **Manage dues** from the account page, and pick that player by name or email. The page supports assigning dues, entering payments already received, and opening a history with the recorded time in Eastern Time. Take care when recording a payment received earlier. The timestamp is when the entry was recorded.

Sign in on the HTTPS API origin before using the dues endpoints in that origin's Swagger UI. For an API assignment, the member's Google subject is available from their authenticated `/auth/session` response and is passed as `playerSubject`.

An example assessment body for $100.00 is:

```json
{
  "id": "c5538aa3-989d-439b-b3e8-f21d85369f06",
  "playerSubject": "<signed-in Google subject>",
  "description": "Season dues",
  "amountCents": 10000,
  "dueDate": "2027-01-31"
}
```

A $25.00 payment body looks like this:

```json
{
  "id": "461861c5-ec1f-4463-adc6-e35e16453346",
  "amountCents": 2500
}
```

Generate a new UUID for each new assessment or payment. Reuse the original UUID and identical body when retrying an uncertain response. The ledger records the payment once and rejects a payment that exceeds the remaining balance. Admin writes require the same-origin browser session.

### Stripe test checkout

The account page lets a player choose a partial or full USD amount and opens Stripe-hosted checkout. This integration accepts only test-mode credentials. Keep actual money out of this setup.

1. Enable Google sign-in, Postgres, and dues. Use a dedicated Stripe sandbox and its test secret key.
2. Forward `checkout.session.completed` and `checkout.session.expired` to `https://localhost:7057/v1/webhooks/stripe` with the Stripe CLI. Set the webhook event API version to `2026-11-18.endive` to match the pinned Stripe SDK.

   ```sh
   stripe listen --events checkout.session.completed,checkout.session.expired \
     --forward-to https://localhost:7057/v1/webhooks/stripe
   ```

3. Configure `Stripe:CheckoutEnabled=true`, `Stripe:SecretKey` with the sandbox `sk_test_` key, `Stripe:WebhookSecret` with the listener's `whsec_` secret, and `Stripe:ReturnOrigin=https://localhost:7057`. Use .NET user secrets or your local secret store. Start the HTTPS profile.
4. Assign $100.00 to an invited player, sign in as that player, enter $25.00, and complete a Stripe test card payment. After the signed webhook is delivered, reload the account page and verify $25.00 paid and $75.00 remaining. Cancel another checkout and verify that the account can resume it.

The player can resume one pending checkout per assessment. The reserved amount reduces what an admin can manually credit. A signed paid event inserts one ledger entry, and a signed expiration releases the reservation. A browser return never records a payment.

Review pending rows with `SELECT id, assessment_id, amount_cents, stripe_session_id, created_at FROM dues_checkouts WHERE status = 'pending';`. If a bound session stays pending, inspect the session in the Stripe test dashboard and replay the verified event. If a create attempt lost its response, retry from the account page to reuse its idempotency key. After 12 hours with no bound session, reconcile the attempt ID against Stripe before releasing the reservation. Do not clear a pending row solely because it is old. Payment credits can be matched to provider sessions through `dues_payments.checkout_id`. Refunds and live payment configuration are pending.

## Project map

All paths are under [`src/Claymores.Api`](src/Claymores.Api).

| File | Responsibility |
| --- | --- |
| `Program.cs` | API routes, dependency setup, JWT validation, Swagger, startup migrations, and command-line tasks |
| `Hosting.cs` | Render settings: `PORT`, `DATABASE_URL`, and forwarded headers |
| `DatabaseMigrator.cs` | Applies `sql/*.sql` once each and reports pending migrations |
| `PostgresKeyRepository.cs` | Stores the sign-in key ring in Postgres |
| `ClubInvitations.cs` | Invitation table, role resolution, and admin invitation endpoints |
| `SanityData.cs` | Published Sanity queries for fixtures, standings, teams, players, and practices |
| `FixtureDatabase.cs` | Npgsql fixture reads (filtered by `Fixtures:Source`) and transactional import |
| `Scraper/TeamNameResolver.cs` | The single team-name normalizer and resolver |
| `Scraper/RugbyFlParser.cs` | AngleSharp parsing of rugbyfl.com pages and the scoring rules. No I/O. |
| `Scraper/ScrapeService.cs` | Fetching (`RugbyFlClient`), scrape orchestration, and command-line parsing |
| `Scraper/ScrapeStore.cs` | Scraper writes: team resolution, fixture upserts, standings, and the run log |
| `Scraper/ScrapeEndpoints.cs`, `Scraper/ScraperCli.cs` | The protected HTTP trigger and the command-line tasks |
| `Scraper/SanityComparison.cs` | The `--compare-with-sanity` report |
| `ClubMemberDirectory.cs` | Member directory populated after Google sign-in |
| `GoogleSignIn.cs` | Google sign-in, session cookie, and account page |
| `MobileAuth.cs` | App sign-in: Google ID-token check, API access tokens, rotating refresh tokens |
| `DuesAdminPage.cs` | Treasurer interface and payment history |
| `DuesLedger.cs` | Role-gated dues endpoints and transactional payment ledger |
| `DuesCheckout.cs` | Test checkout and signed Stripe webhooks |
| `DuesCheckoutStore.cs` | Durable reservations, payment credits, and expiration |
| `sql/` | Numbered Postgres migrations |

## Tests

From this folder, run:

```sh
dotnet test --solution Claymores.slnx
```

Tests that need Postgres skip unless `CLAYMORES_TEST_DATABASE` is set to a connection string for a user that can create databases. Each test class creates and drops its own database. For example:

```sh
CLAYMORES_TEST_DATABASE='Host=127.0.0.1;Port=5432;Database=postgres;Username=postgres;Password=<password>' \
  dotnet test --solution Claymores.slnx
```

## Website-first rollout

The integration branch is `codex/claymores-api-integration` in the separate `work/claymores-website-api` worktree. The Next.js API setting is server-only. With `CLAYMORES_API_BASE_URL` unset, the site reads directly from Sanity. With it set, the migrated reads use the API and surface request errors.

1. Start the API with the HTTP profile and check `http://127.0.0.1:5294/health`, `/v1/fixtures`, and `/v1/standings`.
2. In the website worktree, install the existing lockfile dependencies and start Next.js with the local API URL.

   ```sh
   npm ci
   NEXT_PUBLIC_SANITY_PROJECT_ID=bw1seoll NEXT_PUBLIC_SANITY_DATASET=production \
     CLAYMORES_API_BASE_URL=http://127.0.0.1:5294 npm run dev
   ```

3. Open the site at `http://localhost:3000` and compare against the existing Sanity-backed website. To test direct Sanity mode locally, stop Next.js and restart it with `CLAYMORES_API_BASE_URL` unset.
4. For a hosted comparison, use a Vercel Preview deployment with `CLAYMORES_API_BASE_URL` set for the Preview environment to the hosted API's HTTPS base URL. Leave Vercel Production settings and traffic as they are until the preview is verified.

The site keeps its existing URLs and adapts API responses to the page models.

| Website route | API data in preview |
| --- | --- |
| `/` and `/results` | Supply fixture summaries and completed-match data from `GET /v1/fixtures` and the current league table from `GET /v1/standings` where shown. |
| `/fixtures` | `GET /v1/fixtures` supplies match results and upcoming matches. Fixture team profiles and calendar entries come from `GET /v1/teams` and `GET /v1/practices`. |
| `/fixtures/[slug]` | Keep the current `matchSlug` logic based on date and team names. Resolve the slug against the fixture list, then use the returned fixture ID with `GET /v1/fixtures/{id}` when a detail fetch is needed. |
| `/team` and `/team/[slug]` | The roster and player profile endpoints are `GET /v1/players` and `GET /v1/players/{slug}`. These are separate from the fixture-team directory at `GET /v1/teams`. |
| `/standings` | `GET /v1/standings/seasons` provides season links. Use `GET /v1/standings` for the current table, or pass the selected season label. |
| `/standings/[season]` | The URL uses the closing year. For `/standings/2026`, use `GET /v1/standings?season=2025-2026` for the league table and playoffs, and filter the fixture list to 2026 results. |

Compare the preview against the existing site before switching production. Check upcoming and completed matches, practices and team lookups, scores and forfeits, kickoff and venue, logos and opponent links, recaps, fixture slugs and metadata, standings order, archived seasons, playoffs, and missing-item behavior. Verify how data refreshes after a Sanity edit, including rerunning the importer when the API uses Postgres. Move Flutter onto the same API after the website integration is verified.

## Backend work before production

1. Configure the Google OAuth client, then test the player and admin flows through the website sign-in button. Plan Flutter sign-in when the website flow is verified.
2. Club access is in Postgres (`club_invitations`). Mobile sign-in is built but off (`MobileAuth__Enabled=false`) until the iOS and Android OAuth clients exist and the app is tested against it.
3. Choose one editing workflow for fixtures. If Sanity Studio stays the editor, add a signed, retryable sync with deletion and reconciliation coverage before serving imported fixtures to the website. If Postgres becomes the editor, add protected write endpoints and an admin workflow.
4. Deploy the API and its database to Render (see below). Check request timeouts, logs, cache refresh, missing records, and rollback to direct Sanity reads before changing the production environment.

## Flutter web access

Native clients can call the API over HTTPS. If the Flutter web build is hosted on a separate origin, use a same-origin proxy or add its exact origin under `Cors:PublicOrigins`. For example, `Cors__PublicOrigins__0=http://127.0.0.1:8766` allows local public GET requests from that preview. Sign-in, identity, dues, and payment webhooks are outside this CORS policy. Native builds don't need CORS for mobile sign-in or dues. A hosted Flutter web build would need its exact origin in a separate CORS policy for those routes, which doesn't exist yet.

## Deploy on Render

The website stays on Vercel. The API and its Postgres database run on Render, defined by [`render.yaml`](../render.yaml) at the repository root.

1. In Render, select **New > Blueprint** and connect the `Claymore-Website` repository. Render reads `render.yaml` and proposes the `claymores-api` web service and the `claymores-db` database, both in the Virginia region.
2. Enter the values marked `sync: false` when prompted: the Google OAuth client ID and secret, and one bootstrap admin email. Leave the Google values blank to start with public data only.
3. Apply the Blueprint. Render builds [`Dockerfile`](Dockerfile), starts the API, and waits for `/health/ready`. The first start creates every table.
4. Add the production Google redirect URI, `https://<service>.onrender.com/signin-google` (or your custom domain), to the Google OAuth client.
5. Optionally import the Sanity fixtures from the service's **Shell** tab: `dotnet Claymores.Api.dll --import-fixtures`. Until you do, fixture endpoints read from Postgres and return nothing. To serve scraped fixtures instead, set `Fixtures__Source=scraper` (see [Scraper](#scraper)). The Blueprint's two cron jobs scrape rugbyfl.com weekly in shadow mode.

Notes:

- **What triggers a deploy:** changes under `api/` (except Markdown and tests) or to `render.yaml`. Website-only commits don't redeploy the API.
- **Plans:** the Blueprint uses the `starter` web plan and the `basic-256mb` database. Render's free web plan sleeps when idle, which delays the first request and can miss Stripe webhooks. Its free database expires after 30 days.
- **Neon instead of Render Postgres:** delete the `databases` block and the `fromDatabase` entry, and set `DATABASE_URL` to the Neon URL as a secret.
- **HTTPS:** Render terminates TLS. Because `RENDER=true` is set on Render, the API trusts `X-Forwarded-Proto`, so the Google redirect uses `https` and the session cookie stays Secure. Set `ForwardedHeaders__Enabled=true` on any other host behind a TLS proxy, and only there. HSTS is sent outside Development.
- **Restarts:** the sign-in key ring is stored in the `data_protection_keys` table, so members stay signed in across deploys and restarts.
- **Dues and Stripe:** leave `Dues__Enabled` and `Stripe__CheckoutEnabled` unset in production for now. Checkout only accepts Stripe test keys.
- **Mobile sign-in:** Render generates `Authentication__Tokens__SigningKey`. Enter the iOS client ID for `Authentication__Google__MobileClientIds__0`, then set `MobileAuth__Enabled=true` when the app is ready. With checkout on as well, also set `Stripe__AppReturnUrl=claymores://dues`.
- **Running the container elsewhere:** from this folder, run `docker build -t claymores-api .` and then `docker run -p 8080:8080 -e DATABASE_URL=... claymores-api`.
