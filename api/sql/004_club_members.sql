BEGIN;

CREATE TABLE IF NOT EXISTS club_members (
    google_subject text PRIMARY KEY CHECK (length(google_subject) BETWEEN 1 AND 255),
    email text NOT NULL CHECK (length(email) BETWEEN 1 AND 320),
    display_name text,
    first_sign_in_at timestamptz NOT NULL DEFAULT now(),
    last_sign_in_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
