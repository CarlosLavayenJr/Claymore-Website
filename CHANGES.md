# SEO / UX Audit Fixes — `seo-ux-audit-fixes`

Branch off `main` (4299292). Built and checked locally against a production build; **not merged or deployed**.

> ⚠️ **Open issue — fix before merging:** a local A/B Lighthouse test (3 runs each, median) shows the home page renders *slower* than current `main`. See [Known issues](#known-issues).

---

## 1. Highlight video in the heroes (`/join`, `/contact`)

- New `components/video-hero.tsx`: split hero (copy + CTA left, video right on desktop; copy → CTA → video stacked on mobile).
- New `components/youtube-video.tsx`: lightweight YouTube embed. Shows the thumbnail and only loads the YouTube player (~1 MB JS) on click, via `youtube-nocookie.com`.
- New `lib/highlight-video.ts`: one place for the video ID/title/upload date/duration (verified from YouTube: 2:42, uploaded 2026-09-27). Emits `VideoObject` structured data.
- `/contact`: hero gets a "Send a Message" button that jumps to the form; the 3-photo strip moved below the form so it no longer pushes the form down.

## 2. Page titles & meta descriptions

| | Before | After |
|---|---|---|
| Title template suffix | ` \| Central Florida Claymores \| Orlando, FL` (41 chars) | ` \| Claymores RFC` (15 chars) |
| Avg title length (148 pages) | ~110 chars | 57 chars |
| Titles over 65 chars | ~147 | 16 (66–71 chars, long team names) |
| Descriptions over 160 chars | many (fixtures were cut at 200) | 0 (max 159) |

- New `metaDescription()` helper in `lib/seo.ts` trims to ~155 chars on a word boundary.
- Fixture titles use a short date (`Mar 21, 2026`) and put the **Claymores' score first** (previously "Claymores Defeat Lakeland 12–82" read like a loss).
- Player descriptions: short bios like "Flyhalf, Mizzou." are padded with club context.
- Blog posts whose title already contains "Claymores RFC" no longer get the suffix twice.

## 3. City pages (`/rugby-in/[city]`, 24 pages)

**Bug fixed:** the `direction` field was used inconsistently. The first 4 cities stored the city's position and the other 20 stored the travel direction, so many pages gave the wrong compass direction (e.g. Kissimmee: "the drive is roughly 30 minutes **south**").

- Every city was **measured, not estimated**:
  - Coordinates come from OpenStreetMap Nominatim. Three wrong matches were caught and fixed: Dr. Phillips matched the arts center, Waterford Lakes matched Indian River County, and Avalon Park matched Collier County.
  - Driving distance, time (without traffic) and main roads come from OSRM routing to Barnett Park.
  - Several hand-entered times were well off: Ocoee 10 → 19 min, Sanford 30 → 47 min, Kissimmee 30 → 40 min.
- Removed claims that couldn't be verified: "the closest rugby club to X" (the Orlando Griffins and Otters are also Orlando clubs), and "you'll pass [landmark] on the way".
- New per-page content:
  - An at-a-glance fact strip: drive time, distance, direction, county.
  - A "Directions from X" Google Maps button.
  - A 3-question city FAQ, with `FAQPage` schema.
  - Links to the **5 nearest** city pages instead of the same 23 links on every page.
- Title is now "Rugby Club Near X, FL".
- Similarity between city pages dropped from **91% to 77–82%**. Going further needs real local content (see [Needs you](#needs-you--not-code)).
- Organization schema `geo` corrected to Barnett Park's OSM location (it was ~1.2 km off).

## 4. Home page

- The hero had no headline or CTA (a full-screen photo only). It now has a headline (the page's H1), a "Join a Practice" CTA and a "Watch the 2026 highlights" link over a gradient scrim.
- Hero image:
  - It was **lazy-loaded** although it's the largest element on screen. It now loads eagerly at high priority.
  - It uses `<picture>`, so only the mobile *or* the desktop image downloads, not both.
  - The 10 MB `hdheropic.png` was replaced by a 292 KB `hero-desktop.webp`.
- Removed the nested `<main>` (the page rendered `<main>` inside the layout's `<main>`). Same fix on `/about`.
- Home page transfer size: **1,727 KiB → 776 KiB**.

## 5. Analytics (Vercel)

- Added **Speed Insights** (`@vercel/speed-insights`). It must also be enabled in the Vercel dashboard.
- Moved `<Analytics />` inside `<body>`; it was rendered outside, which is invalid.
- New `components/analytics-events.tsx`, a single site-wide click listener (max 2 properties per event):

| Event | Properties | Fires when |
|---|---|---|
| `cta_click` | `to`, `from` | Any link into `/contact` or `/join` |
| `outbound_click` | `type`, `from` | Social, shop, email, phone, maps, other external links |
| `contact_submit` | – | Contact form sent successfully |
| `contact_error` | – | Contact form failed |
| `video_play` | `video`, `from` | Highlight video play button |

- Any element can send its own event with `data-track="event_name"`.
- **Bug fixed:** if the contact form's network request failed outright, the error wasn't caught and the button stayed stuck in its loading state.
- Custom events require Vercel Pro. GA4 and Google Ads conversion tracking were intentionally not added.

## 6. Structured data

- Home: `WebSite`.
- `/fixtures`: an `ItemList` of upcoming `SportsEvent`s. It only renders when upcoming matches exist, so it's absent right now in the offseason.
- `/team`: `SportsTeam` with each player as an `athlete`.
- City pages: `FAQPage`.
- **Bug fixed:** match kickoff times were hard-coded to `-04:00` (summer time). Most of the season is in EST (`-05:00`), so winter kickoffs were off by an hour in Google's data. The offset is now computed per date.

## 7. Accessibility

Lighthouse accessibility on a local build: home 91 → 96, `/join` 88 → 96.

- Nav: added **Join** and `aria-expanded` on the Fixtures dropdown and mobile menu.
  - Correction to the first audit: match pages *were* already grouped under the Fixtures dropdown.
- Footer Facebook/Instagram icon links now have accessible names.
- Team logos next to team names use `alt=""`. Screen readers previously read each name twice.
- Upcoming-events agenda buttons: removed an `aria-label` that replaced their visible text.
- Blog:
  - An H1 written in the post body now renders as H2, so there's one H1 per page.
  - Inline and gallery images get alt text: the image's own alt or caption if set, otherwise "[post title] — photo N". Media-plugin `altText` is used when set.
  - Gallery buttons are labelled ("Enlarge photo 3 of 12").
- `/join` and city pages: in-paragraph links are underlined, so they don't rely on colour alone.
- `/about`:
  - The banner's alt text now describes the photo (I checked the image; it was "Team Banner").
  - Coach photos have descriptive alt text and correct `sizes`.
- **Not changed (your call):** white text on `#77c3ef` CTAs (1.93:1 contrast) and pink `#fd80b5` links (2.35:1).

## 8. Match reports ↔ fixtures

- New optional **"Match Report For"** field on blog posts in Sanity Studio.
- When it's set, the fixture page shows "Read the match report" and the post shows "Match details". Posts now also revalidate fixture pages.

## 9. Images, third-party scripts, headers

- Team logos were served as raw 1500×1500 PNGs at 24 px. They're now resized by the Sanity CDN (`?w=48&fit=max&auto=format`).
- Blog images: inline images are capped at 1200 px and gallery thumbnails at 600 px, served as WebP/AVIF, and lazy-loaded.
- The Instagram (Elfsight) script now loads only when the feed is within 600 px of view, not on every page load.
- Coach photos compressed: `adam.png` 2.6 MB → 366 KB, `alex.jpg` 1.7 MB → 106 KB (same names and formats).
- Security headers: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: SAMEORIGIN`, `Permissions-Policy`.
- `priority` → `preload` on images (deprecated in Next 16).

---

## Verification

- `tsc` is clean and `next build` passes (129 static pages).
- Re-crawled all 148 sitemap URLs on a local production build:
  - All return 200.
  - One H1 per page and one `<main>` per page.
  - No description over 160 characters.
  - No image is missing an `alt` attribute.
- A/B Lighthouse against a local build of current `main`: same machine, mobile preset, 1 warm-up run plus 3 runs each, median reported.

| Page | Build | Perf | A11y | Best pract. | SEO | LCP | FCP | TBT | CLS | Weight |
|---|---|---|---|---|---|---|---|---|---|---|
| `/` | main | 84 | 91 | 75 | 100 | 3.3 s | 1.7 s | 336 ms | 0.000 | 1,727 KiB |
| `/` | this branch | **61** | **96** | 75 | 100 | **6.3 s** | **3.1 s** | 435 ms | 0.029 | **776 KiB** |
| `/join` | main | 67 | 88 | 75 | 100 | 5.1 s | 3.0 s | 292 ms | 0.105 | 601 KiB |
| `/join` | this branch | 62 | **96** | 75 | 100 | 5.7 s | 3.2 s | 365 ms | **0.086** | 642 KiB |

## Known issues

1. **Home page renders slower than `main`** (FCP 1.7 → 3.1 s, LCP 3.3 → 6.3 s) even though it downloads less than half the bytes.
   - The hero image itself now arrives fast (~180 ms delay, ~240 ms load). The time is spent in "render delay".
   - Ruled out: the font. `@font-face` already uses `font-display: swap`.
   - Root cause **not yet identified**. Candidates to test one at a time: the new hero markup (text now paints over the image), the Speed Insights script, and the analytics click listener.
2. `/join` is slightly slower too (LCP 5.1 → 5.7 s). It now has the video thumbnail as its main image.
3. Best Practices stays at 75 because of a third-party cookie set by the **Google Ads tag** (`googleads.g.doubleclick.net`).
   - Correction to the first audit: this is *not* the Elfsight widget.
4. 16 titles are still 66–71 characters, all because of long team names.

## Needs you (not code)

- **Vercel dashboard:**
  - Enable Speed Insights.
  - Confirm the Pro plan (needed for custom events).
  - Make `claymoresrfc.com` redirect straight to `www`. Today it takes two hops.
- **City pages:** add genuinely local material (players from the area, carpool info, photos) to the cities that matter most. This is what will bring similarity down further.
- **Content:** match reports (then link each to its fixture with the new field), beginner guides, more blog posts.
- **Contrast:** decide whether to revisit CTA and link colours.
- **Old images** in `public/` that the code no longer references (not deleted, in case something outside the site links to them): `assets/alex.PNG` (3.5 MB), `homepage/heropic.png` (2.8 MB), `homepage/claymores.jpg`, `assets/bg2.jpg`, `assets/bg3.jpg`, `homepage/oldclaymores.png`, `assets/state finals.jpg`, `homepage/claymoresrfc.webp`.
- **YouTube:** the highlight video is on a personal channel ("paul jr"), so I didn't add it to the club's `sameAs`. A club channel with a keyword title would help.
