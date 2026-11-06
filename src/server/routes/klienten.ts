// brett/src/server/routes/klienten.ts
// Klientenbezug (Gerald 06.11.2026, BRETT-ABGLEICH-1A.md, Bausteine 1 und 2).
//
// - Nur Coaching-Klienten kommen aufs Brett (brett.coaching_klienten). Gerald
//   nimmt sie im Steuerpult aus der Kundentabelle der Website auf.
// - Eine Sitzung (brett_rooms.customer_id) gehört zu einem Klienten.
// - Aufbewahrung: bis Gerald löscht. Ist die Begleitung beendet, erinnert das
//   Steuerpult daran („später erinnern“ verschiebt um 90 Tage).
// - Löschen nimmt alles mit: Aufstellungen, Sitzungen samt Protokoll und
//   Ansehen-Links (Auslöser aus 008_klienten.sql).
// Alle Routen nur für Admin (Gerald): Namen sind Klientendaten.

import { Router } from 'express';
import * as db from '../db';
import * as auth from '../auth';
import { rooms } from '../rooms';
import { figureMaps } from '../figures';
import { flushEventBuffer } from '../event-log';

export const klientenRouter = Router();

function asyncHandler(fn: any) {
  return (req: any, res: any, next: any) => Promise.resolve(fn(req, res, next)).catch(next);
}

// ── Reine Hilfen (unit-testbar, test/klienten.test.ts) ──────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function istUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

/** Erinnerung verschieben: so viele Tage. */
export const SPAETER_TAGE = 90;

/** Datum (YYYY-MM-DD) plus n Tage, ohne Zeitzonen-Überraschungen. */
export function plusTage(isoDatum: string, tage: number): string {
  const [j, m, t] = isoDatum.split('-').map(Number);
  const d = new Date(Date.UTC(j, m - 1, t + tage));
  return d.toISOString().slice(0, 10);
}

export function heuteIso(jetzt: Date = new Date()): string {
  const j = jetzt.getFullYear(), m = jetzt.getMonth() + 1, t = jetzt.getDate();
  return `${j}-${String(m).padStart(2, '0')}-${String(t).padStart(2, '0')}`;
}

/** Datum aus der Datenbank (Date oder Text) als YYYY-MM-DD. */
export function alsIso(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return heuteIso(v);
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

/**
 * Erinnern? Nur wenn die Begleitung beendet ist (Ende ≤ heute), noch Daten
 * gespeichert sind und keine Verschiebung in der Zukunft liegt.
 */
export function brauchtErinnerung(
  k: { begleitung_ende: string | null; erinnerung_ab: string | null; aufstellungen: number; sitzungen: number },
  heute: string,
): boolean {
  if (!k.begleitung_ende || k.begleitung_ende > heute) return false;
  if (k.aufstellungen + k.sitzungen === 0) return false;
  if (k.erinnerung_ab && k.erinnerung_ab > heute) return false;
  return true;
}

export type KlientAenderung =
  | { art: 'ende'; begleitung_ende: string | null }
  | { art: 'spaeter' };

/** PATCH-Körper prüfen: { begleitung_ende: 'YYYY-MM-DD' | null } oder { spaeter: true }. */
export function parseKlientPatch(body: any): KlientAenderung | null {
  const b = body || {};
  if (b.spaeter === true) return { art: 'spaeter' };
  if ('begleitung_ende' in b) {
    const v = b.begleitung_ende;
    if (v === null || v === '') return { art: 'ende', begleitung_ende: null };
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v))) {
      return { art: 'ende', begleitung_ende: v };
    }
  }
  return null;
}

/** Läuft gerade jemand im Raum? Dann nicht löschen (der Server würde ihn neu anlegen). */
export function raumLaeuft(room: string): boolean {
  return (rooms.get(room)?.size ?? 0) > 0;
}

// ── Klientenliste ───────────────────────────────────────────────────────────

klientenRouter.get('/api/klienten', auth.requireAdmin, asyncHandler(async (_req: any, res: any) => {
  const { rows } = await db.getPool().query(
    `SELECT k.customer_id AS id, c.name, to_jsonb(c)->>'customer_number' AS nummer,
            k.begleitung_ende, k.erinnerung_ab,
            (SELECT count(*)::int FROM brett_snapshots s WHERE s.customer_id = k.customer_id) AS aufstellungen,
            (SELECT count(*)::int FROM brett_rooms r WHERE r.customer_id = k.customer_id) AS sitzungen
       FROM brett.coaching_klienten k
       JOIN customers c ON c.id = k.customer_id
      ORDER BY c.name ASC`,
  );
  const heute = heuteIso();
  res.json(rows.map((r: any) => {
    const k = { ...r, begleitung_ende: alsIso(r.begleitung_ende), erinnerung_ab: alsIso(r.erinnerung_ab) };
    return { ...k, erinnern: brauchtErinnerung(k, heute) };
  }));
}));

// Kunden, die noch keine Coaching-Klienten sind (zum Aufnehmen).
klientenRouter.get('/api/klienten/kandidaten', auth.requireAdmin, asyncHandler(async (_req: any, res: any) => {
  const { rows } = await db.getPool().query(
    `SELECT c.id, c.name, to_jsonb(c)->>'customer_number' AS nummer
       FROM customers c
      WHERE COALESCE((to_jsonb(c)->>'is_admin')::boolean, false) = false
        AND NOT EXISTS (SELECT 1 FROM brett.coaching_klienten k WHERE k.customer_id = c.id)
      ORDER BY c.name ASC
      LIMIT 500`,
  );
  res.json(rows);
}));

