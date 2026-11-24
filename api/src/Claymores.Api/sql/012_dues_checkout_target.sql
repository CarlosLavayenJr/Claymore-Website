-- Where Stripe returns the player, and which Stripe mode created the checkout.
-- Rows created before this script have NULLs: they were created in test mode under the
-- original idempotency key and metadata, and are still resumed and completed that way.
ALTER TABLE dues_checkouts
    ADD COLUMN IF NOT EXISTS return_to text CHECK (return_to IN ('account', 'app', 'web')),
    ADD COLUMN IF NOT EXISTS stripe_mode text CHECK (stripe_mode IN ('test', 'live'));
