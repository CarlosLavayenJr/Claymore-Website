-- Automatic dues: when on, every player who signs in (or opens their dues) and doesn't have dues
-- with this description yet gets them. One row (id is always true). Assessments an admin removes
-- are kept with removed_at, so automatic and "everyone" assignment never add them back, and they
-- disappear from balances and lists.
CREATE TABLE IF NOT EXISTS dues_auto_assign (
    id boolean PRIMARY KEY DEFAULT true CHECK (id),
    enabled boolean NOT NULL DEFAULT false,
    description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 120),
    amount_cents integer NOT NULL CHECK (amount_cents > 0),
    due_date date,
    updated_by text,
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dues_assessments
    ADD COLUMN IF NOT EXISTS removed_at timestamptz,
    ADD COLUMN IF NOT EXISTS removed_by text;
