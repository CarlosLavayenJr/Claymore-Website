-- Undoing a payment: an admin marks it voided (with a reason) instead of deleting it, so the
-- history keeps who undid what and why. Voided rows no longer count toward a balance. A voided
-- card payment stays in place so a replayed Stripe webhook can't record it again.
ALTER TABLE dues_payments ADD COLUMN IF NOT EXISTS voided_at timestamptz;
ALTER TABLE dues_payments ADD COLUMN IF NOT EXISTS voided_by text;
ALTER TABLE dues_payments ADD COLUMN IF NOT EXISTS void_reason text;
ALTER TABLE dues_payments ADD COLUMN IF NOT EXISTS note_edited_at timestamptz;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dues_payments_void_reason_length') THEN
        ALTER TABLE dues_payments ADD CONSTRAINT dues_payments_void_reason_length
            CHECK (void_reason IS NULL OR char_length(void_reason) BETWEEN 1 AND 500);
    END IF;
END $$;
