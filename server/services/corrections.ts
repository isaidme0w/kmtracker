// Corrections of recorded data by administrators. Every correction
// recalculates the affected closed cycles and is recorded in the activity log.
import type { Changes } from '../../shared/activity.ts';
import { personName } from '../../shared/format.ts';
import type { Db } from '../db/database.ts';
import { nowIso, transaction } from '../db/database.ts';
import { AppError } from '../lib/errors.ts';
import { logEvent, type Actor } from './activity.ts';
import {
  findActiveCycle,
  findCycleByNumber,
  findRefuel,
  getCycle,
  insertReading as insertReadingRow,
  lastOdometer,
  loadReadings,
  personRefs,
  recalculate,
  setParticipants,
  type Cycle,
  type ReadingRecord,
} from './cycles.ts';
import { getPerson } from './persons.ts';

function names(db: Db, personIds: number[]): string[] {
  return personRefs(db, personIds).map(personName);
}

function requireExistingPersons(db: Db, personIds: number[]): number[] {
  const unique = [...new Set(personIds)];
  if (unique.length === 0) throw new AppError('PARTICIPANTS_REQUIRED');
  for (const id of unique) getPerson(db, id);
  return unique;
}

function findReading(db: Db, readingId: number): { cycle: Cycle; readings: ReadingRecord[]; index: number } {
  const row = db.prepare('SELECT cycle_id FROM readings WHERE id = ?').get(readingId) as { cycle_id: number } | undefined;
  if (!row) throw new AppError('READING_NOT_FOUND');
  const cycle = getCycle(db, row.cycle_id);
  const readings = loadReadings(db, cycle);
  return { cycle, readings, index: readings.findIndex((reading) => reading.id === readingId) };
}

function nextCycle(db: Db, cycle: Cycle): Cycle | null {
  return findCycleByNumber(db, cycle.number + 1);
}

// The lowest reading of the next cycle limits how far the end of a closed
// cycle can move.
function nextCycleFirstOdometer(db: Db, cycle: Cycle): number | null {
  const next = nextCycle(db, cycle);
  if (!next) return null;
  const row = db.prepare('SELECT MIN(odometer) AS odometer FROM readings WHERE cycle_id = ?').get(next.id) as {
    odometer: number | null;
  };
  return row.odometer;
}

function recalculateAround(db: Db, cycle: Cycle, includeNext: boolean): void {
  recalculate(db, cycle.id);
  if (includeNext) {
    const next = nextCycle(db, cycle);
    if (next) recalculate(db, next.id);
  }
}

export interface ReadingUpdate {
  odometer?: number;
  participantIds?: number[];
  recordedAt?: string;
}

export function updateReading(db: Db, actor: Actor, readingId: number, update: ReadingUpdate): void {
  transaction(db, () => {
    const { cycle, readings, index } = findReading(db, readingId);
    const reading = readings[index]!;
    const previous = readings[index - 1];
    const next = readings[index + 1];
    const isClosingReading = cycle.closed && !next;
    const changes: Changes = {};

    if (update.odometer !== undefined && update.odometer !== reading.odometer) {
      const lower = previous?.odometer ?? cycle.startOdometer;
      const upper = next?.odometer ?? (isClosingReading ? nextCycleFirstOdometer(db, cycle) : null);
      if (update.odometer <= lower || (upper !== null && update.odometer >= upper)) {
        throw new AppError('ODOMETER_OUT_OF_RANGE', { min: lower + 1, ...(upper !== null ? { max: upper - 1 } : {}) });
      }
      db.prepare('UPDATE readings SET odometer = ? WHERE id = ?').run(update.odometer, readingId);
      if (isClosingReading) {
        db.prepare('UPDATE cycles SET end_odometer = ? WHERE id = ?').run(update.odometer, cycle.id);
        db.prepare('UPDATE refuels SET odometer = ? WHERE cycle_id = ? AND closes_cycle = 1').run(update.odometer, cycle.id);
        const following = nextCycle(db, cycle);
        if (following) db.prepare('UPDATE cycles SET start_odometer = ? WHERE id = ?').run(update.odometer, following.id);
      }
      changes.odometer = { from: reading.odometer, to: update.odometer };
    }

    if (update.participantIds !== undefined) {
      const participants = requireExistingPersons(db, update.participantIds);
      const before = reading.participants.map((p) => p.id);
      const same = before.length === participants.length && before.every((id) => participants.includes(id));
      if (!same) {
        setParticipants(db, readingId, participants);
        changes.participants = { from: names(db, before), to: names(db, participants) };
      }
    }

    if (update.recordedAt !== undefined && update.recordedAt !== reading.recordedAt) {
      const earliest = previous?.recordedAt ?? cycle.startedAt;
      const latest = next?.recordedAt ?? (isClosingReading ? cycle.endedAt : nowIso());
      if (update.recordedAt < earliest || (latest !== null && update.recordedAt > latest)) {
        throw new AppError('DATE_OUT_OF_ORDER');
      }
      db.prepare('UPDATE readings SET recorded_at = ? WHERE id = ?').run(update.recordedAt, readingId);
      changes.recordedAt = { from: reading.recordedAt, to: update.recordedAt };
    }

    if (Object.keys(changes).length === 0) return;
    recalculateAround(db, cycle, isClosingReading && changes.odometer !== undefined);
    logEvent(db, {
      type: 'correction.reading_updated',
      actor,
      cycleId: cycle.id,
      data: { recordedAt: reading.recordedAt, odometer: reading.odometer, changes },
    });
  });
}

