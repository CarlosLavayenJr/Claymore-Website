-- Coaches: club admins who pick lineups and don't play (no availability, no automatic dues).
-- The super admin is the configured bootstrap email (Authentication:Google:AdminEmails), never a row here.
ALTER TABLE club_invitations DROP CONSTRAINT IF EXISTS club_invitations_role_check;
ALTER TABLE club_invitations ADD CONSTRAINT club_invitations_role_check CHECK (role IN ('player', 'coach', 'admin'));
