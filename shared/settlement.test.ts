import { describe, expect, it } from 'vitest';
import {
  allocate,
  averageRate,
  computeDistances,
  computeTransfers,
  estimateShares,
  percentOf,
  settle,
} from './settlement.ts';

const ANNA = 1;
const TOMEK = 2;
const KASIA = 3;
const MAREK = 4;

describe('settle', () => {
  it('matches the example from the functionality document', () => {
    const result = settle(
      [
        { km: 300, participantIds: [ANNA] },
        { km: 100, participantIds: [TOMEK] },
        { km: 200, participantIds: [TOMEK, KASIA] },
        { km: 100, participantIds: [ANNA] },
      ],
      [
        { amount: 10000, paidBy: TOMEK },
        { amount: 25000, paidBy: ANNA },
      ],
    );
    expect(result.cost).toBe(35000);
    expect(result.totalKm).toBe(700);
    const byId = new Map(result.people.map((p) => [p.personId, p]));
    expect(byId.get(ANNA)).toMatchObject({ km: 400, percent: 57.14, share: 20000, paid: 25000, balance: 5000 });
    expect(byId.get(TOMEK)).toMatchObject({ km: 200, percent: 28.57, share: 10000, paid: 10000, balance: 0 });
    expect(byId.get(KASIA)).toMatchObject({ km: 100, percent: 14.29, share: 5000, paid: 0, balance: -5000 });
    expect(result.transfers).toEqual([{ from: KASIA, to: ANNA, amount: 5000 }]);
  });

  it('splits a shared trip into exact fractions', () => {
    const result = settle([{ km: 100, participantIds: [ANNA, TOMEK, KASIA] }], [{ amount: 10000, paidBy: ANNA }]);
    const shares = result.people.map((p) => p.share);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(10000);
    expect([...shares].sort()).toEqual([3333, 3333, 3334]);
    for (const person of result.people) expect(person.km).toBeCloseTo(33.333, 3);
  });

  it('always makes shares add up to the cost', () => {
    const result = settle(
      [
        { km: 137, participantIds: [ANNA] },
        { km: 211, participantIds: [TOMEK, KASIA] },
        { km: 59, participantIds: [MAREK, ANNA, KASIA] },
      ],
      [{ amount: 31999, paidBy: MAREK }],
    );
    expect(result.people.reduce((sum, p) => sum + p.share, 0)).toBe(31999);
    expect(result.people.reduce((sum, p) => sum + p.balance, 0)).toBe(0);
  });

  it('includes a payer who did not drive', () => {
    const result = settle([{ km: 50, participantIds: [ANNA] }], [{ amount: 4000, paidBy: MAREK }]);
    const marek = result.people.find((p) => p.personId === MAREK);
    expect(marek).toMatchObject({ km: 0, share: 0, paid: 4000, balance: 4000 });
    expect(result.transfers).toEqual([{ from: ANNA, to: MAREK, amount: 4000 }]);
  });

  it('handles a cycle without distance', () => {
    const result = settle([], [{ amount: 5000, paidBy: ANNA }]);
    expect(result.totalUnits).toBe(0);
    expect(result.transfers).toEqual([]);
  });

  it('gives a single driver the whole cost', () => {
    const result = settle([{ km: 420, participantIds: [ANNA] }], [{ amount: 21999, paidBy: ANNA }]);
    expect(result.people).toHaveLength(1);
    expect(result.people[0]).toMatchObject({ share: 21999, balance: 0, percent: 100 });
    expect(result.transfers).toEqual([]);
  });
});

describe('computeDistances', () => {
  it('uses the least common multiple of participant counts', () => {
    const distances = computeDistances([
      { km: 120, participantIds: [ANNA, TOMEK] },
      { km: 90, participantIds: [ANNA, TOMEK, KASIA] },
    ]);
    expect(distances.denominator).toBe(6);
    expect(distances.totalUnits).toBe(210 * 6);
    expect(distances.units.get(ANNA)).toBe(60 * 6 + 30 * 6);
    expect(distances.units.get(KASIA)).toBe(30 * 6);
  });

  it('ignores duplicate participants', () => {
    const distances = computeDistances([{ km: 10, participantIds: [ANNA, ANNA] }]);
    expect(distances.units.get(ANNA)).toBe(10);
  });
});

describe('allocate', () => {
  it('gives remaining grosze to the largest remainders', () => {
    const result = allocate(100, new Map([[1, 1], [2, 1], [3, 1]]));
    expect([...result.values()].reduce((a, b) => a + b, 0)).toBe(100);
    expect(result.get(1)).toBe(34);
  });

  it('returns zeros when there is nothing to split', () => {
    expect([...allocate(500, new Map([[1, 0]])).values()]).toEqual([0]);
  });
});

describe('computeTransfers', () => {
  it('matches the largest debt with the largest credit', () => {
    const transfers = computeTransfers([
      { personId: 1, balance: 7000 },
      { personId: 2, balance: 1000 },
      { personId: 3, balance: -5000 },
      { personId: 4, balance: -3000 },
    ]);
    expect(transfers).toEqual([
      { from: 3, to: 1, amount: 5000 },
      { from: 4, to: 1, amount: 2000 },
      { from: 4, to: 2, amount: 1000 },
    ]);
  });
});

describe('percentOf', () => {
  it('rounds to 0.01', () => {
    expect(percentOf(1, 3)).toBe(33.33);
    expect(percentOf(0, 0)).toBe(0);
  });
});

describe('estimates', () => {
  it('averages the last three cycles with distance', () => {
    const rate = averageRate([
      { cost: 35000, km: 700 },
      { cost: 0, km: 0 },
      { cost: 33800, km: 650 },
      { cost: 31800, km: 600 },
      { cost: 99999, km: 10 },
    ]);
    expect(rate).toEqual({ cost: 100600, km: 1950 });
  });

  it('returns no rate without history', () => {
    expect(averageRate([])).toBeNull();
  });

  it('estimates shares at the given rate', () => {
    const distances = computeDistances([
      { km: 210, participantIds: [ANNA] },
      { km: 420, participantIds: [TOMEK] },
    ]);
    const estimate = estimateShares(distances, { cost: 5000, km: 100 });
    expect(estimate.get(ANNA)).toBe(10500);
    expect(estimate.get(TOMEK)).toBe(21000);
  });
});
