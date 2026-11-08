import { describe, expect, it } from 'vitest';
import { Browser, completeSetup, createTestApp, errorCode } from '../test/helpers.ts';

async function signedInDriver(app: Parameters<typeof completeSetup>[0], panel: Browser, username: string, firstName: string, lastName: string) {
  const created = (await panel.post('/api/admin/accounts', { username, firstName, lastName, role: 'driver' })).json();
  const browser = new Browser(app);
  await browser.post('/api/auth/login', { username, password: created.temporaryPassword });
  await browser.post('/api/me/password', { newPassword: `${username} password` });
  const me = (await browser.get('/api/me')).json();
  return { browser, personId: me.person.id as number };
}

describe('client API', () => {
  it('runs the core workflow with a shared trip and a person without an account', async () => {
    const { app } = await createTestApp();
    const panel = await completeSetup(app);
    const anna = await signedInDriver(app, panel, 'anna', 'Anna', 'Kowalska');
    const tomek = await signedInDriver(app, panel, 'tomek', 'Tomek', 'Nowak');

    expect((await anna.browser.get('/api/vehicle')).json()).toEqual({ setupDone: false, lastOdometer: null });
    expect((await anna.browser.post('/api/vehicle/setup', { odometer: '100 000' })).statusCode).toBe(200);
    expect(errorCode(await tomek.browser.post('/api/vehicle/setup', { odometer: 5 }))).toBe('VEHICLE_SETUP_DONE');

    const kasia = (await tomek.browser.post('/api/persons', { firstName: 'Kasia' })).json();
    expect(kasia).toMatchObject({ firstName: 'Kasia', lastName: null, username: null });

    await anna.browser.post('/api/readings', { odometer: 100300, participantIds: [anna.personId] });
    await tomek.browser.post('/api/refuels', {
      amount: '100,00',
      odometer: 100400,
      paidBy: tomek.personId,
      isFull: false,
      participantIds: [tomek.personId],
    });
    await tomek.browser.post('/api/readings', { odometer: 100600, participantIds: [tomek.personId, kasia.id] });

    const preview = (
      await anna.browser.post('/api/refuels/preview', {
        amount: '250',
        odometer: 100700,
        paidBy: anna.personId,
        isFull: true,
        participantIds: [anna.personId],
      })
    ).json();
    expect(preview).toMatchObject({ willClose: true, cost: 35000, totalKm: 700 });

    const result = (
      await anna.browser.post('/api/refuels', {
        amount: '250',
        odometer: 100700,
        paidBy: anna.personId,
        isFull: true,
        participantIds: [anna.personId],
      })
    ).json();
    expect(result.settled).toBe(true);
    expect(result.cycle.transfers).toEqual([
      { from: expect.objectContaining({ firstName: 'Kasia' }), to: expect.objectContaining({ username: 'anna' }), amount: 5000 },
    ]);

    const history = (await tomek.browser.get('/api/cycles')).json();
    expect(history).toHaveLength(1);
    const details = (await tomek.browser.get(`/api/cycles/${history[0].id}`)).json();
    expect(details.position).toEqual({ index: 1, total: 1 });
    expect(details.people.map((p: { share: number }) => p.share)).toEqual([20000, 10000, 5000]);

    const active = (await tomek.browser.get('/api/cycles/active')).json();
    expect(active.cycle.number).toBe(2);
    expect(active.lastOdometer).toBe(100700);
  });

  it('validates input', async () => {
    const { app } = await createTestApp();
    const panel = await completeSetup(app);
    const anna = await signedInDriver(app, panel, 'anna', 'Anna', 'Kowalska');
    await anna.browser.post('/api/vehicle/setup', { odometer: 1000 });
    expect(errorCode(await anna.browser.post('/api/readings', { odometer: 999, participantIds: [anna.personId] }))).toBe(
      'ODOMETER_TOO_LOW',
    );
    expect(errorCode(await anna.browser.post('/api/readings', { odometer: 1100, participantIds: [] }))).toBe(
      'PARTICIPANTS_REQUIRED',
    );
    expect(errorCode(await anna.browser.post('/api/readings', { odometer: 'abc', participantIds: [anna.personId] }))).toBe(
      'ODOMETER_INVALID',
    );
    expect(
      errorCode(
        await anna.browser.post('/api/refuels', { amount: '0', odometer: 1000, paidBy: anna.personId, isFull: false }),
      ),
    ).toBe('AMOUNT_INVALID');
  });

  it('flags unseen corrections until the cycle is opened', async () => {
    const { app } = await createTestApp();
    const panel = await completeSetup(app);
    const anna = await signedInDriver(app, panel, 'anna', 'Anna', 'Kowalska');
    await anna.browser.post('/api/vehicle/setup', { odometer: 1000 });
    await anna.browser.post('/api/readings', { odometer: 1100, participantIds: [anna.personId] });
    await anna.browser.post('/api/refuels', { amount: '50', odometer: 1100, paidBy: anna.personId, isFull: true });
    const [closed] = (await anna.browser.get('/api/cycles')).json();
    const cycle = (await panel.get(`/api/admin/cycles/${closed.id}`)).json();
    await panel.patch(`/api/admin/refuels/${cycle.refuels[0].id}`, { amount: '60' });

    expect((await anna.browser.get('/api/me')).json().unseenCorrections).toEqual({ active: false, history: true });
    const first = (await anna.browser.get(`/api/cycles/${closed.id}`)).json();
    expect(first.correctionsUnseen).toBe(true);
    expect(first.corrections[0]).toMatchObject({ type: 'correction.refuel_updated', actorName: 'Jan Zieliński' });
    expect((await anna.browser.get(`/api/cycles/${closed.id}`)).json().correctionsUnseen).toBe(false);
    expect((await anna.browser.get('/api/me')).json().unseenCorrections).toEqual({ active: false, history: false });
  });
});
