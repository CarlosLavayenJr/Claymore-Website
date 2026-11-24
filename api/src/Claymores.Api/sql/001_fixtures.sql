CREATE TABLE IF NOT EXISTS teams (
    name text PRIMARY KEY CHECK (length(name) > 0)
);

CREATE TABLE IF NOT EXISTS fixtures (
    sanity_id text PRIMARY KEY,
    fixture_date date NOT NULL,
    season integer,
    home_team text NOT NULL REFERENCES teams(name),
    away_team text NOT NULL REFERENCES teams(name),
    payload jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS fixtures_season_date_idx
    ON fixtures (season, fixture_date, sanity_id);
