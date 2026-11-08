import { describe, expect, it } from 'vitest';
import { Browser, completeSetup, createTestApp, errorCode } from '../test/helpers.ts';

async function setupWithDriver() {
  const { app, db } = await createTestApp();
  const panel = await completeSetup(app);
  const created = (await panel.post('/api/admin/accounts', { username: 'anna', firstName: 'Anna', lastName: 'Kowalska', role: 'driver' })).json();
  const anna = new Browser(app);
  await anna.post('/api/auth/login', { username: 'anna', password: created.temporaryPassword });
  await anna.post('/api/me/password', { newPassword: 'anna password' });
  const annaPersonId = (await anna.get('/api/me')).json().person.id as number;
  return { app, db, panel, anna, annaPersonId };
}

describe('users', () => {
  it('creates accounts with a one-time password', async () => {
    const { panel } = await setupWithDriver();
    const result = (await panel.post('/api/admin/accounts', { username: 'Marek', firstName: 'Marek', lastName: 'W', role: 'driver' })).json();
    expect(result.username).toBe('marek');
    expect(result.temporaryPassword).toMatch(/^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);
    const accounts = (await panel.get('/api/admin/accounts')).json();
    expect(accounts.find((a: { username: string }) => a.username === 'marek').status).toBe('temporary');
    expect(errorCode(await panel.post('/api/admin/accounts', { username: 'marek', firstName: 'X', lastName: 'Y', role: 'driver' }))).toBe(
      'USERNAME_TAKEN',
    );
    expect(errorCode(await panel.post('/api/admin/accounts', { username: 'okay', firstName: 'X', lastName: '', role: 'driver' }))).toBe(
      'LAST_NAME_REQUIRED',
    );
  });

  it('protects the default account and the administrator’s own account', async () => {
    const { panel } = await setupWithDriver();
    const accounts = (await panel.get('/api/admin/accounts')).json() as { id: number; username: string }[];
    const admin = accounts.find((a) => a.username === 'admin')!;
    expect(errorCode(await panel.post(`/api/admin/accounts/${admin.id}/reset-password`))).toBe('ACCOUNT_PROTECTED');
    expect(errorCode(await panel.delete(`/api/admin/accounts/${admin.id}`))).toBe('ACCOUNT_PROTECTED');
    expect(errorCode(await panel.patch(`/api/admin/accounts/${admin.id}`, { role: 'driver' }))).toBe('ACCOUNT_PROTECTED');
    expect((await panel.patch(`/api/admin/accounts/${admin.id}`, { firstName: 'Janusz' })).statusCode).toBe(200);
  });

  it('ends sessions on reset, deactivation and role removal', async () => {
    const { app, panel, anna } = await setupWithDriver();
    const accounts = (await panel.get('/api/admin/accounts')).json() as { id: number; username: string }[];
    const annaId = accounts.find((a) => a.username === 'anna')!.id;

    await panel.patch(`/api/admin/accounts/${annaId}`, { role: 'admin' });
    const annaPanel = new Browser(app);
    expect((await annaPanel.post('/api/admin/auth/login', { username: 'anna', password: 'anna password' })).statusCode).toBe(200);
    await panel.patch(`/api/admin/accounts/${annaId}`, { role: 'driver' });
    expect(errorCode(await annaPanel.get('/api/admin/me'))).toBe('UNAUTHENTICATED');
    expect((await anna.get('/api/me')).statusCode).toBe(200);

    await panel.post(`/api/admin/accounts/${annaId}/deactivate`);
    expect(errorCode(await anna.get('/api/me'))).toBe('UNAUTHENTICATED');
    expect(errorCode(await anna.post('/api/auth/login', { username: 'anna', password: 'anna password' }))).toBe('INVALID_CREDENTIALS');
    await panel.post(`/api/admin/accounts/${annaId}/activate`);
    expect((await anna.post('/api/auth/login', { username: 'anna', password: 'anna password' })).statusCode).toBe(200);

    const reset = (await panel.post(`/api/admin/accounts/${annaId}/reset-password`)).json();
    expect(errorCode(await anna.get('/api/me'))).toBe('UNAUTHENTICATED');
    expect((await anna.post('/api/auth/login', { username: 'anna', password: reset.temporaryPassword })).json().account.mustChangePassword).toBe(
      true,
    );
  });

  it('refuses to delete an account with history', async () => {
    const { panel, anna, annaPersonId } = await setupWithDriver();
    await anna.post('/api/vehicle/setup', { odometer: 1000 });
    await anna.post('/api/readings', { odometer: 1100, participantIds: [annaPersonId] });
    const accounts = (await panel.get('/api/admin/accounts')).json() as { id: number; username: string }[];
    const annaId = accounts.find((a) => a.username === 'anna')!.id;
    expect(errorCode(await panel.delete(`/api/admin/accounts/${annaId}`))).toBe('ACCOUNT_HAS_HISTORY');
    const fresh = (await panel.post('/api/admin/accounts', { username: 'ewa', firstName: 'Ewa', lastName: 'D', role: 'driver' })).json();
    const ewaId = ((await panel.get('/api/admin/accounts')).json() as { id: number; username: string }[]).find((a) => a.username === fresh.username)!.id;
    expect((await panel.delete(`/api/admin/accounts/${ewaId}`)).statusCode).toBe(200);
  });
});

