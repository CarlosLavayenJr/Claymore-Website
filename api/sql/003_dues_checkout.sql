BEGIN;

CREATE TABLE IF NOT EXISTS dues_checkouts (
    id uuid PRIMARY KEY,
    assessment_id uuid NOT NULL REFERENCES dues_assessments(id),
    amount_cents integer NOT NULL CHECK (amount_cents >= 50),
    status text NOT NULL CHECK (status IN ('pending', 'paid', 'expired')),
    stripe_session_id text UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS dues_one_pending_checkout_idx
    ON dues_checkouts (assessment_id) WHERE status = 'pending';

ALTER TABLE dues_payments
    ADD COLUMN IF NOT EXISTS checkout_id uuid UNIQUE REFERENCES dues_checkouts(id);

COMMIT;
