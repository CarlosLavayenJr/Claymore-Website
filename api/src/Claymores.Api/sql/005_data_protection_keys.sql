-- ASP.NET Core data-protection key ring. Keeps sign-in cookies and Google
-- sign-in state valid across restarts, deploys, and multiple instances.
CREATE TABLE IF NOT EXISTS data_protection_keys (
    friendly_name text PRIMARY KEY CHECK (length(friendly_name) BETWEEN 1 AND 255),
    xml text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