describe('people', () => {
  it('merges a duplicate into a person and recalculates closed cycles', async () => {
    const { panel, anna, annaPersonId } = await setupWithDriver();
    await anna.post('/api/vehicle/setup', { odometer: 1000 });
    const kasia = (await anna.post('/api/persons', { firstName: 'Kasia' })).json();
    const kaska = (await anna.post('/api/persons', { firstName: 'Kaśka' })).json();
    await anna.post('/api/readings', { odometer: 1100, participantIds: [kasia.id] });
    await anna.post('/api/readings', { odometer: 1200, participantIds: [kaska.id] });
    await anna.post('/api/refuels', { amount: '100', odometer: 1200, paidBy: annaPersonId, isFull: true });

    expect((await panel.post(`/api/admin/persons/${kaska.id}/merge`, { targetId: kasia.id })).statusCode).toBe(200);
    const [closed] = (await anna.get('/api/cycles')).json();
    const details = (await anna.get(`/api/cycles/${closed.id}`)).json();
    const shareOfKasia = details.people.find((p: { person: { id: number } }) => p.person.id === kasia.id);
    expect(shareOfKasia).toMatchObject({ km: 200, share: 10000, balance: -10000 });
    expect(details.transfers).toHaveLength(1);
  });

  it('protects people with accounts or history', async () => {
    const { panel, anna, annaPersonId } = await setupWithDriver();
    expect(errorCode(await panel.delete(`/api/admin/persons/${annaPersonId}`))).toBe('PERSON_HAS_ACCOUNT');
    const guest = (await anna.post('/api/persons', { firstName: 'Gość' })).json();
    expect((await panel.post(`/api/admin/persons/${guest.id}/deactivate`)).statusCode).toBe(200);
    const persons = (await anna.get('/api/persons')).json() as { id: number; selectable: boolean }[];
    expect(persons.find((p) => p.id === guest.id)!.selectable).toBe(false);
    expect((await panel.delete(`/api/admin/persons/${guest.id}`)).statusCode).toBe(200);
  });
});

