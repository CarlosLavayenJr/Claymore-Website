-- "Request to join": people who signed in with Google or Apple but aren't invited yet.
-- One row per identity (Apple subjects are stored as apple|<sub>, like sign-in does).
-- Approving a request creates or updates the club_invitations row for its email.
CREATE TABLE IF NOT EXISTS join_requests (
    id uuid PRIMARY KEY,
    provider text NOT NULL CHECK (provider IN ('google', 'apple')),
    subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 255),
    email text NOT NULL CHECK (length(email) BETWEEN 3 AND 320),
    name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
    phone text CHECK (length(phone) <= 30),
    message text CHECK (length(message) <= 500),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    decided_by text,
    decided_at timestamptz,
    deny_reason text CHECK (length(deny_reason) <= 500),
    UNIQUE (provider, subject)
);

CREATE INDEX IF NOT EXISTS join_requests_status_idx ON join_requests (status, created_at);
