# Claymores

This repository holds the Central Florida Claymores website, API, and mobile app.

| Folder | What it is | Deploys to |
| --- | --- | --- |
| `/` (root) | Next.js website and Sanity Studio | Vercel |
| [`api/`](api/README.md) | ASP.NET Core 10 API for the website and app | Render, through `render.yaml` |
| [`mobile/`](mobile/README.md) | Flutter app | Not released yet |

Vercel builds the website only when files outside `api/` and `mobile/` change, through the `ignoreCommand` in `vercel.json`. Both folders are also listed in `.vercelignore`, so they aren't uploaded with the site.

## Website

Next.js 16 (App Router) with an embedded Sanity Studio at `/studio`. See [CLAUDE.md](CLAUDE.md) for the pages and SEO goals and [STYLING.md](STYLING.md) for the design system.

```sh
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The site needs `NEXT_PUBLIC_SANITY_PROJECT_ID` and `NEXT_PUBLIC_SANITY_DATASET`; `vercel env pull` fetches the rest.

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run lint` | Lint (`next lint` was removed in Next 16, so this script currently fails) |
| `npm run test:graphics` | Match-graphic tests |
| `npm run test:auth` | Member sign-in, token refresh and API client tests |

### Reading data from the API

With `CLAYMORES_API_BASE_URL` unset, the site reads Sanity directly. With it set (server-only), fixtures, standings, teams, players and practices come from the API. On Vercel, it is set only for Preview deployments of `codex/claymores-api-integration`, pointing at the Render API. Production still reads Sanity.

### Member sign-in (`/sign-in`, `/sign-up`, `/account`, `/account/admin`)

The site stays public. Sign-in exists only for member features (dues and payments). Only `/account` and `/account/admin` are protected (`proxy.ts`). All member pages are `noindex`, are not in the sitemap, and `/account` is disallowed in `robots.txt`.

**Feature gate.** Sign-in turns on only when all four of these are set. With any missing, the navbar hides **Sign in** and the pages show "Sign-in is coming soon", so production keeps working without them.

| Variable | Value |
| --- | --- |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google **Web application** OAuth client. Use the API's `Authentication:Google:ClientId` client, or add this client ID to the API's `Authentication:Google:MobileClientIds`, or the API rejects the id_token's audience. |
| `AUTH_SECRET` | `openssl rand -base64 32`. Encrypts the session and pending-request cookies. |
| `CLAYMORES_API_BASE_URL` | Claymores API origin. This also switches sports data from Sanity to the API (see above). |
| `CLAYMORES_WEB_CHECKOUT_ENABLED` | Optional kill switch, `true` shows **Pay now**. Turn it on once the API has `Stripe:WebReturnUrl` set (see **Web dues checkout** below). |

Authorized redirect URIs to register on the Google client: `https://www.claymoresrfc.com/api/auth/callback/google`, plus a stable preview host such as `https://<project>-git-<branch>-<team>.vercel.app/api/auth/callback/google` (each preview hostname must be listed exactly; Google doesn't accept wildcards), and `http://localhost:3000/api/auth/callback/google` for local work.

**Flow.**

1. `/sign-in` → **Continue with Google** (Auth.js v5, Google provider) → Google → `/api/auth/callback/google`.
2. In the Auth.js `signIn` callback the server posts Google's `id_token` to `POST /v1/auth/mobile/google`.
   - `200`: the API access token, refresh token and user go into the Auth.js session JWT: an encrypted, httpOnly cookie. The session object returned to the browser never contains tokens, and no client `SessionProvider` is used. A token-free `claymores_member=1` cookie lets the navbar say **Account**.
   - `403 not_invited`: the id_token is stored for 10 minutes in an encrypted httpOnly cookie scoped to `/sign-up`, and the person lands on `/sign-up`. The form posts `request-access` with that id_token; the page shows `request-status` (pending, approved, denied). When the cookie expires, they confirm with Google again.
   - `401`: back to `/sign-in?error=invalid`. API down: `?error=unavailable`.
3. Every `/account*` request goes through `proxy.ts`. When the access token expires within two minutes, the proxy calls `POST /v1/auth/mobile/refresh` once per refresh token (single-flight, and the rotated result is remembered for two minutes so a parallel request carrying the old cookie reuses it instead of replaying the old token and revoking the family). The new session is written to the response cookie and into the request so the page rendered in the same request already uses it. A `401`/`403` from refresh signs the member out.
4. Pages and server actions call the API server-side with the bearer token (`/v1/me`, `/v1/dues/mine`, checkout, and admin join requests and invitations).
5. **Sign out** posts `POST /v1/auth/mobile/logout` and clears the cookies.

The single-flight guard is per server instance. Two requests on two different instances in the same instant can still race; the member is then asked to sign in again.

**Web dues checkout.** **Pay now** posts `POST /v1/dues/{id}/checkout-session` with `{"amountCents", "returnTo": "web"}` and redirects to the Stripe-hosted URL the API returns (only `https://` URLs are followed). Stripe then sends the member to the API's `Stripe:WebReturnUrl`, which must be `https://www.claymoresrfc.com/account`; the API appends `?checkout=returned` or `?checkout=cancelled` and `/account` shows the matching banner (a signed-out member goes through sign-in and lands back on the same URL). Set `Stripe:WebReturnUrl` on the API first, then `CLAYMORES_WEB_CHECKOUT_ENABLED=true` on the website. If the flag is on but the API isn't configured, the API answers `400 web_checkout_unavailable` and the member sees "Online payment isn't available yet" instead of a generic error. Other errors: `400 invalid_request` (amount), `404` (not their dues), `409` (over the balance or the session is no longer open), `502` (Stripe). The error mapping lives in `lib/claymores/checkout.ts`.

**Local testing with the mock API.**

```sh
MOCK_API_PORT=5399 node scripts/mock-claymores-api.mjs
CLAYMORES_DEV_SIGN_IN=1 AUTH_GOOGLE_ID=dev AUTH_GOOGLE_SECRET=dev AUTH_SECRET="$(openssl rand -base64 32)" \
  CLAYMORES_API_BASE_URL=http://127.0.0.1:5399 CLAYMORES_WEB_CHECKOUT_ENABLED=true npm run dev
```

`CLAYMORES_DEV_SIGN_IN=1` adds a development-only email form on `/sign-in` (never in a production build). The mock's checkout returns a fake Stripe URL; set `MOCK_WEB_CHECKOUT=off` to see the `web_checkout_unavailable` message or `MOCK_STRIPE_DOWN=1` for the `502` message, and open `/account?checkout=returned` to see the return banner. Use `player@example.com`, `admin@example.com`, or any other email to try request-to-join. Set `MOCK_ACCESS_TTL_SECONDS=150` to see a token refresh after 30 seconds.

### Scheduled jobs

`vercel.json` runs `/api/scrape-rugby` and `/api/scrape-standings` weekly. They write match and standings data into Sanity and need `CRON_SECRET`.
