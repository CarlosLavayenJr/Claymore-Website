-- Scraper rows adopted from Sanity hand edits (--adopt-sanity-overrides) remember the
-- Sanity document they came from. sanity_id is the fixtures primary key and already holds
-- the Sanity _id of 'sanity' rows, so the origin lives in its own column.
ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS origin_sanity_id text;

CREATE INDEX IF NOT EXISTS fixtures_origin_sanity_id_idx
    ON fixtures (origin_sanity_id) WHERE source = 'scraper' AND origin_sanity_id IS NOT NULL;
