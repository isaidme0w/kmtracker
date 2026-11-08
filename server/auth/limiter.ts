import type { Db } from '../db/database.ts';
import { nowIso } from '../db/database.ts';

export const MAX_ATTEMPTS = 10;
export const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

function windowStart(): string {
  return new Date(Date.now() - ATTEMPT_WINDOW_MS).toISOString();
}

// Sign-in attempts are counted per username across both sign-in pages.
export function isBlocked(db: Db, username: string): boolean {
  const row = db
    .prepare('SELECT COUNT(*) AS count FROM login_attempts WHERE username = ? AND attempted_at > ?')
    .get(username, windowStart()) as { count: number };
  return row.count >= MAX_ATTEMPTS;
}

export function recordFailedAttempt(db: Db, username: string): void {
  db.prepare('INSERT INTO login_attempts (username, attempted_at) VALUES (?, ?)').run(username, nowIso());
  db.prepare('DELETE FROM login_attempts WHERE attempted_at <= ?').run(windowStart());
}

export function resetAttempts(db: Db, username: string): void {
  db.prepare('DELETE FROM login_attempts WHERE username = ?').run(username);
}

// The same limit for the setup code, kept in memory because the code itself
// only lives in memory.
export class MemoryLimiter {
  private failures: number[] = [];

  isBlocked(now = Date.now()): boolean {
    this.failures = this.failures.filter((time) => time > now - ATTEMPT_WINDOW_MS);
    return this.failures.length >= MAX_ATTEMPTS;
  }

  recordFailure(now = Date.now()): void {
    this.failures.push(now);
  }
}
