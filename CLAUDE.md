# Claymore Website — Project Guide

## Mission
Dominate SEO for rugby in the Orlando and Central Florida region.
Every page, every piece of content, and every technical decision should serve this goal.

## The Club
**Central Florida Claymores RFC** — Orlando-based rugby club founded in 2018.
- Contact: centrolfloridaclaymores@gmail.com
- Region: Orlando / Central Florida / Florida Rugby Union
- Division: D4

## SEO North Star
Target keywords to own:
- "Orlando rugby"
- "Central Florida rugby"
- "Orlando rugby club"
- "Florida rugby union"
- "rugby Orlando FL"

Every page should reference Orlando and Central Florida naturally and consistently.
Meta titles, descriptions, headings, alt text, and URLs all matter.

## Tech Stack
- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **CMS**: Sanity (players, news posts) — Studio at `/studio`
- **Database**: Supabase (planned — match history)
- **Deployment**: TBD

## Pages
| Route | Purpose |
|---|---|
| `/` | Home — hero + Instagram feed |
| `/about` | Club history, coaches, timeline |
| `/team` | Player roster (fed from Sanity) |
| `/fixtures` | Google Calendar embed + Xplorer Rugby results |
| `/contact` | Contact form |
| `/studio` | Sanity CMS (not public-facing) |

## Planned
- Match history page (Supabase DB)
- News/blog page (Sanity posts schema already built)
- SEO metadata on all pages (titles, descriptions, Open Graph)
- Sitemap + robots.txt

## Key Decisions
- Sanity is used for content editors (players, news) — not hardcoded data
- Supabase for structured match data (scores, opponents, dates)
- No monorepo — Sanity Studio is embedded at `/studio`
- `(site)` route group keeps Studio outside the Navbar/Footer layout
