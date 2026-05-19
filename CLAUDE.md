# Claymore Website — Project Guide

## Mission
Dominate SEO for rugby in the Orlando and Central Florida region.
Every page, every piece of content, and every technical decision should serve this goal.

## The Club
**Central Florida Claymores RFC** — Orlando-based rugby club founded in 2018.
- Site: https://www.claymoresrfc.com
- Contact: claymoresrfc@gmail.com
- Region: Orlando / Central Florida / Florida Rugby Union
- Division: D3

## SEO North Star
Target keywords to own:
- "Orlando rugby"
- "Central Florida rugby"
- "Orlando rugby club"
- "Florida rugby union"
- "rugby Orlando FL"
- "rugby near me"

Every page should reference Orlando and Central Florida naturally and consistently.
Meta titles, descriptions, headings, alt text, and URLs all matter.

## Tech Stack
- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui — see `STYLING.md` for full design system
- **CMS**: Sanity (players, news posts, matches, teams) — Studio at `/studio`
- **Deployment**: Vercel

## Pages
| Route | Purpose |
|---|---|
| `/` | Home — hero + Instagram feed |
| `/about` | Club history, coaches, timeline |
| `/about-orlando-rugby` | SEO landing page for Orlando rugby |
| `/team` | Player roster (fed from Sanity) |
| `/team/[slug]` | Individual player profile pages |
| `/fixtures` | Upcoming fixtures (fed from Sanity match docs) |
| `/fixtures/[slug]` | Individual fixture / match detail page |
| `/results` | Match-by-match history with URL-synced filters (`?season=`, `?type=`, `?opponent=`); defaults to latest season |
| `/standings` | Florida Rugby Union standings index — current season table + per-season cards |
| `/standings/[season]` | Per-season standings, playoff bracket, and match list (closing year as URL segment, e.g. `/standings/2026`); old `/results/[season]` 301s here |
| `/opponents` | All-time opponents directory with head-to-head records |
| `/opponents/[slug]` | Per-opponent head-to-head page |
| `/coaches` | Coaching staff (feature-flagged) |
| `/coaches/[slug]` | Individual coach profile pages (feature-flagged) |
| `/rugby-in/[city]` | City-specific SEO landing pages (Kissimmee, Winter Park, etc.) |
| `/blog` | News/blog (fed from Sanity) |
| `/blog/[slug]` | Individual blog post pages |
| `/join` | SEO landing page for "join Orlando rugby" — funnels visitors to `/contact` (CTAs site-wide also point to `/contact`) |
| `/faq` | Frequently asked questions |
| `/location` | Location / directions page |
| `/contact` | Contact form (sends via Resend to claymoresrfc@gmail.com) — the primary conversion point and the blue navbar CTA |
| `/studio` | Sanity CMS (not public-facing) |

## Brand Colors
- Pink Accent: `#fd80b5` (draws, links, eyebrows, accent dividers)
- Steel Blue: `#77c3ef` (wins, **all CTAs** — use this, NOT `#78c3ef`; pair with `text-white font-claymore`, hover `#a0d5f5`)
- Divider: `#EAEAEA`
- Primary Text: `#111111`
- Secondary Text: `#555555`
- Background: `#FFFFFF`

See `STYLING.md` for full design system including typography, buttons, cards, and match graphic styles.

## Key Decisions
- Sanity is used for content editors (players, news, matches, teams) — not hardcoded data
- Match data is scraped nightly from rugbyfl.com via `/api/scrape-rugby` (Vercel cron) and upserted into Sanity
- Match docs have a `manualOverride` boolean — when checked in Studio, the scraper skips that doc entirely (use it when the official source is wrong, e.g. cancelled matches still listed as upcoming)
- No monorepo — Sanity Studio is embedded at `/studio`
- `(site)` route group keeps Studio outside the Navbar/Footer layout
- Contact form uses Resend API (`/api/contact`) — emails go to claymoresrfc@gmail.com
- Sitemap and robots.txt are live
