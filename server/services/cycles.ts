import type {
  ActiveCycleDto,
  CycleDetailsDto,
  CycleSummaryDto,
  PersonRef,
  PersonShareDto,
  ReadingDto,
  RefuelDto,
  TransferDto,
} from '../../shared/api.ts';
import { averageRate, computeDistances, estimateShares, percentOf, settle, type Settlement } from '../../shared/settlement.ts';
import type { Db } from '../db/database.ts';
import { nowIso } from '../db/database.ts';
import { AppError } from '../lib/errors.ts';
import { correctionsForCycle, consumeCorrectionsSeen, logEvent, type Actor } from './activity.ts';

export interface Cycle {
  id: number;
  number: number;
  startOdometer: number;
  endOdometer: number | null;
  startedAt: string;
  endedAt: string | null;
  closed: boolean;
  cost: number | null;
  totalKm: number | null;
}

interface CycleRow {
  id: number;
  number: number;
  start_odometer: number;
  end_odometer: number | null;
  started_at: string;
  ended_at: string | null;
  closed: number;
  cost: number | null;
  total_km: number | null;
}

function toCycle(row: CycleRow): Cycle {
  return {
    id: row.id,
    number: row.number,
    startOdometer: row.start_odometer,
    endOdometer: row.end_odometer,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    closed: row.closed === 1,
    cost: row.cost,
    totalKm: row.total_km,
  };
}

export function findCycle(db: Db, id: number): Cycle | null {
  const row = db.prepare('SELECT * FROM cycles WHERE id = ?').get(id) as CycleRow | undefined;
  return row ? toCycle(row) : null;
}

export function getCycle(db: Db, id: number): Cycle {
  const cycle = findCycle(db, id);
  if (!cycle) throw new AppError('CYCLE_NOT_FOUND');
  return cycle;
}

export function findActiveCycle(db: Db): Cycle | null {
  const row = db.prepare('SELECT * FROM cycles WHERE closed = 0').get() as CycleRow | undefined;
  return row ? toCycle(row) : null;
}

export function getActiveCycle(db: Db): Cycle {
  const cycle = findActiveCycle(db);
  if (!cycle) throw new AppError('VEHICLE_SETUP_REQUIRED');
  return cycle;
}

export function findCycleByNumber(db: Db, number: number): Cycle | null {
  const row = db.prepare('SELECT * FROM cycles WHERE number = ?').get(number) as CycleRow | undefined;
  return row ? toCycle(row) : null;
}

export function listClosedCycles(db: Db): Cycle[] {
  const rows = db.prepare('SELECT * FROM cycles WHERE closed = 1 ORDER BY number').all() as unknown as CycleRow[];
  return rows.map(toCycle);
}

export function listAllCycles(db: Db): Cycle[] {
  const rows = db.prepare('SELECT * FROM cycles ORDER BY number DESC').all() as unknown as CycleRow[];
  return rows.map(toCycle);
}

export function isVehicleSetUp(db: Db): boolean {
  return db.prepare('SELECT 1 FROM cycles LIMIT 1').get() !== undefined;
}

// Readings

export interface ReadingRecord {
  id: number;
  cycleId: number;
  odometer: number;
  km: number;
  recordedAt: string;
  recordedByAccountId: number | null;
  recordedByName: string | null;
  participants: PersonRef[];
}

interface ReadingRow {
  id: number;
  cycle_id: number;
  odometer: number;
  recorded_at: string;
  recorded_by: number | null;
  recorder_first: string | null;
  recorder_last: string | null;
}

export function personRefs(db: Db, personIds: number[]): PersonRef[] {
  if (personIds.length === 0) return [];
  const rows = db
    .prepare(
      `SELECT p.id, p.first_name, p.last_name, a.username FROM persons p
       LEFT JOIN accounts a ON a.person_id = p.id
       WHERE p.id IN (${personIds.map(() => '?').join(',')})`,
    )
    .all(...personIds) as { id: number; first_name: string; last_name: string | null; username: string | null }[];
  const byId = new Map(rows.map((row) => [row.id, row]));
  return personIds
    .map((id) => byId.get(id))
    .filter((row) => row !== undefined)
    .map((row) => ({ id: row.id, firstName: row.first_name, lastName: row.last_name, username: row.username }));
}

export function personRef(db: Db, personId: number): PersonRef {
  return personRefs(db, [personId])[0] ?? { id: personId, firstName: '?', lastName: null, username: null };
}

