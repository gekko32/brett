import crypto from 'crypto';
import { getPool, type MockPoolLike } from './db';
import type { Pool } from 'pg';

type PoolLike = Pool | MockPoolLike;

export async function createShareToken(
  roomToken: string,
  createdBy?: string,
  pool: PoolLike = getPool(),
): Promise<string> {
  const token = crypto.randomBytes(18).toString('base64url');
  await pool.query(
    `INSERT INTO brett_share_tokens (token, room_token, created_by, token_type) VALUES ($1, $2, $3, 'share')`,
    [token, roomToken, createdBy ?? null],
  );
  return token;
}

export async function resolveShareToken(
  token: string,
  pool: PoolLike = getPool(),
): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT room_token FROM brett_share_tokens
     WHERE token = $1 AND token_type = 'share' AND disabled_at IS NULL AND (expires_at IS NULL OR expires_at > now())`,
    [token],
  );
  return rows[0]?.room_token ?? null;
}

export async function disableShareToken(
  token: string,
  roomToken: string,
  pool: PoolLike = getPool(),
): Promise<boolean> {
  const res = await pool.query(
    `UPDATE brett_share_tokens SET disabled_at = now()
     WHERE token = $1 AND room_token = $2 AND token_type = 'share' AND disabled_at IS NULL`,
    [token, roomToken],
  );
  return ((res as any).rowCount ?? 0) > 0;
}

export async function listShareTokens(
  roomToken: string,
  pool: PoolLike = getPool(),
): Promise<{ token: string; created_at: Date; created_by: string | null }[]> {
  const { rows } = await pool.query(
    `SELECT token, created_at, created_by FROM brett_share_tokens
     WHERE room_token = $1 AND token_type = 'share' AND disabled_at IS NULL ORDER BY created_at DESC`,
    [roomToken],
  );
  return rows as any;
}

// ── Persönlicher Klienten-Link (08.11.2026) ─────────────────────────────────
export async function createKlientToken(
  roomToken: string,
  createdBy: string | undefined,
  stunden: number,
  pool: PoolLike = getPool(),
): Promise<{ token: string; expires_at: Date }> {
  const token = crypto.randomBytes(24).toString('base64url'); // 32 Zeichen
  const { rows } = await pool.query(
    `INSERT INTO brett_share_tokens (token, room_token, created_by, token_type, expires_at)
     VALUES ($1, $2, $3, 'klient', now() + make_interval(hours => $4)) RETURNING expires_at`,
    [token, roomToken, createdBy ?? null, stunden],
  );
  return { token, expires_at: (rows[0] as any)?.expires_at };
}

export async function resolveKlientToken(token: string, pool: PoolLike = getPool()): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT room_token FROM brett_share_tokens
     WHERE token = $1 AND token_type = 'klient' AND disabled_at IS NULL AND expires_at > now()`,
    [token],
  );
  return rows[0]?.room_token ?? null;
}

export async function aktiverKlientLink(roomToken: string, pool: PoolLike = getPool()): Promise<{ token: string; expires_at: Date } | null> {
  const { rows } = await pool.query(
    `SELECT token, expires_at FROM brett_share_tokens
     WHERE room_token = $1 AND token_type = 'klient' AND disabled_at IS NULL AND expires_at > now()
     ORDER BY created_at DESC LIMIT 1`,
    [roomToken],
  );
  return (rows[0] as any) ?? null;
}

export async function sperreKlientLinks(roomToken: string, pool: PoolLike = getPool()): Promise<void> {
  await pool.query(
    `UPDATE brett_share_tokens SET disabled_at = now()
     WHERE room_token = $1 AND token_type = 'klient' AND disabled_at IS NULL`,
    [roomToken],
  );
}

export async function createZuschauerToken(
  roomToken: string,
  createdBy?: string,
  pool: PoolLike = getPool(),
): Promise<string> {
  const token = crypto.randomBytes(18).toString('base64url');
  await pool.query(
    `INSERT INTO brett_share_tokens (token, room_token, created_by, token_type) VALUES ($1, $2, $3, 'zuschauer')`,
    [token, roomToken, createdBy ?? null],
  );
  return token;
}

export async function resolveZuschauerToken(
  token: string,
  pool: PoolLike = getPool(),
): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT room_token FROM brett_share_tokens
     WHERE token = $1 AND token_type = 'zuschauer' AND disabled_at IS NULL AND (expires_at IS NULL OR expires_at > now())`,
    [token],
  );
  return rows[0]?.room_token ?? null;
}

export async function listZuschauerTokens(
  roomToken: string,
  pool: PoolLike = getPool(),
): Promise<{ token: string; created_at: Date; created_by: string | null }[]> {
  const { rows } = await pool.query(
    `SELECT token, created_at, created_by FROM brett_share_tokens
     WHERE room_token = $1 AND token_type = 'zuschauer' AND disabled_at IS NULL ORDER BY created_at DESC`,
    [roomToken],
  );
  return rows as any;
}

export async function disableZuschauerToken(
  token: string,
  roomToken: string,
  pool: PoolLike = getPool(),
): Promise<boolean> {
  const res = await pool.query(
    `UPDATE brett_share_tokens SET disabled_at = now()
     WHERE token = $1 AND room_token = $2 AND token_type = 'zuschauer' AND disabled_at IS NULL`,
    [token, roomToken],
  );
  return ((res as any).rowCount ?? 0) > 0;
}
