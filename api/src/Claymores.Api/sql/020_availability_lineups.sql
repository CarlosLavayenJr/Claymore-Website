-- Match availability and lineups. A member says whether they can play a fixture (one answer
-- per member per fixture, changeable until match day ends). Admins pick a lineup from 1 to 23
-- (1-15 starters, 16-23 replacements), save it as a draft, and publish it to members.
-- fixture_id is fixtures.sanity_id, the id clients see; no foreign key because fixture rows
-- are re-imported by the scraper and CMS sync.
CREATE TABLE IF NOT EXISTS match_availability (
    fixture_id text NOT NULL CHECK (length(fixture_id) BETWEEN 1 AND 200),
    member_subject text NOT NULL CHECK (length(member_subject) BETWEEN 1 AND 255),
    status text NOT NULL CHECK (status IN ('available', 'maybe', 'unavailable')),
    note text CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 200),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (fixture_id, member_subject)
);

CREATE TABLE IF NOT EXISTS match_lineups (
    fixture_id text PRIMARY KEY CHECK (length(fixture_id) BETWEEN 1 AND 200),
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    published_at timestamptz,
    updated_by text,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS match_lineup_slots (
    fixture_id text NOT NULL REFERENCES match_lineups (fixture_id) ON DELETE CASCADE,
    number integer NOT NULL CHECK (number BETWEEN 1 AND 23),
    member_subject text NOT NULL,
    PRIMARY KEY (fixture_id, number),
    UNIQUE (fixture_id, member_subject)
);