export function loadReadings(db: Db, cycle: Cycle): ReadingRecord[] {
  const rows = db
    .prepare(
      `SELECT r.id, r.cycle_id, r.odometer, r.recorded_at, r.recorded_by,
              p.first_name AS recorder_first, p.last_name AS recorder_last
       FROM readings r
       LEFT JOIN accounts a ON a.id = r.recorded_by
       LEFT JOIN persons p ON p.id = a.person_id
       WHERE r.cycle_id = ? ORDER BY r.odometer`,
    )
    .all(cycle.id) as unknown as ReadingRow[];
  const participantRows = db
    .prepare(
      `SELECT rp.reading_id, rp.person_id FROM reading_participants rp
       JOIN readings r ON r.id = rp.reading_id WHERE r.cycle_id = ? ORDER BY rp.rowid`,
    )
    .all(cycle.id) as { reading_id: number; person_id: number }[];
  const refs = new Map(personRefs(db, [...new Set(participantRows.map((row) => row.person_id))]).map((ref) => [ref.id, ref]));
  const participantsByReading = new Map<number, PersonRef[]>();
  for (const row of participantRows) {
    const ref = refs.get(row.person_id);
    if (!ref) continue;
    const list = participantsByReading.get(row.reading_id) ?? [];
    list.push(ref);
    participantsByReading.set(row.reading_id, list);
  }
  let previous = cycle.startOdometer;
  return rows.map((row) => {
    const record: ReadingRecord = {
      id: row.id,
      cycleId: row.cycle_id,
      odometer: row.odometer,
      km: row.odometer - previous,
      recordedAt: row.recorded_at,
      recordedByAccountId: row.recorded_by,
      recordedByName: row.recorder_first ? [row.recorder_first, row.recorder_last].filter(Boolean).join(' ') : null,
      participants: participantsByReading.get(row.id) ?? [],
    };
    previous = row.odometer;
    return record;
  });
}

export function lastOdometer(db: Db, cycle: Cycle): number {
  const row = db.prepare('SELECT MAX(odometer) AS odometer FROM readings WHERE cycle_id = ?').get(cycle.id) as {
    odometer: number | null;
  };
  return row.odometer ?? cycle.startOdometer;
}

export function insertReading(
  db: Db,
  cycleId: number,
  odometer: number,
  participantIds: number[],
  recordedBy: number | null,
  recordedAt: string,
): number {
  const result = db
    .prepare('INSERT INTO readings (cycle_id, odometer, recorded_by, recorded_at) VALUES (?, ?, ?, ?)')
    .run(cycleId, odometer, recordedBy, recordedAt);
  const readingId = Number(result.lastInsertRowid);
  setParticipants(db, readingId, participantIds);
  return readingId;
}

export function setParticipants(db: Db, readingId: number, participantIds: number[]): void {
  db.prepare('DELETE FROM reading_participants WHERE reading_id = ?').run(readingId);
  const insert = db.prepare('INSERT INTO reading_participants (reading_id, person_id) VALUES (?, ?)');
  for (const personId of new Set(participantIds)) insert.run(readingId, personId);
}

// Refuels

export interface RefuelRecord {
  id: number;
  cycleId: number;
  amount: number;
  paidBy: number;
  odometer: number;
  isFull: boolean;
  closesCycle: boolean;
  recordedBy: number | null;
  recordedAt: string;
}

interface RefuelRow {
  id: number;
  cycle_id: number;
  amount: number;
  paid_by: number;
  odometer: number;
  is_full: number;
  closes_cycle: number;
  recorded_by: number | null;
  recorded_at: string;
}

function toRefuel(row: RefuelRow): RefuelRecord {
  return {
    id: row.id,
    cycleId: row.cycle_id,
    amount: row.amount,
    paidBy: row.paid_by,
    odometer: row.odometer,
    isFull: row.is_full === 1,
    closesCycle: row.closes_cycle === 1,
    recordedBy: row.recorded_by,
    recordedAt: row.recorded_at,
  };
}

export function loadRefuels(db: Db, cycleId: number): RefuelRecord[] {
  const rows = db
    .prepare('SELECT * FROM refuels WHERE cycle_id = ? ORDER BY recorded_at, id')
    .all(cycleId) as unknown as RefuelRow[];
  return rows.map(toRefuel);
}

export function findRefuel(db: Db, id: number): RefuelRecord | null {
  const row = db.prepare('SELECT * FROM refuels WHERE id = ?').get(id) as RefuelRow | undefined;
  return row ? toRefuel(row) : null;
}

// Settlement of a cycle

export function computeSettlement(readings: ReadingRecord[], refuels: RefuelRecord[]): Settlement {
  return settle(
    readings.map((reading) => ({ km: reading.km, participantIds: reading.participants.map((p) => p.id) })),
    refuels.map((refuel) => ({ amount: refuel.amount, paidBy: refuel.paidBy })),
  );
}

