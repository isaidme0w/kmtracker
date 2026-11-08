import { personName } from '../../shared/format.ts';
import type { Db } from '../db/database.ts';
import { nowIso } from '../db/database.ts';
import { AppError } from '../lib/errors.ts';

export interface Person {
  id: number;
  firstName: string;
  lastName: string | null;
  active: boolean;
  createdAt: string;
}

interface PersonRow {
  id: number;
  first_name: string;
  last_name: string | null;
  active: number;
  created_at: string;
}

function toPerson(row: PersonRow): Person {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    active: row.active === 1,
    createdAt: row.created_at,
  };
}

export function findPerson(db: Db, id: number): Person | null {
  const row = db.prepare('SELECT * FROM persons WHERE id = ?').get(id) as PersonRow | undefined;
  return row ? toPerson(row) : null;
}

export function getPerson(db: Db, id: number): Person {
  const person = findPerson(db, id);
  if (!person) throw new AppError('PERSON_NOT_FOUND');
  return person;
}

export function nameOf(db: Db, personId: number): string {
  const person = findPerson(db, personId);
  return person ? personName(person) : '?';
}

export function createPerson(db: Db, firstName: string, lastName: string | null): Person {
  const result = db
    .prepare('INSERT INTO persons (first_name, last_name, active, created_at) VALUES (?, ?, 1, ?)')
    .run(firstName, lastName, nowIso());
  return getPerson(db, Number(result.lastInsertRowid));
}

export function updatePersonName(db: Db, id: number, firstName: string, lastName: string | null): void {
  db.prepare('UPDATE persons SET first_name = ?, last_name = ? WHERE id = ?').run(firstName, lastName, id);
}

export interface PersonListItem {
  id: number;
  firstName: string;
  lastName: string | null;
  username: string | null;
  active: boolean;
  accountActive: boolean | null;
}

export function listPersons(db: Db): PersonListItem[] {
  const rows = db
    .prepare(
      `SELECT p.id, p.first_name, p.last_name, p.active, a.username, a.active AS account_active
       FROM persons p LEFT JOIN accounts a ON a.person_id = p.id
       ORDER BY p.first_name COLLATE NOCASE, p.last_name COLLATE NOCASE, p.id`,
    )
    .all() as {
    id: number;
    first_name: string;
    last_name: string | null;
    active: number;
    username: string | null;
    account_active: number | null;
  }[];
  return rows.map((row) => ({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    username: row.username,
    active: row.active === 1,
    accountActive: row.account_active === null ? null : row.account_active === 1,
  }));
}

// A person can be chosen as a participant or payer when they are active and,
// if they have an account, the account is active.
export function isSelectable(item: PersonListItem): boolean {
  return item.active && item.accountActive !== false;
}

export function assertSelectable(db: Db, personIds: number[]): void {
  for (const id of personIds) {
    const row = db
      .prepare('SELECT p.active, a.active AS account_active FROM persons p LEFT JOIN accounts a ON a.person_id = p.id WHERE p.id = ?')
      .get(id) as { active: number; account_active: number | null } | undefined;
    if (!row) throw new AppError('PERSON_NOT_FOUND', { id });
    if (row.active !== 1 || row.account_active === 0) throw new AppError('PERSON_INACTIVE', { id });
  }
}

export function personHasHistory(db: Db, personId: number): boolean {
  const row = db
    .prepare(
      `SELECT
         EXISTS(SELECT 1 FROM reading_participants WHERE person_id = ?) OR
         EXISTS(SELECT 1 FROM refuels WHERE paid_by = ?) OR
         EXISTS(SELECT 1 FROM cycle_shares WHERE person_id = ?) OR
         EXISTS(SELECT 1 FROM cycle_transfers WHERE from_person = ? OR to_person = ?) AS has_history`,
    )
    .get(personId, personId, personId, personId, personId) as { has_history: number };
  return row.has_history === 1;
}

export function personHasAccount(db: Db, personId: number): boolean {
  return db.prepare('SELECT 1 FROM accounts WHERE person_id = ?').get(personId) !== undefined;
}
