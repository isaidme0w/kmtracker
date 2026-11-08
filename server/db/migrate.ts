import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { transaction, type Db } from './database.ts';

const migrationsDir = resolve(import.meta.dirname, 'migrations');

export interface MigrationResult {
  applied: string[];
  backupFile: string | null;
}

function listMigrations(): { version: string; file: string }[] {
  return readdirSync(migrationsDir)
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .sort()
    .map((file) => ({ version: file.slice(0, 4), file }));
}

function timestamp(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
}

// Applies pending migrations in order. Before changing a database that
// already has migrations applied, copies it to <backupDir>.
export function migrate(db: Db, backupDir: string | null): MigrationResult {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const appliedRows = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as { version: string }[];
  const applied = new Set(appliedRows.map((row) => row.version));
  const pending = listMigrations().filter((migration) => !applied.has(migration.version));
  if (pending.length === 0) return { applied: [], backupFile: null };

  let backupFile: string | null = null;
  if (applied.size > 0 && backupDir) {
    mkdirSync(backupDir, { recursive: true });
    const current = appliedRows.at(-1)!.version;
    backupFile = resolve(backupDir, `kmtracker-schema-${current}-${timestamp()}.db`);
    db.prepare('VACUUM INTO ?').run(backupFile);
  }

  for (const migration of pending) {
    const sql = readFileSync(resolve(migrationsDir, migration.file), 'utf8');
    transaction(db, () => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
        migration.version,
        new Date().toISOString(),
      );
    });
  }
  return { applied: pending.map((migration) => migration.version), backupFile };
}
