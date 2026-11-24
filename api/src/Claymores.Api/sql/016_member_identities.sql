-- One member per person. A member can sign in with Google and with Apple; each provider account
-- (a Google subject, or "apple|" plus Apple's subject) maps to one member here, and everything else
-- (dues, sessions, admin) uses the member's subject (club_members.google_subject, which is the
-- subject of the account the member first signed in with). Sign-ins with the same verified email
-- join the same member; an Apple "Hide My Email" account joins through POST /v1/me/identities/apple.
CREATE TABLE IF NOT EXISTS member_identities (
    provider_subject text PRIMARY KEY CHECK (length(provider_subject) BETWEEN 1 AND 255),
    member_subject text NOT NULL CHECK (length(member_subject) BETWEEN 1 AND 255),
    linked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS member_identities_member_idx ON member_identities (member_subject);

-- Existing members that share an email become one: the earliest sign-in is the member, the others
-- point at it, their dues move to it, and their app sessions end (they sign in again).
CREATE TEMP TABLE member_merge ON COMMIT DROP AS
SELECT m.google_subject AS old_subject,
       first_value(m.google_subject) OVER (
           PARTITION BY lower(btrim(m.email)) ORDER BY m.first_sign_in_at, m.google_subject) AS new_subject
FROM club_members m;

INSERT INTO member_identities (provider_subject, member_subject)
SELECT old_subject, new_subject FROM member_merge
ON CONFLICT (provider_subject) DO NOTHING;

UPDATE dues_assessments a SET player_subject = mm.new_subject
FROM member_merge mm WHERE a.player_subject = mm.old_subject AND mm.old_subject <> mm.new_subject;

UPDATE mobile_refresh_tokens t SET revoked_at = now()
FROM member_merge mm
WHERE t.google_subject = mm.old_subject AND mm.old_subject <> mm.new_subject AND t.revoked_at IS NULL;

DELETE FROM club_members m USING member_merge mm
WHERE m.google_subject = mm.old_subject AND mm.old_subject <> mm.new_subject;
