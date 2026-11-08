import type { Accent, Language } from '../../shared/preferences.ts';
import type { Db } from '../db/database.ts';

export type Role = 'driver' | 'admin';

export interface Account {
  id: number;
  personId: number;
  username: string;
  passwordHash: string;
  passwordIsTemporary: boolean;
  temporaryPasswordExpiresAt: string | null;
  role: Role;
  active: boolean;
  isProtected: boolean;
  accent: Accent;
  language: Language;
  createdAt: string;
}

interface AccountRow {
  id: number;
  person_id: number;
  username: string;
  password_hash: string;
  password_is_temporary: number;
  temporary_password_expires_at: string | null;
  role: Role;
  active: number;
  is_protected: number;
  accent: Accent;
  language: Language;
  created_at: string;
}

function toAccount(row: AccountRow): Account {
  return {
    id: row.id,
    personId: row.person_id,
    username: row.username,
    passwordHash: row.password_hash,
    passwordIsTemporary: row.password_is_temporary === 1,
    temporaryPasswordExpiresAt: row.temporary_password_expires_at,
    role: row.role,
    active: row.active === 1,
    isProtected: row.is_protected === 1,
    accent: row.accent,
    language: row.language,
    createdAt: row.created_at,
  };
}

export function findAccount(db: Db, id: number): Account | null {
  const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as AccountRow | undefined;
  return row ? toAccount(row) : null;
}

export function findAccountByUsername(db: Db, username: string): Account | null {
  const row = db.prepare('SELECT * FROM accounts WHERE username = ?').get(username) as AccountRow | undefined;
  return row ? toAccount(row) : null;
}

export function findAccountByPerson(db: Db, personId: number): Account | null {
  const row = db.prepare('SELECT * FROM accounts WHERE person_id = ?').get(personId) as AccountRow | undefined;
  return row ? toAccount(row) : null;
}

export function listAccounts(db: Db): Account[] {
  const rows = db.prepare('SELECT * FROM accounts ORDER BY is_protected DESC, username').all() as unknown as AccountRow[];
  return rows.map(toAccount);
}

export function hasProtectedAccount(db: Db): boolean {
  return db.prepare('SELECT 1 FROM accounts WHERE is_protected = 1').get() !== undefined;
}

export function accountHasHistory(db: Db, accountId: number): boolean {
  const row = db
    .prepare(
      `SELECT EXISTS(SELECT 1 FROM readings WHERE recorded_by = ?) OR
              EXISTS(SELECT 1 FROM refuels WHERE recorded_by = ?) AS has_history`,
    )
    .get(accountId, accountId) as { has_history: number };
  return row.has_history === 1;
}