export function storeResults(db: Db, cycleId: number, settlement: Settlement): void {
  db.prepare('DELETE FROM cycle_shares WHERE cycle_id = ?').run(cycleId);
  db.prepare('DELETE FROM cycle_transfers WHERE cycle_id = ?').run(cycleId);
  const insertShare = db.prepare(
    'INSERT INTO cycle_shares (cycle_id, person_id, km, percent, share, paid, balance) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  for (const person of settlement.people) {
    insertShare.run(cycleId, person.personId, person.km, person.percent, person.share, person.paid, person.balance);
  }
  const insertTransfer = db.prepare('INSERT INTO cycle_transfers (cycle_id, from_person, to_person, amount) VALUES (?, ?, ?, ?)');
  for (const transfer of settlement.transfers) insertTransfer.run(cycleId, transfer.from, transfer.to, transfer.amount);
  db.prepare('UPDATE cycles SET cost = ?, total_km = ? WHERE id = ?').run(settlement.cost, settlement.totalKm, cycleId);
}

// Recalculates the stored results of a closed cycle after a correction.
export function recalculate(db: Db, cycleId: number): void {
  const cycle = getCycle(db, cycleId);
  if (!cycle.closed) return;
  storeResults(db, cycle.id, computeSettlement(loadReadings(db, cycle), loadRefuels(db, cycle.id)));
}

export function setupVehicle(db: Db, odometer: number, actor: Actor): Cycle {
  if (isVehicleSetUp(db)) throw new AppError('VEHICLE_SETUP_DONE');
  const result = db
    .prepare('INSERT INTO cycles (number, start_odometer, started_at, closed) VALUES (1, ?, ?, 0)')
    .run(odometer, nowIso());
  const cycleId = Number(result.lastInsertRowid);
  logEvent(db, { type: 'vehicle.setup', actor, cycleId, data: { odometer } });
  return getCycle(db, cycleId);
}

// Building API responses

export function toSummary(db: Db, cycle: Cycle): CycleSummaryDto {
  const corrected =
    db.prepare(`SELECT 1 FROM activity_log WHERE cycle_id = ? AND type LIKE 'correction.%' LIMIT 1`).get(cycle.id) !==
    undefined;
  return {
    id: cycle.id,
    number: cycle.number,
    startOdometer: cycle.startOdometer,
    endOdometer: cycle.endOdometer,
    startedAt: cycle.startedAt,
    endedAt: cycle.endedAt,
    closed: cycle.closed,
    cost: cycle.cost,
    totalKm: cycle.totalKm,
    corrected,
  };
}

export function toReadingDto(reading: ReadingRecord, canUndo = false): ReadingDto {
  return {
    id: reading.id,
    odometer: reading.odometer,
    km: reading.km,
    recordedAt: reading.recordedAt,
    recordedBy: reading.recordedByName,
    participants: reading.participants,
    canUndo,
  };
}

export function toRefuelDtos(db: Db, refuels: RefuelRecord[]): RefuelDto[] {
  const refs = new Map(personRefs(db, [...new Set(refuels.map((refuel) => refuel.paidBy))]).map((ref) => [ref.id, ref]));
  return refuels.map((refuel) => ({
    id: refuel.id,
    amount: refuel.amount,
    paidBy: refs.get(refuel.paidBy) ?? personRef(db, refuel.paidBy),
    odometer: refuel.odometer,
    isFull: refuel.isFull,
    closesCycle: refuel.closesCycle,
    recordedAt: refuel.recordedAt,
  }));
}

export function settlementPeople(db: Db, settlement: Settlement): PersonShareDto[] {
  const refs = new Map(personRefs(db, settlement.people.map((person) => person.personId)).map((ref) => [ref.id, ref]));
  return settlement.people.map((person) => ({
    person: refs.get(person.personId) ?? personRef(db, person.personId),
    km: person.km,
    percent: person.percent,
    share: person.share,
    paid: person.paid,
    balance: person.balance,
  }));
}

export function settlementTransfers(db: Db, transfers: Settlement['transfers']): TransferDto[] {
  return transfers.map((transfer) => ({
    from: personRef(db, transfer.from),
    to: personRef(db, transfer.to),
    amount: transfer.amount,
  }));
}

function storedPeople(db: Db, cycleId: number): PersonShareDto[] {
  const rows = db
    .prepare('SELECT * FROM cycle_shares WHERE cycle_id = ? ORDER BY km DESC, paid DESC, person_id')
    .all(cycleId) as { person_id: number; km: number; percent: number; share: number; paid: number; balance: number }[];
  const refs = new Map(personRefs(db, rows.map((row) => row.person_id)).map((ref) => [ref.id, ref]));
  return rows.map((row) => ({
    person: refs.get(row.person_id) ?? personRef(db, row.person_id),
    km: row.km,
    percent: row.percent,
    share: row.share,
    paid: row.paid,
    balance: row.balance,
  }));
}

