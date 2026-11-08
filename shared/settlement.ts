// Settlement logic: how distances, costs, balances and transfers are worked
// out for a cycle. Pure functions shared by the server and the frontends.

export interface ReadingInput {
  km: number;
  participantIds: number[];
}

export interface RefuelInput {
  amount: number;
  paidBy: number;
}

// Distances are exact fractions over a common denominator, so that a trip
// shared by three people still adds up to the whole distance.
export interface Distances {
  denominator: number;
  units: Map<number, number>;
  totalUnits: number;
}

export interface PersonResult {
  personId: number;
  distanceUnits: number;
  km: number;
  percent: number;
  share: number;
  paid: number;
  balance: number;
}

export interface Transfer {
  from: number;
  to: number;
  amount: number;
}

export interface Settlement {
  denominator: number;
  totalUnits: number;
  totalKm: number;
  cost: number;
  people: PersonResult[];
  transfers: Transfer[];
}

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

function lcm(a: number, b: number): number {
  return (a / gcd(a, b)) * b;
}

export function computeDistances(readings: ReadingInput[]): Distances {
  let denominator = 1;
  for (const reading of readings) {
    const count = new Set(reading.participantIds).size;
    if (count > 0) denominator = lcm(denominator, count);
  }
  const units = new Map<number, number>();
  let totalUnits = 0;
  for (const reading of readings) {
    const participants = [...new Set(reading.participantIds)];
    if (participants.length === 0 || reading.km <= 0) continue;
    const perPerson = reading.km * (denominator / participants.length);
    for (const personId of participants) {
      units.set(personId, (units.get(personId) ?? 0) + perPerson);
    }
    totalUnits += reading.km * denominator;
  }
  return { denominator, units, totalUnits };
}

// Splits a whole number of grosze in proportion to the weights. Each part is
// rounded down and the remaining grosze go to the largest remainders, so the
// parts always add up exactly to the total. Ties go to the larger weight,
// then to the lower id, so the result is deterministic.
export function allocate(total: number, weights: Map<number, number>): Map<number, number> {
  const result = new Map<number, number>();
  const ids = [...weights.keys()].sort((a, b) => a - b);
  const sum = ids.reduce((acc, id) => acc + BigInt(weights.get(id) ?? 0), 0n);
  if (sum === 0n || total === 0) {
    for (const id of ids) result.set(id, 0);
    return result;
  }
  const bigTotal = BigInt(total);
  const remainders: { id: number; remainder: bigint; weight: bigint }[] = [];
  let assigned = 0n;
  for (const id of ids) {
    const weight = BigInt(weights.get(id) ?? 0);
    const product = bigTotal * weight;
    const part = product / sum;
    result.set(id, Number(part));
    assigned += part;
    remainders.push({ id, remainder: product % sum, weight });
  }
  remainders.sort((a, b) => {
    if (a.remainder !== b.remainder) return a.remainder > b.remainder ? -1 : 1;
    if (a.weight !== b.weight) return a.weight > b.weight ? -1 : 1;
    return a.id - b.id;
  });
  let left = Number(bigTotal - assigned);
  for (const { id } of remainders) {
    if (left <= 0) break;
    result.set(id, (result.get(id) ?? 0) + 1);
    left--;
  }
  return result;
}

// Percentage of the total distance, rounded to 0.01. For display only.
export function percentOf(units: number, totalUnits: number): number {
  if (totalUnits <= 0) return 0;
  return Math.round((units * 10000) / totalUnits) / 100;
}

// Matches the largest debt with the largest credit until all balances are
// settled, which keeps the number of transfers small.
export function computeTransfers(balances: { personId: number; balance: number }[]): Transfer[] {
  const debtors = balances
    .filter((b) => b.balance < 0)
    .map((b) => ({ personId: b.personId, amount: -b.balance }));
  const creditors = balances
    .filter((b) => b.balance > 0)
    .map((b) => ({ personId: b.personId, amount: b.balance }));
  const byAmount = (a: { personId: number; amount: number }, b: { personId: number; amount: number }) =>
    b.amount - a.amount || a.personId - b.personId;
  const transfers: Transfer[] = [];
  while (debtors.length > 0 && creditors.length > 0) {
    debtors.sort(byAmount);
    creditors.sort(byAmount);
    const debtor = debtors[0]!;
    const creditor = creditors[0]!;
    const amount = Math.min(debtor.amount, creditor.amount);
    transfers.push({ from: debtor.personId, to: creditor.personId, amount });
    debtor.amount -= amount;
    creditor.amount -= amount;
    if (debtor.amount === 0) debtors.shift();
    if (creditor.amount === 0) creditors.shift();
  }
  return transfers;
}

export function settle(readings: ReadingInput[], refuels: RefuelInput[]): Settlement {
  const distances = computeDistances(readings);
  const cost = refuels.reduce((sum, refuel) => sum + refuel.amount, 0);
  const shares = allocate(cost, distances.units);

  const paid = new Map<number, number>();
  for (const refuel of refuels) paid.set(refuel.paidBy, (paid.get(refuel.paidBy) ?? 0) + refuel.amount);

  const personIds = [...new Set([...distances.units.keys(), ...paid.keys()])];
  const people = personIds.map((personId): PersonResult => {
    const distanceUnits = distances.units.get(personId) ?? 0;
    const share = shares.get(personId) ?? 0;
    const paidAmount = paid.get(personId) ?? 0;
    return {
      personId,
      distanceUnits,
      km: distanceUnits / distances.denominator,
      percent: percentOf(distanceUnits, distances.totalUnits),
      share,
      paid: paidAmount,
      balance: paidAmount - share,
    };
  });
  people.sort((a, b) => b.distanceUnits - a.distanceUnits || b.paid - a.paid || a.personId - b.personId);

  return {
    denominator: distances.denominator,
    totalUnits: distances.totalUnits,
    totalKm: distances.totalUnits / distances.denominator,
    cost,
    people,
    transfers: distances.totalUnits > 0 ? computeTransfers(people) : [],
  };
}

export interface CycleCost {
  cost: number;
  km: number;
}

// Average cost per kilometre of the last three closed cycles that had any
// distance, newest first in the input.
export function averageRate(closedCycles: CycleCost[]): CycleCost | null {
  const recent = closedCycles.filter((cycle) => cycle.km > 0).slice(0, 3);
  if (recent.length === 0) return null;
  return {
    cost: recent.reduce((sum, cycle) => sum + cycle.cost, 0),
    km: recent.reduce((sum, cycle) => sum + cycle.km, 0),
  };
}

// Estimated shares of the active cycle at the given rate.
export function estimateShares(distances: Distances, rate: CycleCost): Map<number, number> {
  if (rate.km <= 0 || distances.totalUnits <= 0) return allocate(0, distances.units);
  const estimatedTotal = Math.round((rate.cost * distances.totalUnits) / (rate.km * distances.denominator));
  return allocate(estimatedTotal, distances.units);
}
