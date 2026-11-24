-- How a payment was made, and a treasurer's note. Card payments through Stripe Checkout are
-- 'stripe'; payments the treasurer records by hand (money received at practice, Venmo, ...) carry
-- the method they chose and an optional note such as "Paid cash at practice 11/20". Players see
-- the method; only admins see the note.
ALTER TABLE dues_payments
    ADD COLUMN IF NOT EXISTS method text,
    ADD COLUMN IF NOT EXISTS note text;

UPDATE dues_payments SET method = 'stripe' WHERE method IS NULL AND checkout_id IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dues_payments_method_check') THEN
        ALTER TABLE dues_payments ADD CONSTRAINT dues_payments_method_check
            CHECK (method IS NULL OR method IN ('stripe', 'cash', 'venmo', 'zelle', 'check', 'other'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dues_payments_note_length') THEN
        ALTER TABLE dues_payments ADD CONSTRAINT dues_payments_note_length
            CHECK (note IS NULL OR char_length(note) <= 500);
    END IF;
END $$;
