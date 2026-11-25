-- Names members (or admins) type in. Google and Apple don't always send a full name (some
-- Google profiles are first name only; Apple sends it once). Once set here, sign-in no longer
-- overwrites display_name with the provider's name.
ALTER TABLE club_members ADD COLUMN IF NOT EXISTS name_set_by text;
ALTER TABLE club_members ADD COLUMN IF NOT EXISTS name_set_at timestamptz;
