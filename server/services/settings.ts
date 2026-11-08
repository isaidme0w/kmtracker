import { DEFAULT_TIME_ZONE } from '../../shared/preferences.ts';
import type { Db } from '../db/database.ts';

export function getSetting(db: Db, key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(db: Db, key: string, value: string): void {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    value,
  );
}

export function getTimeZone(db: Db): string {
  return getSetting(db, 'time_zone') ?? DEFAULT_TIME_ZONE;
}
