// brett/src/server/routes/klient-link.ts
// Persönlicher Klienten-Link (Gerald 08.11.2026): Der Klient kommt ohne Konto
// direkt aufs Brett. Nur Ansehen, nur dieser eine Raum, läuft nach
// LINK_STUNDEN ab und lässt sich sperren. Erzeugen und Sperren nur Admin, und
// nur für eine Sitzung, die einem Coaching-Klienten zugeordnet ist.
// Die Anmeldesperre (oauth2-proxy) lässt nur /k/<token>, /api/k/<token> und
// die Verbindung /sync/k/<token> durch: mentolder-prod,
// prod/patch-oauth2-proxy-brett-deployment.yaml.

import path from 'path';
import * as db from '../db';
import * as auth from '../auth';
import * as shareTokens from '../share-tokens';
import { rooms } from '../rooms';
import { asyncHandler } from '../helpers';

export const LINK_STUNDEN = 12;

export function attachKlientLink(app: any, staticDir: string): void {
  app.get('/k/:token', asyncHandler(async (req: any, res: any) => {
    const room = await shareTokens.resolveKlientToken(req.params.token);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Robots-Tag', 'noindex');
    if (!room) return res.status(404).type('text/plain; charset=utf-8').send('Dieser Link ist abgelaufen oder gesperrt. Bitte fragen Sie Ihren Coach nach einem neuen Link.');
    res.sendFile(path.join(staticDir, 'index.html'));
  }));

  app.get('/api/k/:token', asyncHandler(async (req: any, res: any) => {
    const roomToken = await shareTokens.resolveKlientToken(req.params.token);
    res.setHeader('Cache-Control', 'no-store');
    if (!roomToken) return res.status(404).json({ error: 'invalid_token' });
    res.json({ valid: true, roomToken });
  }));

  const adresse = (req: any, token: string) =>
    `${process.env.BRETT_PUBLIC_URL || `${req.protocol}://${req.get('host')}`}/k/${token}`;

  app.get('/api/rooms/:room/klient-link', auth.requireAdmin, asyncHandler(async (req: any, res: any) => {
    const l = await shareTokens.aktiverKlientLink(req.params.room);
    res.json(l ? { url: adresse(req, l.token), ablauf: l.expires_at } : { url: null });
  }));

  app.post('/api/rooms/:room/klient-link', auth.requireAdmin, asyncHandler(async (req: any, res: any) => {
    const { rows } = await db.getPool().query('SELECT customer_id FROM brett_rooms WHERE room_token = $1', [req.params.room]);
    if (!rows[0]?.customer_id) return res.status(422).json({ error: 'Der Sitzung ist kein Klient zugeordnet' });
    // Immer nur ein gültiger Link je Sitzung.
    await shareTokens.sperreKlientLinks(req.params.room);
    trenneKlienten(req.params.room);
    const l = await shareTokens.createKlientToken(req.params.room, req.session?.userId, LINK_STUNDEN);
    res.status(201).json({ url: adresse(req, l.token), ablauf: l.expires_at });
  }));

  app.delete('/api/rooms/:room/klient-link', auth.requireAdmin, asyncHandler(async (req: any, res: any) => {
    await shareTokens.sperreKlientLinks(req.params.room);
    trenneKlienten(req.params.room);
    res.json({ ok: true });
  }));
}

/** Gesperrt heißt sofort gesperrt: laufende Klienten-Verbindungen trennen. */
function trenneKlienten(room: string): void {
  for (const ws of rooms.get(room) ?? []) {
    if ((ws as any)._isKlient) { try { (ws as any).close(4403, 'link_gesperrt'); } catch { /* schon zu */ } }
  }
}
