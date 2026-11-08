import type { Db } from '../db/database.ts';
import { nowIso } from '../db/database.ts';
import { findAccount, type Account } from '../services/accounts.ts';
import { generateToken, sha256 } from './passwords.ts';

export type SessionKind = 'client' | 'admin';

export const SESSION_COOKIES: Record<SessionKind, string> = {
  client: 'kmt_session',
  admin: 'kmt_admin_session',
};

export const SESSION_COOKIE_PATHS: Record<SessionKind, string> = {
  client: '/',
  admin: '/api/admin',
};

export const SESSION_LIFETIMES_MS: Record<SessionKind, number> = {
  client: 7 * 24 * 60 * 60 * 1000,
  admin: 12 * 60 * 60 * 1000,
};

export interface Session {
  id: number;
  accountId: number;
  kind: SessionKind;
  expiresAt: string;
}

export function createSession(db: Db, accountId: number, kind: SessionKind): { token: string; session: Session } {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_LIFETIMES_MS[kind]).toISOString();
  const result = db
    .prepare('INSERT INTO sessions (token_hash, account_id, kind, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
    .run(sha256(token), accountId, kind, nowIso(), expiresAt);
  return { token, session: { id: Number(result.lastInsertRowid), accountId, kind, expiresAt } };
}

// Returns the session and its account, or null when the token is unknown,
// expired, of the other kind, or belongs to a deactivated account.
export function findSession(db: Db, token: string, kind: SessionKind): { session: Session; account: Account } | null {
  const row = db
    .prepare('SELECT id, account_id, kind, expires_at FROM sessions WHERE token_hash = ?')
    .get(sha256(token)) as { id: number; account_id: number; kind: SessionKind; expires_at: string } | undefined;
  if (!row || row.kind !== kind) return null;
  if (row.expires_at <= nowIso()) {
    deleteSession(db, row.id);
    return null;
  }
  const account = findAccount(db, row.account_id);
  if (!account || !account.active) {
    deleteSession(db, row.id);
    return null;
  }
  return { session: { id: row.id, accountId: row.account_id, kind: row.kind, expiresAt: row.expires_at }, account };
}

export function deleteSession(db: Db, sessionId: number): void {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

export function deleteAccountSessions(db: Db, accountId: number, options: { exceptSessionId?: number; kind?: SessionKind } = {}): void {
  db.prepare(
    `DELETE FROM sessions WHERE account_id = ?
       AND (? IS NULL OR id <> ?)
       AND (? IS NULL OR kind = ?)`,
  ).run(accountId, options.exceptSessionId ?? null, options.exceptSessionId ?? null, options.kind ?? null, options.kind ?? null);
}

export function deleteExpiredSessions(db: Db): void {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowIso());
}
