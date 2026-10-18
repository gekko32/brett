-- 007_anmeldungen.sql
-- Anmeldungen (express-session) dauerhaft speichern (Gerald 18.10.2026):
-- vorher lagen sie im Arbeitsspeicher, jeder Neustart meldete alle ab.
-- Idempotent (läuft bei jedem Start).

CREATE TABLE IF NOT EXISTS brett_http_sessions (
  sid     TEXT        PRIMARY KEY,
  sess    JSONB       NOT NULL,
  expire  TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_brett_http_sessions_expire ON brett_http_sessions (expire);