klientenRouter.post('/api/klienten', auth.requireAdmin, asyncHandler(async (req: any, res: any) => {
  const id = req.body?.customer_id;
  if (!istUuid(id)) return res.status(400).json({ error: 'customer_id fehlt' });
  const { rows } = await db.getPool().query('SELECT 1 FROM customers WHERE id = $1', [id]);
  if (!rows[0]) return res.status(404).json({ error: 'Kunde nicht gefunden' });
  await db.getPool().query(
    'INSERT INTO brett.coaching_klienten (customer_id) VALUES ($1) ON CONFLICT (customer_id) DO NOTHING',
    [id],
  );
  res.status(201).json({ ok: true });
}));

klientenRouter.patch('/api/klienten/:id', auth.requireAdmin, asyncHandler(async (req: any, res: any) => {
  if (!istUuid(req.params.id)) return res.status(400).json({ error: 'id ungültig' });
  const a = parseKlientPatch(req.body);
  if (!a) return res.status(400).json({ error: 'begleitung_ende (YYYY-MM-DD|null) oder spaeter:true' });
  const r = a.art === 'spaeter'
    ? await db.getPool().query(
        'UPDATE brett.coaching_klienten SET erinnerung_ab = $2 WHERE customer_id = $1 RETURNING customer_id',
        [req.params.id, plusTage(heuteIso(), SPAETER_TAGE)])
    : await db.getPool().query(
        // Neues Ende → alte Verschiebung gilt nicht mehr.
        'UPDATE brett.coaching_klienten SET begleitung_ende = $2, erinnerung_ab = NULL WHERE customer_id = $1 RETURNING customer_id',
        [req.params.id, a.begleitung_ende]);
  if (!r.rows[0]) return res.status(404).json({ error: 'kein Coaching-Klient' });
  res.json({ ok: true });
}));

/**
 * Alle Brett-Daten eines Klienten löschen. ?auch_klient=true entfernt ihn
 * zusätzlich aus der Liste der Coaching-Klienten (die Kundenakte der Website
 * bleibt unberührt). Läuft gerade eine seiner Sitzungen → 409.
 */
klientenRouter.delete('/api/klienten/:id/daten', auth.requireAdmin, asyncHandler(async (req: any, res: any) => {
  const id = req.params.id;
  if (!istUuid(id)) return res.status(400).json({ error: 'id ungültig' });
  const pool = db.getPool();
  const { rows: raeume } = await pool.query('SELECT room_token FROM brett_rooms WHERE customer_id = $1', [id]);
  const tokens: string[] = raeume.map((r: any) => r.room_token);
  if (tokens.some(raumLaeuft)) return res.status(409).json({ error: 'Eine Sitzung dieses Klienten läuft noch' });

  // Gepufferte Protokolleinträge erst schreiben (der Auslöser löscht sie dann mit),
  // ausstehendes Speichern verwerfen, Arbeitsspeicher leeren.
  const pending = db.getPending();
  for (const t of tokens) {
    try { await flushEventBuffer(t); } catch { /* weiter */ }
    const timer = pending.get(t);
    if (timer) { clearTimeout(timer); pending.delete(t); }
    figureMaps.delete(t);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const a = await client.query('DELETE FROM brett_snapshots WHERE customer_id = $1', [id]);
    const s = await client.query('DELETE FROM brett_rooms WHERE customer_id = $1', [id]);
    if (req.query.auch_klient === 'true') {
      await client.query('DELETE FROM brett.coaching_klienten WHERE customer_id = $1', [id]);
    } else {
      await client.query('UPDATE brett.coaching_klienten SET erinnerung_ab = NULL WHERE customer_id = $1', [id]);
    }
    await client.query('COMMIT');
    res.json({ ok: true, aufstellungen: a.rowCount ?? 0, sitzungen: s.rowCount ?? 0 });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}));

// ── Sitzung ↔ Klient ────────────────────────────────────────────────────────

klientenRouter.get('/api/rooms/:room/klient', auth.requireAdmin, asyncHandler(async (req: any, res: any) => {
  const { rows } = await db.getPool().query(
    `SELECT r.customer_id AS id, c.name
       FROM brett_rooms r LEFT JOIN customers c ON c.id = r.customer_id
      WHERE r.room_token = $1`,
    [req.params.room],
  );
  res.json(rows[0]?.id ? rows[0] : { id: null, name: null });
}));

klientenRouter.post('/api/rooms/:room/klient', auth.requireAdmin, asyncHandler(async (req: any, res: any) => {
  const room = String(req.params.room || '');
  if (!room || room.length > 200) return res.status(400).json({ error: 'room ungültig' });
  const id = req.body?.customer_id ?? null;
  if (id !== null && !istUuid(id)) return res.status(400).json({ error: 'customer_id ungültig' });
  if (id) {
    const { rows } = await db.getPool().query('SELECT 1 FROM brett.coaching_klienten WHERE customer_id = $1', [id]);
    if (!rows[0]) return res.status(422).json({ error: 'kein Coaching-Klient' });
  }
  await db.getPool().query(
    `INSERT INTO brett_rooms (room_token, state, customer_id, last_modified_at)
          VALUES ($1, '{"figures":[]}'::jsonb, $2, now())
     ON CONFLICT (room_token) DO UPDATE SET customer_id = EXCLUDED.customer_id`,
    [room, id],
  );
  res.json({ ok: true });
}));
