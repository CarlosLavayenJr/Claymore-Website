-- "Anyone with the link": an admin makes a link to post in a group chat. Whoever opens it and
-- signs in with Google joins as a player, with no request to approve. Links expire, and an
-- admin can turn one off at any time. Each use is kept so admins can see who joined by link.
CREATE TABLE IF NOT EXISTS club_invite_links (
    id uuid PRIMARY KEY,
    token text NOT NULL UNIQUE CHECK (length(token) BETWEEN 16 AND 64),
    role text NOT NULL DEFAULT 'player' CHECK (role = 'player'),
    created_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    revoked_by text
);

CREATE TABLE IF NOT EXISTS club_invite_link_uses (
    link_id uuid NOT NULL REFERENCES club_invite_links (id),
    email text NOT NULL,
    used_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (link_id, email)
);
