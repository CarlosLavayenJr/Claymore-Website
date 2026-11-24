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

Install the [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0). From this project directory, run:

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
| `GET /v1/fixtures` | Public | `200` and an array sorted by date and ID. Add `?season=2027` to filter by fixture year. |
| `GET /v1/fixtures/{id}` | Public | `200` and the fixture object, or `404` for an unknown ID. Copy an `id` from the list. |
| `GET /v1/standings` | Public | `200` and the current standings document. Add `?season=2025-2026` to request a specific season. Returns `404` when no standings match. |
| `GET /v1/standings/seasons` | Public | `200` and an array of season summaries for the standings index. |
| `GET /v1/teams` | Public | `200` and an array of published teams. |
| `GET /v1/players` | Public | `200` and an array of published active player profiles ordered by name. |
| `GET /v1/players/{slug}` | Public | `200` and the active player profile, or `404` for an unknown or inactive profile. |
| `GET /v1/practices` | Public | `200` and an array of published practice and event records. |
| `GET /v1/practices/schedule` | Public | `200` and the practice schedule, or `404` when no schedule is published. |
| `GET /v1/me` | Bearer token | `200` and the token's subject and name claims, or `401` for a missing or invalid token. |

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

The website entry hands off to the API-hosted account page. Flutter sign-in follows after browser verification. Keep local OAuth client settings separate from any future preview or production settings.

In the current Codex workspace, an isolated Postgres database is already prepared. After setting Google user secrets and trusting the .NET development certificate, run `node work/postgres-check/local-preview.mjs` from the workspace root to apply migrations, import fixtures, and start the HTTPS Google and dues preview. This local runner does not need Neon. The `work/dotnet/dotnet` executable can be used in place of `dotnet` if the SDK is only installed in this workspace.

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

1. Create a development database in Neon or another Postgres instance.
2. Apply [`sql/001_fixtures.sql`](sql/001_fixtures.sql) to that database. You can paste the script into the Neon SQL Editor and run it there. It creates `teams`, `fixtures`, and an index for season and date queries.
3. In the terminal where you run the API, set `ConnectionStrings__Claymores` to an Npgsql connection string. Copy the values from your database provider and use this shape:

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

4. Import the published Sanity fixtures. Run the same command again to check repeatability.

   ```sh
   dotnet run --launch-profile http -- --import-fixtures
   dotnet run --launch-profile http -- --import-fixtures
   ```

   Both runs report how many fixtures they processed. The importer uses the Sanity document ID as the fixture primary key and updates existing rows on conflict. It preserves rows absent from a later import. The import runs in a transaction. Rerun it when Sanity changes or when the API imports additional fixture fields.

5. In the SQL editor, verify the row counts and check that no Sanity ID appears more than once:

   ```sql
   SELECT count(*) AS fixtures, count(DISTINCT sanity_id) AS unique_fixtures
   FROM fixtures;

   SELECT count(*) AS teams FROM teams;
   ```

   The initial verification returned 63 fixtures after both imports. Subsequent totals can grow as fixtures are published in Sanity.

6. From the same terminal, run `dotnet run --launch-profile http` and try the fixture endpoints again. The configured API reads fixtures from Postgres, so apply the migration and import before starting it in this mode. To switch back to Sanity-backed fixture reads, unset `ConnectionStrings__Claymores` and restart the API.

## Player dues

The dues ledger records USD amounts in integer cents. An admin assigns the amount due and records payments the club has already received. The signed-in account page shows the player’s own amount due, total paid, and remaining balance. The dues detail endpoint also shows their payment history. The ledger does not charge cards.

For local testing, configure Google sign-in and a development Postgres database. Apply [`sql/002_dues.sql`](sql/002_dues.sql), [`sql/003_dues_checkout.sql`](sql/003_dues_checkout.sql), and [`sql/004_club_members.sql`](sql/004_club_members.sql) in order, then start the HTTPS API with `Dues__Enabled=true`. Dues routes appear in Swagger when that flag is enabled and Google and Postgres are configured. Apply the fixtures migration too if you use the existing fixture endpoints with this database.

| Method and path | Access | Behavior |
| --- | --- | --- |
| `GET /v1/dues/mine` | Player or admin | Lists the signed-in member's assessments |
| `GET /v1/dues/mine/{id}` | Player or admin | Shows payment history for an assessment belonging to the signed-in member |
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

| File | Responsibility |
| --- | --- |
| [`Program.cs`](Program.cs) | API routes, dependency setup, JWT validation, and Swagger |
| [`SanityData.cs`](SanityData.cs) | Published Sanity queries for fixtures, standings, teams, players, and practices |
| [`FixtureDatabase.cs`](FixtureDatabase.cs) | Npgsql fixture reads and transactional import |
| [`ClubMemberDirectory.cs`](ClubMemberDirectory.cs) | Member directory populated after Google sign-in |
| [`DuesAdminPage.cs`](DuesAdminPage.cs) | Treasurer interface and payment history |
| [`DuesLedger.cs`](DuesLedger.cs) | Role-gated dues endpoints and transactional payment ledger |
| [`DuesCheckout.cs`](DuesCheckout.cs) | Test checkout and signed Stripe webhooks |
| [`DuesCheckoutStore.cs`](DuesCheckoutStore.cs) | Durable reservations, payment credits, and expiration |
| [`sql/001_fixtures.sql`](sql/001_fixtures.sql) | Initial Postgres schema |

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
2. Define club access in Postgres. Start with a member record linked to the provider's issuer and subject, then agree on permissions for players and club admins.
3. Choose one editing workflow for fixtures. If Sanity Studio stays the editor, add a signed, retryable sync with deletion and reconciliation coverage before serving imported fixtures to the website. If Postgres becomes the editor, add protected write endpoints and an admin workflow.
4. Deploy the API and Neon to staging. Check request timeouts, logs, cache refresh, missing records, and rollback to direct Sanity reads before changing the production environment.

## Flutter web access

Native clients can call the API over HTTPS. If the Flutter web build is hosted on a separate origin, use a same-origin proxy or add its exact origin under `Cors:PublicOrigins`. For example, `Cors__PublicOrigins__0=http://127.0.0.1:8766` allows local public GET requests from that preview. Sign-in, identity, dues, and payment webhooks are outside this CORS policy.

## Deployment

Keep the Next.js frontend on Vercel and deploy the ASP.NET Core service separately to a .NET-capable host. Run the migration and import before using Postgres in a hosted environment. Configure database and OIDC settings on the API host, serve the API over HTTPS, and verify health, fixture, standings, and authenticated requests before changing either client. The frontend will use the API URL and its own access token when needed. The Postgres connection string belongs on the API host.
