-- Scraper rows that rugbyfl.com no longer lists (a reschedule, a team re-resolved to another
-- team, a removed game) are retired instead of deleted, so their history stays queryable.
-- Public reads and the Sanity comparison skip retired rows. A retired row that the scraper
-- sees again is un-retired by the upsert. Adopted rows (manual_override) are never retired.
ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS retired_at timestamptz;

CREATE INDEX IF NOT EXISTS fixtures_scraper_page_idx
    ON fixtures (source_club_id, source_season_id) WHERE source = 'scraper' AND retired_at IS NULL;

-- A treasurer can release a pending checkout that never got a Stripe session (the create's
-- response was lost and the player never came back). The row becomes 'expired' and records who
-- released it and when.
ALTER TABLE dues_checkouts
    ADD COLUMN IF NOT EXISTS released_by text,
    ADD COLUMN IF NOT EXISTS released_at timestamptz;
