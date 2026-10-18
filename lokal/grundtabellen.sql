-- Grundtabellen fürs lokale Brett (Auszug aus k3d/website-schema.yaml,
-- Abschnitt "Systemisches Brett"). customers nur minimal (id, name).
-- Die Tabellen aus src/server/migrations legt das Brett beim Start selbst an.

CREATE TABLE IF NOT EXISTS customers (
    id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS brett_rooms (
    room_token       TEXT PRIMARY KEY,
    state            JSONB NOT NULL DEFAULT '{"figures":[]}'::jsonb,
    last_modified_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS brett_snapshots (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_token  TEXT,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    name        TEXT NOT NULL,
    state       JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_brett_snapshots_customer ON brett_snapshots(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_brett_snapshots_room ON brett_snapshots(room_token, created_at DESC);
ALTER TABLE brett_snapshots ADD COLUMN IF NOT EXISTS is_template boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_brett_snapshots_template ON brett_snapshots(is_template) WHERE is_template;

-- Testkunde, damit Snapshots einem Kunden zugeordnet werden können
INSERT INTO customers (name) SELECT 'Testkunde Lokal' WHERE NOT EXISTS (SELECT 1 FROM customers);
