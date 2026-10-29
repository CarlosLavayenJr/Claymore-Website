# Match graphics in Sanity Studio

The website's existing players, matches and teams are the source of truth for graphics. `matchGraphics` is a separate document linked to a match; the scraper does not write graphic choices or lineup assignments. No content migration or new environment variables are required. Existing player photos, team records, and public pages keep their behavior.

## One-time player setup

In **Player**, upload **Body-shot cutout for graphics**: a transparent PNG or WebP with the entire player visible. This is separate from the website profile photo. Add a short **Name on graphics** if needed, and optional **Eligible position numbers** (1–15). Transparency is an editorial requirement; the upload field restricts file types but does not automatically remove backgrounds or prove an alpha channel exists.

## Match setup

1. Complete the existing **Match**: date, kickoff, venue, home/away teams, and linked team records. Each opponent's Team record needs a logo.
2. Create **Match Graphics**. Give it an internal name, link the match, and explicitly select whether Claymores are home or away. This controls opponent name, logos and scores; it does not guess from team-name spelling.
3. Choose a design under **Match & design**. Optionally upload a team/match background photo.
4. Under **Lineup & photos**, use **Add missing starting XV slots**. Choose a player for each position. Add 16–23 for optional replacements, and mark captain/vice-captain where needed. Use the player picker to open a player record and upload/change their cutout.
5. Choose one featured player for the **Featured player** design or exactly three for **Three players**. They must be in this lineup. The **Position map** uses the cutout for each starting player.
6. Open **Preview & download** and resolve the listed issues. Download PNG (1080 × 1350) or self-contained SVG. Preview uses the current graphics draft and prefers drafts of linked records, so review draft changes before exporting. Downloads do not publish Sanity content or post to social media.

For a **Final score**, use the same graphic document or create another linked to the same match. Set the match status to **Played** and enter its final scores. This layout needs crests and match details but no lineup, featured players, or kickoff. Upcoming/cancelled/forfeit statuses cannot export a final-score graphic; they need a separate announcement treatment.

## Validation and export

- Lineup exports require all 15 starting positions and reject duplicate numbers, duplicate players, out-of-range positions, or multiple captains/vice-captains.
- Position eligibility and inactive status produce warnings, allowing legitimate selection exceptions.
- Missing required photos, opponent logo, match details, and unresolved assets block download. During editing the preview can display neutral photo silhouettes; they are not a substitute for required images on export.
- Export is disabled while data/assets are loading or a previously rendered preview is stale. Linked document edits trigger refresh; there is also a manual Refresh data action.
- Image assets and club crest are inlined into SVG. Viking display lettering is converted to vector paths using the existing `/fonts/VIKING-N.woff`, avoiding font substitution in PNG/SVG exports. Content stays editable in Studio; display lettering in the downloaded SVG is outlined.
- Rendering runs in the authenticated Studio browser. No new public API, token exposure, external rendering service, or automatic posting is introduced.
- Keep export files as reviewed snapshots. A future live-data edit changes the next preview/export, not previously downloaded files.

## Implementation

- `sanity/schema/matchGraphics.ts`: match reference, design choices, lineup, and preview input.
- `sanity/schema/player.ts`: graphic display name, separate cutout, and eligibility.
- `sanity/components/graphics/`: Studio input, draft-aware source loading, asset preparation and browser downloads.
- `lib/graphics/model.ts`: mapping and export validation.
- `lib/graphics/render.ts`: shared brand treatment and the four layouts.

Run `npm run test:graphics`, `npx tsc --noEmit`, and `npm run build`. No dataset writes are necessary to run the tests.
