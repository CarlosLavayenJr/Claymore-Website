-- Who may sign in, and with which role. Replaces the configuration email
-- lists; configured emails still work as a bootstrap for the first admin.
CREATE TABLE IF NOT EXISTS club_invitations (
    email text PRIMARY KEY CHECK (email = lower(btrim(email)) AND length(email) BETWEEN 3 AND 320),
    role text NOT NULL CHECK (role IN ('player', 'admin')),
    invited_by text,
    invited_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
