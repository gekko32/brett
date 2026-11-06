-- 005_board_templates_full_staging.sql
-- T900360 / systembrett-presets — Partial P1.
--
-- Repairs and upgrades the three system board templates (brand 'mentolder')
-- without touching 004_board_templates.sql (already applied in prod — editing
-- it would neither repair existing duplicates nor re-run it).
--
-- Safe under runMigrations() (db.ts), which re-executes every *.sql file on
-- each boot: every statement here is idempotent, and re-running the file
-- changes nothing (verified: applied twice, system-row count stays 3, no
-- duplicates, exactly one is_default per brand).
--
-- Why duplicates existed: 004 inserted the system rows with
-- `ON CONFLICT DO NOTHING` WITHOUT a conflict target, while generating a fresh
-- random UUID per boot — so every boot added three more rows per (brand, name).
--
-- Statement order is load-bearing:
--   Task 1  dedupe system rows, keep oldest per (brand, name)
--   Task 2  partial unique index (brand, name) WHERE is_system IS TRUE
--           (MUST follow Task 1 — a unique index over duplicated rows fails)
--   Task 2b is_default column + partial unique index (brand) WHERE is_default
--   Task 3  upsert of the 3 system rows with pinned uuid5 ids
--   Task 2b is_default pin UPDATEs (MUST follow Task 3)

-- ────────────────────────────────────────────────────────────────────────────
-- Task 1 — Dedupe existing system rows: keep exactly one is_system row per
-- (brand, name) — the oldest by created_at, tie-broken by smallest id.
-- Restricted to system rows: user-created templates are never touched.
-- ────────────────────────────────────────────────────────────────────────────
DELETE FROM brett.board_templates a
USING brett.board_templates b
WHERE a.is_system IS TRUE
  AND b.is_system IS TRUE
  AND a.brand = b.brand
  AND a.name = b.name
  AND (b.created_at, b.id) < (a.created_at, a.id);

-- ────────────────────────────────────────────────────────────────────────────
-- Task 2 — Real uniqueness guard for system rows. Partial: user templates
-- sharing a (brand, name) stay allowed; system rows gain a genuine conflict
-- target for Task 3. IF NOT EXISTS keeps boot-time re-runs quiet.
-- ────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS uq_board_templates_brand_name_system
  ON brett.board_templates (brand, name)
  WHERE is_system IS TRUE;

-- ────────────────────────────────────────────────────────────────────────────
-- Task 2b — Default marker column + at-most-one-default-per-brand guard.
-- Downstream partials (getBrandDefaultTemplate, reset-to-default) resolve the
-- brand default exclusively via this marker — no name literals (design D2).
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE brett.board_templates
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_board_templates_brand_default
  ON brett.board_templates (brand)
  WHERE is_default IS TRUE;


-- Task 3 (Patricks drei Systemvorlagen) und die Standard-Markierung auf
-- „Familiensystem 4 Personen“ entfernt (Gerald 06.11.2026). Neue Sitzungen
-- beginnen mit leerem Brett; Aufräumen bestehender Zeilen: 010_ohne_patrick.sql.