export interface ReadingInsert {
  cycleId: number;
  odometer: number;
  participantIds: number[];
  recordedAt: string;
}

export function insertReading(db: Db, actor: Actor, input: ReadingInsert): void {
  transaction(db, () => {
    const cycle = getCycle(db, input.cycleId);
    const participants = requireExistingPersons(db, input.participantIds);
    const readings = loadReadings(db, cycle);
    const upperLimit = cycle.closed ? cycle.endOdometer! : null;
    if (input.odometer <= cycle.startOdometer || (upperLimit !== null && input.odometer >= upperLimit)) {
      throw new AppError('ODOMETER_OUT_OF_RANGE');
    }
    if (readings.some((reading) => reading.odometer === input.odometer)) throw new AppError('ODOMETER_OUT_OF_RANGE');
    const previous = [...readings].reverse().find((reading) => reading.odometer < input.odometer);
    const next = readings.find((reading) => reading.odometer > input.odometer);
    const earliest = previous?.recordedAt ?? cycle.startedAt;
    const latest = next?.recordedAt ?? (cycle.closed ? cycle.endedAt : nowIso());
    if (input.recordedAt < earliest || (latest !== null && input.recordedAt > latest)) {
      throw new AppError('DATE_OUT_OF_ORDER');
    }
    insertReadingRow(db, cycle.id, input.odometer, participants, actor.accountId, input.recordedAt);
    recalculate(db, cycle.id);
    logEvent(db, {
      type: 'correction.reading_inserted',
      actor,
      cycleId: cycle.id,
      data: { odometer: input.odometer, participants: names(db, participants), recordedAt: input.recordedAt },
    });
  });
}

export function deleteReading(db: Db, actor: Actor, readingId: number): void {
  transaction(db, () => {
    const { cycle, readings, index } = findReading(db, readingId);
    const reading = readings[index]!;
    if (cycle.closed && index === readings.length - 1) throw new AppError('READING_IS_LAST_OF_CLOSED_CYCLE');
    db.prepare('DELETE FROM readings WHERE id = ?').run(readingId);
    recalculate(db, cycle.id);
    logEvent(db, {
      type: 'correction.reading_deleted',
      actor,
      cycleId: cycle.id,
      data: { odometer: reading.odometer, participants: reading.participants.map(personName), recordedAt: reading.recordedAt },
    });
  });
}

export interface RefuelUpdate {
  amount?: number;
  paidBy?: number;
  recordedAt?: string;
}

export function updateRefuel(db: Db, actor: Actor, refuelId: number, update: RefuelUpdate): void {
  transaction(db, () => {
    const refuel = findRefuel(db, refuelId);
    if (!refuel) throw new AppError('REFUEL_NOT_FOUND');
    const changes: Changes = {};
    if (update.amount !== undefined && update.amount !== refuel.amount) {
      db.prepare('UPDATE refuels SET amount = ? WHERE id = ?').run(update.amount, refuelId);
      changes.amount = { from: refuel.amount, to: update.amount };
    }
    if (update.paidBy !== undefined && update.paidBy !== refuel.paidBy) {
      const payer = getPerson(db, update.paidBy);
      db.prepare('UPDATE refuels SET paid_by = ? WHERE id = ?').run(update.paidBy, refuelId);
      changes.paidBy = { from: personName(getPerson(db, refuel.paidBy)), to: personName(payer) };
    }
    if (update.recordedAt !== undefined && update.recordedAt !== refuel.recordedAt) {
      db.prepare('UPDATE refuels SET recorded_at = ? WHERE id = ?').run(update.recordedAt, refuelId);
      changes.recordedAt = { from: refuel.recordedAt, to: update.recordedAt };
    }
    if (Object.keys(changes).length === 0) return;
    recalculate(db, refuel.cycleId);
    logEvent(db, {
      type: 'correction.refuel_updated',
      actor,
      cycleId: refuel.cycleId,
      data: { recordedAt: refuel.recordedAt, amount: refuel.amount, changes },
    });
  });
}

