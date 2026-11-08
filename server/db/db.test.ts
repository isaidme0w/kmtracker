import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase, openMemoryDatabase } from './database.ts';
import { migrate } from './migrate.ts';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('migrations', () => {
  it('creates the schema on an empty database', () => {
    const db = openMemoryDatabase();
    const result = migrate(db, null);
    expect(result.applied).toEqual(['0001']);
    expect(result.backupFile).toBeNull();
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map(
      (row) => row.name,
    );
    expect(tables).toEqual(expect.arrayContaining(['accounts', 'persons', 'cycles', 'readings', 'refuels', 'activity_log']));
  });

  it('does nothing when everything is applied', () => {
    const db = openMemoryDatabase();
    migrate(db, null);
    expect(migrate(db, null).applied).toEqual([]);
  });

  it('backs up an existing database before applying new migrations', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kmtracker-'));
    dirs.push(dir);
    const db = openDatabase(dir);
    migrate(db, join(dir, 'backups'));
    // Pretend a later migration is pending by forgetting the first one was applied.
    db.exec("UPDATE schema_migrations SET version = '0000'");
    db.exec('DROP TABLE settings');
    db.exec("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    db.exec('DROP TABLE correction_seen');
    db.exec('DROP TABLE activity_log');
    db.exec('DROP TABLE cycle_transfers');
    db.exec('DROP TABLE cycle_shares');
    db.exec('DROP TABLE refuels');
    db.exec('DROP TABLE reading_participants');
    db.exec('DROP TABLE readings');
    db.exec('DROP TABLE cycles');
    db.exec('DROP TABLE login_attempts');
    db.exec('DROP TABLE sessions');
    db.exec('DROP TABLE accounts');
    db.exec('DROP TABLE persons');
    db.exec('DROP TABLE settings');
    const result = migrate(db, join(dir, 'backups'));
    expect(result.applied).toEqual(['0001']);
    expect(result.backupFile).toMatch(/kmtracker-schema-0000-.*\.db$/);
    expect(readdirSync(join(dir, 'backups'))).toHaveLength(1);
  });
});

describe('schema', () => {
  it('allows only one active cycle', () => {
    const db = openMemoryDatabase();
    migrate(db, null);
    const insert = db.prepare("INSERT INTO cycles (number, start_odometer, started_at, closed) VALUES (?, 1000, '2026-01-01', 0)");
    insert.run(1);
    expect(() => insert.run(2)).toThrow();
  });
});
