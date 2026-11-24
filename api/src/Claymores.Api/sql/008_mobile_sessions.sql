-- Refresh tokens for the mobile app. Only the SHA-256 hash of each token is stored.
-- Every rotation adds a row to the same family; presenting a revoked token
-- revokes the whole family (reuse detection).
CREATE TABLE IF NOT EXISTS mobile_refresh_tokens (
    id uuid PRIMARY KEY,
    family_id uuid NOT NULL,
    token_hash bytea NOT NULL UNIQUE CHECK (length(token_hash) = 32),
    google_subject text NOT NULL CHECK (length(google_subject) BETWEEN 1 AND 255),
    email text NOT NULL CHECK (length(email) BETWEEN 1 AND 320),
    display_name text,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    replaced_by uuid
);

CREATE INDEX IF NOT EXISTS mobile_refresh_family_idx ON mobile_refresh_tokens (family_id);
CREATE INDEX IF NOT EXISTS mobile_refresh_subject_idx ON mobile_refresh_tokens (google_subject);
