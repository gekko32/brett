-- 002_coaching_templates.sql
-- Coaching-step templates surfaced in the Brett lobby. Idempotent: safe to
-- re-run on every server startup (runMigrations in db.ts applies all *.sql).

CREATE SCHEMA IF NOT EXISTS brett;

CREATE TABLE IF NOT EXISTS brett.coaching_templates (
  id          TEXT PRIMARY KEY,
  brand       TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  steps       JSONB NOT NULL,           -- string[]
  is_system   BOOLEAN NOT NULL DEFAULT false,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coaching_templates_brand_active_idx
  ON brett.coaching_templates (brand, is_active);

-- Patricks Ablauf „Beziehungsdynamik — Familiensystem“ entfernt (Gerald 06.11.2026);
-- geführte Abläufe heißen jetzt Regiebücher (009_regiebuecher.sql).
