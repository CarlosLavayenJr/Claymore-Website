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
- **CMS**: Sanity (players, news posts) — Studio at `/studio`
- **Database**: Supabase (planned — match history)
- **Deployment**: Vercel

## Pages
| Route | Purpose |
|---|---|
| `/` | Home — hero + Instagram feed |
| `/about` | Club history, coaches, timeline |
| `/about-orlando-rugby` | SEO landing page for Orlando rugby |
| `/team` | Player roster (fed from Sanity) |
| `/team/[slug]` | Individual player profile pages |
| `/fixtures` | Upcoming fixtures (Google Calendar embed) |
| `/results` | Match results |
| `/blog` | News/blog (fed from Sanity) |
| `/blog/[slug]` | Individual blog post pages |
| `/join` | Join the club CTA page |
| `/faq` | Frequently asked questions |
| `/location` | Location / directions page |
| `/contact` | Contact form (sends via Resend to claymoresrfc@gmail.com) |
| `/studio` | Sanity CMS (not public-facing) |

## Planned
- Match history page (Supabase DB)

## Brand Colors
- Pink Accent: `#fd80b5` (draws, links, CTAs primary)
- Steel Blue: `#77c3ef` (wins, secondary CTAs — use this, NOT `#78c3ef`)
- Divider: `#EAEAEA`
- Primary Text: `#111111`
- Secondary Text: `#555555`
- Background: `#FFFFFF`

See `STYLING.md` for full design system including typography, buttons, cards, and match graphic styles.

## Key Decisions
- Sanity is used for content editors (players, news) — not hardcoded data
- Supabase for structured match data (scores, opponents, dates)
- No monorepo — Sanity Studio is embedded at `/studio`
- `(site)` route group keeps Studio outside the Navbar/Footer layout
- Contact form uses Resend API (`/api/contact`) — emails go to claymoresrfc@gmail.com
- Sitemap and robots.txt are live
