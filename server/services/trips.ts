// Recording readings and refuels, and settling a cycle at a refuel to full.
import type { SettlementPreviewDto } from '../../shared/api.ts';
import { personName } from '../../shared/format.ts';
import type { Db } from '../db/database.ts';
import { nowIso, transaction } from '../db/database.ts';
import { AppError } from '../lib/errors.ts';
import { logEvent, type Actor } from './activity.ts';
import {
  buildCycleDetails,
  computeSettlement,
  getActiveCycle,
  getCycle,
  insertReading,
  lastOdometer,
  loadReadings,
  loadRefuels,
  personRefs,
  settlementPeople,
  settlementTransfers,
  storeResults,
  type Cycle,
  type ReadingRecord,
  type RefuelRecord,
} from './cycles.ts';
import { assertSelectable, getPerson } from './persons.ts';
import type { RefuelResultDto } from '../../shared/api.ts';

function participantNames(db: Db, personIds: number[]): string[] {
  return personRefs(db, personIds).map(personName);
}

function requireParticipants(participantIds: number[]): number[] {
  const unique = [...new Set(participantIds)];
  if (unique.length === 0) throw new AppError('PARTICIPANTS_REQUIRED');
  return unique;
}

export function addReading(db: Db, actor: Actor, odometer: number, participantIds: number[]): number {
  return transaction(db, () => {
    const cycle = getActiveCycle(db);
    const participants = requireParticipants(participantIds);
    assertSelectable(db, participants);
    const last = lastOdometer(db, cycle);
    if (odometer <= last) throw new AppError('ODOMETER_TOO_LOW', { last });
    const readingId = insertReading(db, cycle.id, odometer, participants, actor.accountId, nowIso());
    logEvent(db, {
      type: 'reading.created',
      actor,
      cycleId: cycle.id,
      data: { odometer, km: odometer - last, participants: participantNames(db, participants) },
    });
    return readingId;
  });
}

// A user can delete their own reading while it is the latest one in the
// active cycle and no refuel was recorded at or after it.
export function undoReading(db: Db, actor: Actor, readingId: number): void {
  transaction(db, () => {
    const cycle = getActiveCycle(db);
    const readings = loadReadings(db, cycle);
    const latest = readings.at(-1);
    if (!latest || latest.id !== readingId || latest.recordedByAccountId !== actor.accountId) {
      throw new AppError('READING_NOT_UNDOABLE');
    }
    const refuelAfter = db
      .prepare('SELECT 1 FROM refuels WHERE cycle_id = ? AND (recorded_at >= ? OR odometer >= ?) LIMIT 1')
      .get(cycle.id, latest.recordedAt, latest.odometer);
    if (refuelAfter) throw new AppError('READING_LOCKED_BY_REFUEL');
    db.prepare('DELETE FROM readings WHERE id = ?').run(readingId);
    logEvent(db, {
      type: 'reading.undone',
      actor,
      cycleId: cycle.id,
      data: { odometer: latest.odometer, km: latest.km, participants: latest.participants.map(personName) },
    });
  });
}

export interface RefuelInput {
  amount: number;
  odometer: number;
  paidBy: number;
  isFull: boolean;
  participantIds: number[];
}

interface PlannedRefuel {
  cycle: Cycle;
  last: number;
  readings: ReadingRecord[];
  refuels: RefuelRecord[];
  participants: number[];
  willClose: boolean;
}

