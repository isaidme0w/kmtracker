import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type Db = DatabaseSync;

export const DATABASE_FILE = 'kmtracker.db';

export function openDatabase(dataDir: string): Db {
  mkdirSync(dataDir, { recursive: true });
  return configure(new DatabaseSync(resolve(dataDir, DATABASE_FILE)));
}

export function openMemoryDatabase(): Db {
  return configure(new DatabaseSync(':memory:'));
}

function configure(db: Db): Db {
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  return db;
}

// Runs the function in a write transaction. Database calls are synchronous,
// so nothing else can run in between as long as the function doesn't await.
export function transaction<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}
