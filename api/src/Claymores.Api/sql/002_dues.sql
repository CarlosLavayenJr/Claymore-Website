CREATE TABLE IF NOT EXISTS dues_assessments (
    id uuid PRIMARY KEY,
    player_subject text NOT NULL CHECK (length(player_subject) BETWEEN 1 AND 255),
    description text NOT NULL CHECK (length(description) BETWEEN 1 AND 120),
    amount_cents integer NOT NULL CHECK (amount_cents > 0),
    due_date date,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dues_player_idx ON dues_assessments (player_subject, created_at);

CREATE TABLE IF NOT EXISTS dues_payments (
    id uuid PRIMARY KEY,
    assessment_id uuid NOT NULL REFERENCES dues_assessments(id),
    amount_cents integer NOT NULL CHECK (amount_cents > 0),
    recorded_by text NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dues_payment_assessment_idx ON dues_payments (assessment_id, recorded_at);