function storedTransfers(db: Db, cycleId: number): TransferDto[] {
  const rows = db
    .prepare('SELECT from_person, to_person, amount FROM cycle_transfers WHERE cycle_id = ? ORDER BY id')
    .all(cycleId) as { from_person: number; to_person: number; amount: number }[];
  return rows.map((row) => ({ from: personRef(db, row.from_person), to: personRef(db, row.to_person), amount: row.amount }));
}

export function closedCycleRates(db: Db): { cost: number; km: number }[] {
  const rows = db
    .prepare('SELECT cost, total_km FROM cycles WHERE closed = 1 ORDER BY number DESC')
    .all() as { cost: number | null; total_km: number | null }[];
  return rows.map((row) => ({ cost: row.cost ?? 0, km: row.total_km ?? 0 }));
}

// The latest reading can be undone by the account that recorded it, unless a
// refuel was recorded at or after it.
function undoableReadingId(db: Db, cycle: Cycle, readings: ReadingRecord[], accountId: number | null): number | null {
  const latest = readings.at(-1);
  if (!latest || accountId === null || latest.recordedByAccountId !== accountId) return null;
  const refuelAfter = db
    .prepare('SELECT 1 FROM refuels WHERE cycle_id = ? AND (recorded_at >= ? OR odometer >= ?) LIMIT 1')
    .get(cycle.id, latest.recordedAt, latest.odometer);
  return refuelAfter ? null : latest.id;
}

export function buildActiveCycle(db: Db, viewer: { accountId: number | null }): ActiveCycleDto {
  const cycle = getActiveCycle(db);
  const readings = loadReadings(db, cycle);
  const refuels = loadRefuels(db, cycle.id);
  const settlement = computeSettlement(readings, refuels);
  const rate = averageRate(closedCycleRates(db));
  const distances = computeDistances(
    readings.map((reading) => ({ km: reading.km, participantIds: reading.participants.map((p) => p.id) })),
  );
  const estimates = rate ? estimateShares(distances, rate) : null;
  const undoable = undoableReadingId(db, cycle, readings, viewer.accountId);

  const people = settlementPeople(db, settlement).map((person) => {
    const estimate = estimates ? (estimates.get(person.person.id) ?? 0) : null;
    return {
      ...person,
      percent: percentOf(distances.units.get(person.person.id) ?? 0, distances.totalUnits),
      share: estimate,
      balance: estimate === null ? null : person.paid - estimate,
    };
  });

  const correctionsUnseen = viewer.accountId === null ? false : consumeCorrectionsSeen(db, viewer.accountId, cycle.id);
  return {
    cycle: toSummary(db, cycle),
    lastOdometer: readings.at(-1)?.odometer ?? cycle.startOdometer,
    lastReadingAt: readings.at(-1)?.recordedAt ?? null,
    totalKm: settlement.totalKm,
    refuelsTotal: settlement.cost,
    refuels: toRefuelDtos(db, refuels),
    people,
    rate,
    readings: readings.map((reading) => toReadingDto(reading, reading.id === undoable)).reverse(),
    corrections: correctionsForCycle(db, cycle.id),
    correctionsUnseen,
  };
}

export function buildCycleDetails(db: Db, cycle: Cycle, viewer: { accountId: number | null; markSeen: boolean }): CycleDetailsDto {
  const readings = loadReadings(db, cycle);
  const refuels = loadRefuels(db, cycle.id);
  const closedCount = (db.prepare('SELECT COUNT(*) AS count FROM cycles WHERE closed = 1').get() as { count: number }).count;
  let people: PersonShareDto[];
  let transfers: TransferDto[];
  if (cycle.closed) {
    people = storedPeople(db, cycle.id);
    transfers = storedTransfers(db, cycle.id);
  } else {
    const settlement = computeSettlement(readings, refuels);
    people = settlementPeople(db, settlement).map((person) => ({ ...person, share: null, balance: null }));
    transfers = [];
  }
  const correctionsUnseen =
    viewer.markSeen && viewer.accountId !== null ? consumeCorrectionsSeen(db, viewer.accountId, cycle.id) : false;
  return {
    cycle: toSummary(db, cycle),
    position: { index: cycle.number, total: cycle.closed ? closedCount : closedCount + 1 },
    refuels: toRefuelDtos(db, refuels),
    people,
    transfers,
    readings: readings.map((reading) => toReadingDto(reading)),
    corrections: correctionsForCycle(db, cycle.id),
    correctionsUnseen,
  };
}
