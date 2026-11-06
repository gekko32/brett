CREATE SCHEMA IF NOT EXISTS brett;

CREATE TABLE IF NOT EXISTS brett.board_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand           TEXT NOT NULL,
  name            TEXT NOT NULL CHECK (char_length(name) <= 100),
  description     TEXT CHECK (char_length(description) <= 500),
  category        TEXT CHECK (char_length(category) <= 50),
  state           JSONB NOT NULL,
  is_system       BOOLEAN NOT NULL DEFAULT false,
  created_by_user TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_board_templates_brand_system_created
  ON brett.board_templates (brand, is_system, created_at DESC);

-- Patricks drei Startvorlagen entfernt (Gerald 06.11.2026, siehe 010_ohne_patrick.sql).
