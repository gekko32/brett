// brett/src/server/pg-session-store.ts
// Anmeldungen in Postgres statt im Arbeitsspeicher (Gerald 18.10.2026): Vorher
// hat jeder Neustart des Servers (neues Paket, Absturz) alle abgemeldet, mitten
// in der Sitzung. Tabelle: brett_http_sessions (Migration 007).
// Fällt die Datenbank aus, merkt sich der Speicher Anmeldungen vorübergehend im
// Arbeitsspeicher – lieber abgemeldet nach Neustart als gar keine Anmeldung.

import session from 'express-session';

type Pool = { query: (sql: string, args?: any[]) => Promise<{ rows: any[] }> };

export class PgSessionStore extends session.Store {
  private reserve = new Map<string, { sess: any; bis: number }>();
  private gewarnt = false;

  constructor(private holePool: () => Pool | null, private standardMs: number) {
    super();
    const t = setInterval(() => { void this.aufraeumen(); }, 15 * 60 * 1000);
    (t as any).unref?.();
  }

  private ablauf(sess: any): Date {
    const ms = typeof sess?.cookie?.maxAge === 'number' ? sess.cookie.maxAge : this.standardMs;
    return new Date(Date.now() + ms);
  }

  private fehler(err: unknown): void {
    if (this.gewarnt) return;
    this.gewarnt = true;
    console.warn('[brett] Anmeldungen: Datenbank nicht erreichbar, nutze Arbeitsspeicher', err);
  }

  get(sid: string, cb: (err: any, sess?: any) => void): void {
    const pool = this.holePool();
    const ausReserve = () => {
      const r = this.reserve.get(sid);
      cb(null, r && r.bis > Date.now() ? r.sess : null);
    };
    if (!pool) return ausReserve();
    pool.query('SELECT sess FROM brett_http_sessions WHERE sid = $1 AND expire > now()', [sid])
      .then(r => { if (r.rows[0]) cb(null, r.rows[0].sess); else ausReserve(); })
      .catch(err => { this.fehler(err); ausReserve(); });
  }

  set(sid: string, sess: any, cb?: (err?: any) => void): void {
    const bis = this.ablauf(sess);
    this.reserve.set(sid, { sess, bis: bis.getTime() });
    const pool = this.holePool();
    if (!pool) { cb?.(); return; }
    pool.query(
      `INSERT INTO brett_http_sessions (sid, sess, expire) VALUES ($1, $2, $3)
       ON CONFLICT (sid) DO UPDATE SET sess = EXCLUDED.sess, expire = EXCLUDED.expire`,
      [sid, JSON.stringify(sess), bis],
    ).then(() => { this.reserve.delete(sid); cb?.(); })
      .catch(err => { this.fehler(err); cb?.(); });
  }

  destroy(sid: string, cb?: (err?: any) => void): void {
    this.reserve.delete(sid);
    const pool = this.holePool();
    if (!pool) { cb?.(); return; }
    pool.query('DELETE FROM brett_http_sessions WHERE sid = $1', [sid])
      .then(() => cb?.()).catch(err => { this.fehler(err); cb?.(); });
  }

  touch(sid: string, sess: any, cb?: (err?: any) => void): void {
    const bis = this.ablauf(sess);
    const r = this.reserve.get(sid);
    if (r) r.bis = bis.getTime();
    const pool = this.holePool();
    if (!pool) { cb?.(); return; }
    pool.query('UPDATE brett_http_sessions SET expire = $2 WHERE sid = $1', [sid, bis])
      .then(() => cb?.()).catch(err => { this.fehler(err); cb?.(); });
  }

  private async aufraeumen(): Promise<void> {
    const jetzt = Date.now();
    for (const [sid, r] of this.reserve) if (r.bis <= jetzt) this.reserve.delete(sid);
    const pool = this.holePool();
    if (!pool) return;
    try { await pool.query('DELETE FROM brett_http_sessions WHERE expire <= now()'); } catch (err) { this.fehler(err); }
  }
}
