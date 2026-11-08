import {
  categoryPrefixesOf,
  type ActivityCategory,
  type ActivityData,
  type ActivityEntry,
  type ActivityType,
} from '../../shared/activity.ts';
import type { Db } from '../db/database.ts';
import { nowIso } from '../db/database.ts';

// Who performed an action. Null for events without a signed-in user, such as
// failed sign-in attempts.
export interface Actor {
  accountId: number;
  personId: number;
  name: string;
}

export interface LogEvent {
  type: ActivityType;
  actor: Actor | null;
  subjectPersonId?: number | null;
  cycleId?: number | null;
  data?: ActivityData;
}

export function logEvent(db: Db, event: LogEvent): number {
  const result = db
    .prepare(
      `INSERT INTO activity_log (occurred_at, type, actor_person_id, actor_name, subject_person_id, cycle_id, data)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      nowIso(),
      event.type,
      event.actor?.personId ?? null,
      event.actor?.name ?? null,
      event.subjectPersonId ?? null,
      event.cycleId ?? null,
      JSON.stringify(event.data ?? {}),
    );
  return Number(result.lastInsertRowid);
}

interface LogRow {
  id: number;
  occurred_at: string;
  type: ActivityType;
  actor_name: string | null;
  cycle_number: number | null;
  data: string;
}

function toEntry(row: LogRow): ActivityEntry {
  return {
    id: row.id,
    occurredAt: row.occurred_at,
    type: row.type,
    actorName: row.actor_name,
    cycleNumber: row.cycle_number,
    data: JSON.parse(row.data) as ActivityData,
  };
}

const SELECT_ENTRY = `SELECT l.id, l.occurred_at, l.type, l.actor_name, c.number AS cycle_number, l.data
  FROM activity_log l LEFT JOIN cycles c ON c.id = l.cycle_id`;

export interface ActivityFilter {
  personId?: number;
  category?: ActivityCategory;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export function listActivity(db: Db, filter: ActivityFilter): { entries: ActivityEntry[]; total: number } {
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  if (filter.personId !== undefined) {
    conditions.push('(l.actor_person_id = ? OR l.subject_person_id = ?)');
    params.push(filter.personId, filter.personId);
  }
  if (filter.category) {
    const prefixes = categoryPrefixesOf(filter.category);
    conditions.push(`(${prefixes.map(() => 'l.type LIKE ?').join(' OR ')})`);
    params.push(...prefixes.map((prefix) => `${prefix}%`));
  }
  if (filter.from) {
    conditions.push('l.occurred_at >= ?');
    params.push(filter.from);
  }
  if (filter.to) {
    conditions.push('l.occurred_at < ?');
    params.push(filter.to);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const pageSize = filter.pageSize ?? 50;
  const page = Math.max(1, filter.page ?? 1);
  const total = (db.prepare(`SELECT COUNT(*) AS count FROM activity_log l ${where}`).get(...params) as { count: number })
    .count;
  const rows = db
    .prepare(`${SELECT_ENTRY} ${where} ORDER BY l.id DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, (page - 1) * pageSize) as unknown as LogRow[];
  return { entries: rows.map(toEntry), total };
}

export function correctionsForCycle(db: Db, cycleId: number): ActivityEntry[] {
  const rows = db
    .prepare(`${SELECT_ENTRY} WHERE l.cycle_id = ? AND l.type LIKE 'correction.%' ORDER BY l.id DESC`)
    .all(cycleId) as unknown as LogRow[];
  return rows.map(toEntry);
}

// Returns whether the account hasn't seen the latest correction of the cycle,
// and records that it has seen it now.
export function consumeCorrectionsSeen(db: Db, accountId: number, cycleId: number): boolean {
  const latest = db
    .prepare(`SELECT MAX(id) AS id FROM activity_log WHERE cycle_id = ? AND type LIKE 'correction.%'`)
    .get(cycleId) as { id: number | null };
  if (latest.id === null) return false;
  const seen = db
    .prepare('SELECT last_seen_log_id FROM correction_seen WHERE account_id = ? AND cycle_id = ?')
    .get(accountId, cycleId) as { last_seen_log_id: number } | undefined;
  const unseen = !seen || seen.last_seen_log_id < latest.id;
  if (unseen) {
    db.prepare(
      `INSERT INTO correction_seen (account_id, cycle_id, last_seen_log_id) VALUES (?, ?, ?)
       ON CONFLICT(account_id, cycle_id) DO UPDATE SET last_seen_log_id = excluded.last_seen_log_id`,
    ).run(accountId, cycleId, latest.id);
  }
  return unseen;
}

// Whether the account has unseen corrections in cycles where its person took
// part, separately for the active cycle and for closed ones.
export function unseenCorrections(db: Db, accountId: number, personId: number): { active: boolean; history: boolean } {
  const rows = db
    .prepare(
      `SELECT c.closed AS closed
       FROM cycles c
       WHERE EXISTS (
           SELECT 1 FROM activity_log l
           WHERE l.cycle_id = c.id AND l.type LIKE 'correction.%'
             AND l.id > COALESCE((SELECT last_seen_log_id FROM correction_seen s WHERE s.account_id = ? AND s.cycle_id = c.id), 0)
         )
         AND (
           EXISTS (SELECT 1 FROM readings r JOIN reading_participants rp ON rp.reading_id = r.id
                   WHERE r.cycle_id = c.id AND rp.person_id = ?)
           OR EXISTS (SELECT 1 FROM refuels f WHERE f.cycle_id = c.id AND f.paid_by = ?)
           OR EXISTS (SELECT 1 FROM cycle_shares cs WHERE cs.cycle_id = c.id AND cs.person_id = ?)
         )`,
    )
    .all(accountId, personId, personId, personId) as { closed: number }[];
  return {
    active: rows.some((row) => row.closed === 0),
    history: rows.some((row) => row.closed === 1),
  };
}
