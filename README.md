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
| `npm run lint` | Lint |
| `npm run test:graphics` | Match-graphic tests |

### Reading data from the API

With `CLAYMORES_API_BASE_URL` unset, the site reads Sanity directly. With it set (server-only), fixtures, standings, teams, players and practices come from the API. On Vercel, it is set only for Preview deployments of `codex/claymores-api-integration`, pointing at the Render API. Production still reads Sanity.

### Scheduled jobs

`vercel.json` runs `/api/scrape-rugby` and `/api/scrape-standings` weekly. They write match and standings data into Sanity and need `CRON_SECRET`.