describe('corrections', () => {
  async function closedCycle() {
    const context = await setupWithDriver();
    const { anna, annaPersonId } = context;
    await anna.post('/api/vehicle/setup', { odometer: 1000 });
    await anna.post('/api/readings', { odometer: 1100, participantIds: [annaPersonId] });
    const guest = (await anna.post('/api/persons', { firstName: 'Kasia' })).json();
    await anna.post('/api/readings', { odometer: 1300, participantIds: [guest.id] });
    await anna.post('/api/refuels', { amount: '150', odometer: 1300, paidBy: annaPersonId, isFull: true });
    const [summary] = (await anna.get('/api/cycles')).json();
    return { ...context, guestId: guest.id as number, cycleId: summary.id as number };
  }

  it('edits a reading and recalculates the cycle', async () => {
    const { panel, cycleId, guestId } = await closedCycle();
    const cycle = (await panel.get(`/api/admin/cycles/${cycleId}`)).json();
    const first = cycle.readings[0];
    expect(errorCode(await panel.patch(`/api/admin/readings/${first.id}`, { odometer: 1300 }))).toBe('ODOMETER_OUT_OF_RANGE');
    await panel.patch(`/api/admin/readings/${first.id}`, { odometer: 1200 });
    const after = (await panel.get(`/api/admin/cycles/${cycleId}`)).json();
    expect(after.people.find((p: { person: { id: number } }) => p.person.id === guestId)).toMatchObject({ km: 100, share: 5000 });
    expect(after.corrections[0].type).toBe('correction.reading_updated');
  });

  it('moves the boundary between cycles', async () => {
    const { panel, anna, annaPersonId, cycleId } = await closedCycle();
    const cycle = (await panel.get(`/api/admin/cycles/${cycleId}`)).json();
    const closing = cycle.readings.at(-1);
    await anna.post('/api/readings', { odometer: 1400, participantIds: [annaPersonId] });
    expect(errorCode(await panel.patch(`/api/admin/readings/${closing.id}`, { odometer: 1400 }))).toBe('ODOMETER_OUT_OF_RANGE');
    await panel.patch(`/api/admin/readings/${closing.id}`, { odometer: 1350 });
    const active = (await anna.get('/api/cycles/active')).json();
    expect(active.cycle.startOdometer).toBe(1350);
    expect(active.readings[0].km).toBe(50);
    expect((await panel.get(`/api/admin/cycles/${cycleId}`)).json().cycle).toMatchObject({ endOdometer: 1350, totalKm: 350 });
  });

  it('inserts and deletes readings and refuels', async () => {
    const { panel, cycleId, annaPersonId, guestId } = await closedCycle();
    const cycle = (await panel.get(`/api/admin/cycles/${cycleId}`)).json();
    const between = new Date((Date.parse(cycle.readings[0].recordedAt) + Date.parse(cycle.readings[1].recordedAt)) / 2).toISOString();
    expect(
      (await panel.post('/api/admin/readings', { cycleId, odometer: 1200, participantIds: [annaPersonId], recordedAt: between })).statusCode,
    ).toBe(200);
    let after = (await panel.get(`/api/admin/cycles/${cycleId}`)).json();
    expect(after.people.find((p: { person: { id: number } }) => p.person.id === guestId).km).toBe(100);

    expect(errorCode(await panel.delete(`/api/admin/readings/${after.readings.at(-1).id}`))).toBe('READING_IS_LAST_OF_CLOSED_CYCLE');
    await panel.post('/api/admin/refuels', { cycleId, amount: '30', paidBy: guestId, recordedAt: between });
    after = (await panel.get(`/api/admin/cycles/${cycleId}`)).json();
    expect(after.cycle.cost).toBe(18000);
    const closingRefuel = after.refuels.find((r: { closesCycle: boolean }) => r.closesCycle);
    expect(errorCode(await panel.delete(`/api/admin/refuels/${closingRefuel.id}`))).toBe('REFUEL_CLOSES_CYCLE');
    const added = after.refuels.find((r: { closesCycle: boolean }) => !r.closesCycle);
    await panel.delete(`/api/admin/refuels/${added.id}`);
    expect((await panel.get(`/api/admin/cycles/${cycleId}`)).json().cycle.cost).toBe(15000);
  });

  it('changes the starting odometer', async () => {
    const { panel, cycleId } = await closedCycle();
    expect(errorCode(await panel.patch('/api/admin/vehicle', { startOdometer: 1100 }))).toBe('ODOMETER_OUT_OF_RANGE');
    await panel.patch('/api/admin/vehicle', { startOdometer: 900 });
    expect((await panel.get(`/api/admin/cycles/${cycleId}`)).json().cycle).toMatchObject({ startOdometer: 900, totalKm: 400 });
  });

  it('undoes the latest settlement while the next cycle is empty', async () => {
    const { panel, anna, cycleId } = await closedCycle();
    expect((await panel.get(`/api/admin/cycles/${cycleId}`)).json().canUndoSettlement).toBe(true);
    await panel.post('/api/admin/cycles/undo-settlement');
    const active = (await anna.get('/api/cycles/active')).json();
    expect(active.cycle).toMatchObject({ id: cycleId, number: 1, closed: false });
    expect(active.refuels[0]).toMatchObject({ isFull: false, closesCycle: false });
    expect(errorCode(await panel.post('/api/admin/cycles/undo-settlement'))).toBe('UNDO_NOT_POSSIBLE');
  });
});

describe('panel data', () => {
  it('filters the activity log and changes the time zone', async () => {
    const { panel, anna, annaPersonId } = await setupWithDriver();
    await anna.post('/api/vehicle/setup', { odometer: 1000 });
    await anna.post('/api/readings', { odometer: 1100, participantIds: [annaPersonId] });
    const readings = (await panel.get('/api/admin/activity?category=reading')).json();
    expect(readings.entries.map((e: { type: string }) => e.type)).toEqual(['reading.created']);
    const byAnna = (await panel.get(`/api/admin/activity?personId=${annaPersonId}`)).json();
    expect(byAnna.entries.every((e: { actorName: string | null }) => e.actorName === 'Anna Kowalska' || e.actorName === 'Jan Zieliński')).toBe(true);

    expect(errorCode(await panel.patch('/api/admin/settings', { timeZone: 'Nowhere/City' }))).toBe('TIME_ZONE_INVALID');
    expect((await panel.patch('/api/admin/settings', { timeZone: 'Europe/London' })).json()).toEqual({ timeZone: 'Europe/London' });
    expect((await anna.get('/api/me')).json().timeZone).toBe('Europe/London');

    const overview = (await panel.get('/api/admin/overview')).json();
    expect(overview.activeCycle).toMatchObject({ number: 1, totalKm: 100, readingsCount: 1 });
    expect(overview.warnings).toEqual([]);
  });
});
