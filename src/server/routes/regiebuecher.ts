// brett/src/server/routes/regiebuecher.ts
// Regiebuch-Bibliothek (Gerald 06.11.2026, Baustein 5).
// - Systemeinträge (009_regiebuecher.sql) sind schreibgeschützt.
// - Eigene Fassung = Kopie mit original_id; nur sie lässt sich ändern/löschen.
// - Alles nur für Admin (Gerald). Texte vorerst nur Deutsch.

import { Router } from 'express';
import * as db from '../db';
import * as auth from '../auth';

export const regiebuecherRouter = Router();

function asyncHandler(fn: any) {
  return (req: any, res: any, next: any) => Promise.resolve(fn(req, res, next)).catch(next);
}

export interface Schritt { titel: string; anleitung: string; fragen: string[]; speicherpunkt: boolean }
export interface RegiebuchEingabe {
  titel: string; kurz: string; anliegen: string; ziel: string; grenzen: string; hinweise: string; herkunft: string;
  schritte: Schritt[];
}

const MAX_SCHRITTE = 30;
const MAX_FRAGEN = 10;
const kurzText = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * Eingabe prüfen und bereinigen. Fehler → { fehler }. Leere Fragen fallen weg,
 * ein Schritt braucht einen Titel, ein Regiebuch mindestens einen Schritt.
 */
export function parseRegiebuch(body: any): { werte?: RegiebuchEingabe; fehler?: string } {
  const b = body || {};
  const titel = kurzText(b.titel, 120);
  if (!titel) return { fehler: 'Titel fehlt' };
  if (!Array.isArray(b.schritte) || b.schritte.length === 0) return { fehler: 'mindestens ein Schritt' };
  if (b.schritte.length > MAX_SCHRITTE) return { fehler: `höchstens ${MAX_SCHRITTE} Schritte` };
  const schritte: Schritt[] = [];
  for (const s of b.schritte) {
    const st = kurzText(s?.titel, 120);
    if (!st) return { fehler: 'Jeder Schritt braucht einen Titel' };
    const fragen = (Array.isArray(s?.fragen) ? s.fragen : [])
      .map((f: unknown) => kurzText(f, 400)).filter(Boolean).slice(0, MAX_FRAGEN);
    schritte.push({ titel: st, anleitung: kurzText(s?.anleitung, 2000), fragen, speicherpunkt: s?.speicherpunkt === true });
  }
  return {
    werte: {
      titel, schritte,
      kurz: kurzText(b.kurz, 500), anliegen: kurzText(b.anliegen, 1000), ziel: kurzText(b.ziel, 1000),
      grenzen: kurzText(b.grenzen, 1000), hinweise: kurzText(b.hinweise, 2000), herkunft: kurzText(b.herkunft, 500),
    },
  };
}

/** Titel der eigenen Fassung. */
export function fassungTitel(original: string): string {
  return (original + ' (eigene Fassung)').slice(0, 120);
}

const ID_RE = /^[a-z0-9-]{1,64}$/i;
function idPruefen(req: any, res: any, next: any) {
  if (!ID_RE.test(String(req.params.id || ''))) return res.status(400).json({ error: 'id ungültig' });
  next();
}

const SPALTEN = 'id, titel, kurz, anliegen, ziel, grenzen, hinweise, herkunft, schritte, version, is_system, original_id, updated_at';

regiebuecherRouter.get('/api/regiebuecher', auth.requireAdmin, asyncHandler(async (_req: any, res: any) => {
  const { rows } = await db.getPool().query(
    `SELECT ${SPALTEN} FROM brett.regiebuecher ORDER BY is_system DESC, reihenfolge ASC, titel ASC`);
  res.json(rows);
}));

regiebuecherRouter.get('/api/regiebuecher/:id', auth.requireAdmin, idPruefen, asyncHandler(async (req: any, res: any) => {
  const { rows } = await db.getPool().query(`SELECT ${SPALTEN} FROM brett.regiebuecher WHERE id = $1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'not found' });
  res.json(rows[0]);
}));

// Eigene Fassung anlegen (Kopie). Das Original bleibt unverändert.
regiebuecherRouter.post('/api/regiebuecher/:id/kopie', auth.requireAdmin, idPruefen, asyncHandler(async (req: any, res: any) => {
  const o = await db.getPool().query('SELECT titel FROM brett.regiebuecher WHERE id = $1', [req.params.id]);
  if (!o.rows[0]) return res.status(404).json({ error: 'not found' });
  const { rows } = await db.getPool().query(
    `INSERT INTO brett.regiebuecher (id, titel, kurz, anliegen, ziel, grenzen, hinweise, herkunft, schritte, version, is_system, original_id)
     SELECT gen_random_uuid()::text, $2, kurz, anliegen, ziel, grenzen, hinweise, herkunft, schritte, 1, false, id
       FROM brett.regiebuecher WHERE id = $1
     RETURNING ${SPALTEN}`,
    [req.params.id, fassungTitel(o.rows[0].titel)]);
  res.status(201).json(rows[0]);
}));

// Eigene Fassung ändern. Systemeinträge: 403.
regiebuecherRouter.put('/api/regiebuecher/:id', auth.requireAdmin, idPruefen, asyncHandler(async (req: any, res: any) => {
  const p = parseRegiebuch(req.body);
  if (!p.werte) return res.status(400).json({ error: p.fehler });
  const v = p.werte;
  const alt = await db.getPool().query('SELECT is_system FROM brett.regiebuecher WHERE id = $1', [req.params.id]);
  if (!alt.rows[0]) return res.status(404).json({ error: 'not found' });
  if (alt.rows[0].is_system) return res.status(403).json({ error: 'Original der Bibliothek – bitte eigene Fassung anlegen' });
  const { rows } = await db.getPool().query(
    `UPDATE brett.regiebuecher SET titel=$2, kurz=$3, anliegen=$4, ziel=$5, grenzen=$6, hinweise=$7, herkunft=$8,
            schritte=$9, version = version + 1, updated_at = now()
      WHERE id = $1 AND is_system = false RETURNING ${SPALTEN}`,
    [req.params.id, v.titel, v.kurz, v.anliegen, v.ziel, v.grenzen, v.hinweise, v.herkunft, JSON.stringify(v.schritte)]);
  res.json(rows[0]);
}));

regiebuecherRouter.delete('/api/regiebuecher/:id', auth.requireAdmin, idPruefen, asyncHandler(async (req: any, res: any) => {
  const r = await db.getPool().query(
    'DELETE FROM brett.regiebuecher WHERE id = $1 AND is_system = false RETURNING id', [req.params.id]);
  if (!r.rows[0]) return res.status(404).json({ error: 'nicht gefunden oder Original der Bibliothek' });
  res.json({ ok: true });
}));