export interface RefuelAdd {
  cycleId: number;
  amount: number;
  paidBy: number;
  recordedAt: string;
}

export function addRefuel(db: Db, actor: Actor, input: RefuelAdd): void {
  transaction(db, () => {
    const cycle = getCycle(db, input.cycleId);
    const payer = getPerson(db, input.paidBy);
    const odometer = cycle.closed ? cycle.endOdometer! : lastOdometer(db, cycle);
    db.prepare(
      `INSERT INTO refuels (cycle_id, amount, paid_by, odometer, is_full, closes_cycle, recorded_by, recorded_at)
       VALUES (?, ?, ?, ?, 0, 0, ?, ?)`,
    ).run(cycle.id, input.amount, input.paidBy, odometer, actor.accountId, input.recordedAt);
    recalculate(db, cycle.id);
    logEvent(db, {
      type: 'correction.refuel_added',
      actor,
      cycleId: cycle.id,
      data: { amount: input.amount, paidBy: personName(payer), recordedAt: input.recordedAt },
    });
  });
}

export function deleteRefuel(db: Db, actor: Actor, refuelId: number): void {
  transaction(db, () => {
    const refuel = findRefuel(db, refuelId);
    if (!refuel) throw new AppError('REFUEL_NOT_FOUND');
    if (refuel.closesCycle) throw new AppError('REFUEL_CLOSES_CYCLE');
    db.prepare('DELETE FROM refuels WHERE id = ?').run(refuelId);
    recalculate(db, refuel.cycleId);
    logEvent(db, {
      type: 'correction.refuel_deleted',
      actor,
      cycleId: refuel.cycleId,
      data: { amount: refuel.amount, paidBy: personName(getPerson(db, refuel.paidBy)), recordedAt: refuel.recordedAt },
    });
  });
}

export function updateStartOdometer(db: Db, actor: Actor, odometer: number): void {
  transaction(db, () => {
    const first = findCycleByNumber(db, 1);
    if (!first) throw new AppError('VEHICLE_SETUP_REQUIRED');
    if (odometer === first.startOdometer) return;
    const readings = loadReadings(db, first);
    const upper = readings[0]?.odometer ?? null;
    if (upper !== null && odometer >= upper) throw new AppError('ODOMETER_OUT_OF_RANGE', { max: upper - 1 });
    db.prepare('UPDATE cycles SET start_odometer = ? WHERE id = ?').run(odometer, first.id);
    recalculate(db, first.id);
    logEvent(db, { type: 'correction.start_odometer', actor, cycleId: first.id, data: { from: first.startOdometer, to: odometer } });
  });
}

export function latestClosedCycle(db: Db): Cycle | null {
  const row = db.prepare('SELECT id FROM cycles WHERE closed = 1 ORDER BY number DESC LIMIT 1').get() as { id: number } | undefined;
  return row ? getCycle(db, row.id) : null;
}

// The latest settlement can be undone while the cycle after it is still empty.
export function canUndoSettlement(db: Db): boolean {
  const latest = latestClosedCycle(db);
  const active = findActiveCycle(db);
  if (!latest || !active || active.number !== latest.number + 1) return false;
  const used = db
    .prepare('SELECT EXISTS(SELECT 1 FROM readings WHERE cycle_id = ?) OR EXISTS(SELECT 1 FROM refuels WHERE cycle_id = ?) AS used')
    .get(active.id, active.id) as { used: number };
  return used.used === 0;
}

export function undoSettlement(db: Db, actor: Actor): void {
  transaction(db, () => {
    if (!canUndoSettlement(db)) throw new AppError('UNDO_NOT_POSSIBLE');
    const latest = latestClosedCycle(db)!;
    const active = findActiveCycle(db)!;
    db.prepare('DELETE FROM cycles WHERE id = ?').run(active.id);
    db.prepare('DELETE FROM cycle_shares WHERE cycle_id = ?').run(latest.id);
    db.prepare('DELETE FROM cycle_transfers WHERE cycle_id = ?').run(latest.id);
    db.prepare(
      'UPDATE cycles SET closed = 0, end_odometer = NULL, ended_at = NULL, cost = NULL, total_km = NULL WHERE id = ?',
    ).run(latest.id);
    db.prepare('UPDATE refuels SET closes_cycle = 0, is_full = 0 WHERE cycle_id = ? AND closes_cycle = 1').run(latest.id);
    logEvent(db, { type: 'correction.settlement_undone', actor, cycleId: latest.id, data: { cycleNumber: latest.number } });
  });
}
