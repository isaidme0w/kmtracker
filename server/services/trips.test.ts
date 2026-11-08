import { describe, expect, it } from 'vitest';
import { createTestDb, insertAccount } from '../test/helpers.ts';
import { buildActiveCycle, buildCycleDetails, findCycleByNumber, setupVehicle } from './cycles.ts';
import { createPerson } from './persons.ts';
import { addReading, previewRefuel, recordRefuel, undoReading } from './trips.ts';

function setup() {
  const db = createTestDb();
  const anna = insertAccount(db, 'anna', 'Anna', 'Kowalska');
  const tomek = insertAccount(db, 'tomek', 'Tomek', 'Nowak');
  const kasia = createPerson(db, 'Kasia', null);
  setupVehicle(db, 100000, anna);
  return { db, anna, tomek, kasia };
}

describe('core workflow', () => {
  it('settles the example from the functionality document', () => {
    const { db, anna, tomek, kasia } = setup();
    addReading(db, anna, 100300, [anna.personId]);
    expect(
      recordRefuel(db, tomek, { amount: 10000, odometer: 100400, paidBy: tomek.personId, isFull: false, participantIds: [] }),
    ).toEqual({ settled: false, cycle: null });
    addReading(db, tomek, 100600, [tomek.personId, kasia.id]);

    const preview = previewRefuel(db, anna, {
      amount: 25000,
      odometer: 100700,
      paidBy: anna.personId,
      isFull: true,
      participantIds: [],
    });
    expect(preview).toMatchObject({ willClose: true, newReadingKm: 100, cost: 35000, totalKm: 700 });

    const result = recordRefuel(db, anna, {
      amount: 25000,
      odometer: 100700,
      paidBy: anna.personId,
      isFull: true,
      participantIds: [],
    });
    expect(result.settled).toBe(true);
    const details = result.cycle!;
    expect(details.cycle).toMatchObject({ number: 1, closed: true, cost: 35000, totalKm: 700, endOdometer: 100700 });
    expect(details.people.map((p) => [p.person.firstName, p.km, p.share, p.balance])).toEqual([
      ['Anna', 400, 20000, 5000],
      ['Tomek', 200, 10000, 0],
      ['Kasia', 100, 5000, -5000],
    ]);
    expect(details.transfers.map((t) => [t.from.firstName, t.to.firstName, t.amount])).toEqual([['Kasia', 'Anna', 5000]]);

    const active = buildActiveCycle(db, { accountId: anna.accountId });
    expect(active.cycle).toMatchObject({ number: 2, startOdometer: 100700, closed: false });
    expect(active.rate).toEqual({ cost: 35000, km: 700 });
  });

  it('rejects a reading that is not higher than the last one', () => {
    const { db, anna } = setup();
    addReading(db, anna, 100300, [anna.personId]);
    expect(() => addReading(db, anna, 100300, [anna.personId])).toThrow('ODOMETER_TOO_LOW');
  });

  it('keeps the cycle open after a refuel to full without distance', () => {
    const { db, anna } = setup();
    const result = recordRefuel(db, anna, { amount: 5000, odometer: 100000, paidBy: anna.personId, isFull: true, participantIds: [] });
    expect(result.settled).toBe(false);
    const active = buildActiveCycle(db, { accountId: anna.accountId });
    expect(active.cycle.number).toBe(1);
    expect(active.refuelsTotal).toBe(5000);
  });

  it('estimates shares from previous cycles', () => {
    const { db, anna, tomek } = setup();
    addReading(db, anna, 100500, [anna.personId]);
    recordRefuel(db, anna, { amount: 25000, odometer: 100500, paidBy: anna.personId, isFull: true, participantIds: [] });
    addReading(db, tomek, 100600, [tomek.personId]);
    const active = buildActiveCycle(db, { accountId: tomek.accountId });
    expect(active.people[0]).toMatchObject({ km: 100, share: 5000, percent: 100 });
  });

  it('lets a user undo only their own latest reading', () => {
    const { db, anna, tomek } = setup();
    addReading(db, anna, 100100, [anna.personId]);
    const second = addReading(db, tomek, 100200, [tomek.personId]);
    expect(() => undoReading(db, anna, second)).toThrow('READING_NOT_UNDOABLE');
    const active = buildActiveCycle(db, { accountId: tomek.accountId });
    expect(active.readings[0]).toMatchObject({ id: second, canUndo: true });
    undoReading(db, tomek, second);
    expect(buildActiveCycle(db, { accountId: tomek.accountId }).lastOdometer).toBe(100100);
  });

  it('locks a reading recorded together with a refuel', () => {
    const { db, anna } = setup();
    recordRefuel(db, anna, { amount: 5000, odometer: 100100, paidBy: anna.personId, isFull: false, participantIds: [] });
    const active = buildActiveCycle(db, { accountId: anna.accountId });
    expect(active.readings[0]!.canUndo).toBe(false);
    expect(() => undoReading(db, anna, active.readings[0]!.id)).toThrow('READING_LOCKED_BY_REFUEL');
  });

  it('shows the history of a closed cycle', () => {
    const { db, anna } = setup();
    addReading(db, anna, 100100, [anna.personId]);
    recordRefuel(db, anna, { amount: 5000, odometer: 100100, paidBy: anna.personId, isFull: true, participantIds: [] });
    const details = buildCycleDetails(db, findCycleByNumber(db, 1)!, { accountId: anna.accountId, markSeen: true });
    expect(details.position).toEqual({ index: 1, total: 1 });
    expect(details.readings).toHaveLength(1);
  });
});
