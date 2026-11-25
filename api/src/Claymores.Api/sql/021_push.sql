-- Push notifications. push_devices: one row per device token, linked to the member signed in on
-- it (so reminders can depend on their availability answer). push_sent: which reminder went out
-- for which fixture, so the hourly job sends each one once.
CREATE TABLE IF NOT EXISTS push_devices (
    token text PRIMARY KEY CHECK (length(token) BETWEEN 1 AND 4096),
    member_subject text NOT NULL,
    platform text NOT NULL CHECK (platform IN ('ios', 'android')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_devices_member_idx ON push_devices (member_subject);

CREATE TABLE IF NOT EXISTS push_sent (
    fixture_id text NOT NULL,
    kind text NOT NULL,
    sent_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (fixture_id, kind)
);
