-- 008_klienten.sql
-- Klientenbezug (Gerald 06.11.2026, BRETT-ABGLEICH-1A.md, Bausteine 1–3):
--   * Nur Coaching-Klienten kommen aufs Brett. Wer das ist, legt Gerald im
--     Steuerpult fest (Aufnahme aus der Kundentabelle der Website).
--   * Sitzungen (brett_rooms) und gespeicherte Aufstellungen (brett_snapshots)
--     gehören zu einem Klienten.
--   * Aufbewahrung: bis Gerald löscht, mit Erinnerung nach Ende der Begleitung.
--   * Wird ein Kunde gelöscht, gehen seine Brett-Daten mit (statt herrenlos).
-- Idempotent (läuft bei jedem Start). Ohne Tabelle customers (Tests, leere
-- Datenbank) wird der Block übersprungen.

DO $$
BEGIN
  IF to_regclass('public.customers') IS NULL THEN
    RAISE NOTICE '008_klienten: keine Tabelle customers – übersprungen';
    RETURN;
  END IF;

  CREATE SCHEMA IF NOT EXISTS brett;

  -- Wer ist Coaching-Klient? Eine Zeile je Kunde.
  CREATE TABLE IF NOT EXISTS brett.coaching_klienten (
    customer_id     UUID PRIMARY KEY REFERENCES public.customers(id) ON DELETE CASCADE,
    aufgenommen_am  TIMESTAMPTZ NOT NULL DEFAULT now(),
    begleitung_ende DATE,          -- gesetzt = Begleitung beendet → Erinnerung
    erinnerung_ab   DATE           -- „später erinnern“ verschiebt hierhin
  );

  -- Sitzung ↔ Klient
  IF to_regclass('public.brett_rooms') IS NOT NULL THEN
    ALTER TABLE brett_rooms ADD COLUMN IF NOT EXISTS customer_id UUID
      REFERENCES public.customers(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_brett_rooms_customer ON brett_rooms (customer_id);
  END IF;

  IF to_regclass('public.brett_snapshots') IS NOT NULL THEN
    -- Kopie weiß, woher sie stammt (Baustein 3).
    ALTER TABLE brett_snapshots ADD COLUMN IF NOT EXISTS kopie_von UUID
      REFERENCES brett_snapshots(id) ON DELETE SET NULL;

    -- Zuordnung zum Kunden: ON DELETE SET NULL → CASCADE.
    IF EXISTS (
      SELECT 1 FROM pg_constraint c
       WHERE c.conrelid = 'brett_snapshots'::regclass AND c.contype = 'f'
         AND c.confrelid = 'public.customers'::regclass AND c.confdeltype <> 'c'
    ) THEN
      EXECUTE (
        SELECT string_agg(format('ALTER TABLE brett_snapshots DROP CONSTRAINT %I', c.conname), '; ')
          FROM pg_constraint c
         WHERE c.conrelid = 'brett_snapshots'::regclass AND c.contype = 'f'
           AND c.confrelid = 'public.customers'::regclass
      );
      ALTER TABLE brett_snapshots ADD CONSTRAINT brett_snapshots_customer_id_fkey
        FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Wird eine Sitzung gelöscht (auch über den Kunden), gehen ihr Protokoll und
-- ihre Ansehen-Links mit. session_events/brett_share_tokens hängen nur über
-- den Text room_token am Raum, daher per Auslöser statt Fremdschlüssel.
CREATE OR REPLACE FUNCTION brett_raum_geloescht() RETURNS trigger
LANGUAGE plpgsql AS $f$
BEGIN
  IF to_regclass('public.session_events') IS NOT NULL THEN
    DELETE FROM session_events WHERE room_token = OLD.room_token;
  END IF;
  IF to_regclass('public.brett_share_tokens') IS NOT NULL THEN
    DELETE FROM brett_share_tokens WHERE room_token = OLD.room_token;
  END IF;
  RETURN OLD;
END $f$;

DO $$
BEGIN
  IF to_regclass('public.brett_rooms') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_brett_raum_geloescht ON brett_rooms;
    CREATE TRIGGER trg_brett_raum_geloescht AFTER DELETE ON brett_rooms
      FOR EACH ROW EXECUTE FUNCTION brett_raum_geloescht();
  END IF;
END $$;