// Works out what recording the refuel would do, including the reading added
// when the odometer has moved, without writing anything.
function planRefuel(db: Db, actor: Actor, input: RefuelInput): PlannedRefuel {
  const cycle = getActiveCycle(db);
  const last = lastOdometer(db, cycle);
  if (input.odometer < last) throw new AppError('ODOMETER_TOO_LOW', { last });
  getPerson(db, input.paidBy);
  assertSelectable(db, [input.paidBy]);

  const readings = loadReadings(db, cycle);
  let participants: number[] = [];
  if (input.odometer > last) {
    participants = requireParticipants(input.participantIds.length > 0 ? input.participantIds : [actor.personId]);
    assertSelectable(db, participants);
    readings.push({
      id: 0,
      cycleId: cycle.id,
      odometer: input.odometer,
      km: input.odometer - last,
      recordedAt: nowIso(),
      recordedByAccountId: actor.accountId,
      recordedByName: actor.name,
      participants: personRefs(db, participants),
    });
  }
  const refuels = loadRefuels(db, cycle.id);
  refuels.push({
    id: 0,
    cycleId: cycle.id,
    amount: input.amount,
    paidBy: input.paidBy,
    odometer: input.odometer,
    isFull: input.isFull,
    closesCycle: false,
    recordedBy: actor.accountId,
    recordedAt: nowIso(),
  });
  const totalKm = input.odometer - cycle.startOdometer;
  return { cycle, last, readings, refuels, participants, willClose: input.isFull && totalKm > 0 };
}

export function previewRefuel(db: Db, actor: Actor, input: RefuelInput): SettlementPreviewDto {
  const plan = planRefuel(db, actor, input);
  const settlement = computeSettlement(plan.readings, plan.refuels);
  return {
    willClose: plan.willClose,
    newReadingKm: input.odometer - plan.last,
    cost: settlement.cost,
    totalKm: settlement.totalKm,
    people: settlementPeople(db, settlement),
    transfers: settlementTransfers(db, settlement.transfers),
  };
}

export function recordRefuel(db: Db, actor: Actor, input: RefuelInput): RefuelResultDto {
  const closedCycleId = transaction(db, () => {
    const plan = planRefuel(db, actor, input);
    const now = nowIso();
    if (plan.participants.length > 0) {
      insertReading(db, plan.cycle.id, input.odometer, plan.participants, actor.accountId, now);
      logEvent(db, {
        type: 'reading.created',
        actor,
        cycleId: plan.cycle.id,
        data: {
          odometer: input.odometer,
          km: input.odometer - plan.last,
          participants: participantNames(db, plan.participants),
        },
      });
    }
    db.prepare(
      `INSERT INTO refuels (cycle_id, amount, paid_by, odometer, is_full, closes_cycle, recorded_by, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      plan.cycle.id,
      input.amount,
      input.paidBy,
      input.odometer,
      input.isFull ? 1 : 0,
      plan.willClose ? 1 : 0,
      actor.accountId,
      now,
    );
    logEvent(db, {
      type: 'refuel.created',
      actor,
      subjectPersonId: input.paidBy,
      cycleId: plan.cycle.id,
      data: {
        amount: input.amount,
        isFull: input.isFull,
        paidBy: personName(getPerson(db, input.paidBy)),
        odometer: input.odometer,
      },
    });
    if (!plan.willClose) return null;

    const settlement = computeSettlement(loadReadings(db, plan.cycle), loadRefuels(db, plan.cycle.id));
    db.prepare('UPDATE cycles SET closed = 1, end_odometer = ?, ended_at = ? WHERE id = ?').run(
      input.odometer,
      now,
      plan.cycle.id,
    );
    storeResults(db, plan.cycle.id, settlement);
    db.prepare('INSERT INTO cycles (number, start_odometer, started_at, closed) VALUES (?, ?, ?, 0)').run(
      plan.cycle.number + 1,
      input.odometer,
      now,
    );
    logEvent(db, {
      type: 'cycle.settled',
      actor,
      cycleId: plan.cycle.id,
      data: {
        cycleNumber: plan.cycle.number,
        cost: settlement.cost,
        km: settlement.totalKm,
        transfers: settlement.transfers.length,
      },
    });
    return plan.cycle.id;
  });

  if (closedCycleId === null) return { settled: false, cycle: null };
  return {
    settled: true,
    cycle: buildCycleDetails(db, getCycle(db, closedCycleId), { accountId: actor.accountId, markSeen: false }),
  };
}
