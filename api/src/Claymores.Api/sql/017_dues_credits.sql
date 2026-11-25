-- Credits that aren't money: 'volunteer' (time or work for the club instead of paying) and
-- 'waived' (the club forgives some or all of it). They reduce the balance like a payment but are
-- reported separately from money collected (dues_assessments' creditedCents in the API).
ALTER TABLE dues_payments DROP CONSTRAINT IF EXISTS dues_payments_method_check;
ALTER TABLE dues_payments ADD CONSTRAINT dues_payments_method_check
    CHECK (method IS NULL OR method IN ('stripe', 'cash', 'venmo', 'zelle', 'check', 'other', 'volunteer', 'waived'));
