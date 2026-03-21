-- SolarCRM - Initial Schema with Row Level Security
-- Run this against your Neon database before deploying

-- ─────────────────────────────────────────────────────
-- COMPANIES (tenants — no RLS, it's the auth table itself)
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS companies (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   TEXT        NOT NULL,
  email                  TEXT        UNIQUE NOT NULL,
  password_hash          TEXT        NOT NULL,
  region                 TEXT        DEFAULT 'Polska',
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT,
  subscription_status    TEXT        NOT NULL DEFAULT 'trial',  -- trial | active | canceled | past_due
  trial_ends_at          TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────
-- CLIENTS
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  type        TEXT        NOT NULL DEFAULT 'dom',     -- dom | firma | agro
  email       TEXT,
  phone       TEXT,
  city        TEXT,
  address     TEXT,
  system_kw   DECIMAL(10,2),
  status      TEXT        NOT NULL DEFAULT 'new',     -- new | quote | installation | active | awaiting_osd
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clients_company ON clients(company_id);
CREATE INDEX IF NOT EXISTS idx_clients_status  ON clients(company_id, status);

-- ─────────────────────────────────────────────────────
-- ORDERS  (zlecenia)
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id       UUID        REFERENCES clients(id) ON DELETE SET NULL,
  client_name     TEXT,                                -- denormalized for speed
  title           TEXT        NOT NULL,
  description     TEXT,
  status          TEXT        NOT NULL DEFAULT 'new',  -- new | scheduled | in_progress | awaiting_osd | done | canceled
  scheduled_date  DATE,
  value           DECIMAL(12,2),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_company ON orders(company_id);
CREATE INDEX IF NOT EXISTS idx_orders_client  ON orders(client_id);
CREATE INDEX IF NOT EXISTS idx_orders_status  ON orders(company_id, status);

-- ─────────────────────────────────────────────────────
-- UPDATED_AT trigger
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clients_updated_at ON clients;
CREATE TRIGGER clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS orders_updated_at ON orders;
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- RLS uses SET LOCAL app.company_id inside transactions.
-- If the setting is missing, current_setting returns NULL
-- (second arg = true = missing_ok), and NULL = UUID fails,
-- so ALL rows are denied — safe by default.
-- ─────────────────────────────────────────────────────
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders  ENABLE ROW LEVEL SECURITY;

-- Drop existing policies before recreating (idempotent)
DROP POLICY IF EXISTS rls_clients ON clients;
DROP POLICY IF EXISTS rls_orders  ON orders;

CREATE POLICY rls_clients ON clients
  FOR ALL
  USING (company_id::text = current_setting('app.company_id', true));

CREATE POLICY rls_orders ON orders
  FOR ALL
  USING (company_id::text = current_setting('app.company_id', true));

-- Allow the app DB user to set session variables
-- (needed for SET LOCAL app.company_id)
-- This is already allowed by default in PostgreSQL for session params.
