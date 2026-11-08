import { describe, expect, it } from 'vitest';
import { hashPassword } from '../auth/passwords.ts';
import { ADMIN_PASSWORD, Browser, TEST_SETUP_CODE, completeSetup, createTestApp, errorCode } from '../test/helpers.ts';
import { nowIso } from '../db/database.ts';
import { createPerson } from '../services/persons.ts';
import type { Db } from '../db/database.ts';

async function addAccount(db: Db, username: string, password: string, options: { role?: string; temporary?: boolean; expiresAt?: string } = {}) {
  const person = createPerson(db, username, 'Test');
  db.prepare(
    `INSERT INTO accounts (person_id, username, password_hash, password_is_temporary, temporary_password_expires_at, role, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    person.id,
    username,
    await hashPassword(password),
    options.temporary ? 1 : 0,
    options.expiresAt ?? null,
    options.role ?? 'driver',
    nowIso(),
  );
}

describe('first start', () => {
  it('blocks the API until setup is complete', async () => {
    const { app } = await createTestApp();
    const browser = new Browser(app);
    expect((await browser.get('/api/status')).json()).toMatchObject({ setupRequired: true });
    const response = await browser.post('/api/auth/login', { username: 'admin', password: 'x' });
    expect(response.statusCode).toBe(503);
    expect(errorCode(response)).toBe('SETUP_REQUIRED');
  });

  it('rejects a wrong code and locks after too many attempts', async () => {
    const { app } = await createTestApp();
    const browser = new Browser(app);
    const payload = { code: 'WRONG', firstName: 'Jan', lastName: 'Z', password: ADMIN_PASSWORD, timeZone: 'Europe/Warsaw' };
    for (let i = 0; i < 10; i++) expect(errorCode(await browser.post('/api/setup', payload))).toBe('SETUP_CODE_INVALID');
    expect(errorCode(await browser.post('/api/setup', { ...payload, code: TEST_SETUP_CODE }))).toBe('TOO_MANY_ATTEMPTS');
  });

  it('creates the protected admin account and signs in to the panel', async () => {
    const { app } = await createTestApp();
    const browser = await completeSetup(app);
    const me = (await browser.get('/api/admin/me')).json();
    expect(me.account).toMatchObject({ username: 'admin', role: 'admin', isProtected: true });
    expect(me.person).toMatchObject({ firstName: 'Jan', lastName: 'Zieliński' });
    expect(me.timeZone).toBe('Europe/Warsaw');
    expect((await browser.get('/api/status')).json()).toMatchObject({ setupRequired: false });
    expect(errorCode(await browser.post('/api/setup', {}))).toBe('SETUP_ALREADY_DONE');
  });

  it('creates the protected account with the chosen username', async () => {
    const { app } = await createTestApp();
    const browser = new Browser(app);
    const payload = { code: TEST_SETUP_CODE, firstName: 'Jan', lastName: 'Zieliński', password: ADMIN_PASSWORD, timeZone: 'Europe/Warsaw' };
    expect(errorCode(await browser.post('/api/setup', { ...payload, username: 'ja' }))).toBe('USERNAME_INVALID');
    expect((await browser.get('/api/status')).json()).toMatchObject({ setupRequired: true });

    expect((await browser.post('/api/setup', { ...payload, username: ' Piotr ' })).statusCode).toBe(200);
    const me = (await browser.get('/api/admin/me')).json();
    expect(me.account).toMatchObject({ username: 'piotr', role: 'admin', isProtected: true });
    const signIn = new Browser(app);
    expect((await signIn.post('/api/auth/login', { username: 'admin', password: ADMIN_PASSWORD })).statusCode).toBe(401);
    expect((await signIn.post('/api/auth/login', { username: 'piotr', password: ADMIN_PASSWORD })).statusCode).toBe(200);
  });
});

describe('sign-in', () => {
  it('keeps the client and panel sessions separate', async () => {
    const { app } = await createTestApp();
    await completeSetup(app);
    const browser = new Browser(app);
    expect((await browser.post('/api/auth/login', { username: 'admin', password: ADMIN_PASSWORD })).statusCode).toBe(200);
    expect((await browser.get('/api/me')).statusCode).toBe(200);
    expect(errorCode(await browser.get('/api/admin/me'))).toBe('UNAUTHENTICATED');
    expect((await browser.post('/api/admin/auth/login', { username: 'admin', password: ADMIN_PASSWORD })).statusCode).toBe(200);
    await browser.post('/api/auth/logout');
    expect(errorCode(await browser.get('/api/me'))).toBe('UNAUTHENTICATED');
    expect((await browser.get('/api/admin/me')).statusCode).toBe(200);
  });

  it('refuses drivers in the panel', async () => {
    const { app, db } = await createTestApp();
    await completeSetup(app);
    await addAccount(db, 'anna', 'anna password');
    const browser = new Browser(app);
    expect(errorCode(await browser.post('/api/admin/auth/login', { username: 'anna', password: 'anna password' }))).toBe(
      'NOT_AN_ADMINISTRATOR',
    );
  });

  it('does not reveal whether a username exists', async () => {
    const { app } = await createTestApp();
    await completeSetup(app);
    const browser = new Browser(app);
    expect(errorCode(await browser.post('/api/auth/login', { username: 'nobody', password: 'whatever' }))).toBe(
      'INVALID_CREDENTIALS',
    );
    expect(errorCode(await browser.post('/api/auth/login', { username: 'admin', password: 'wrong' }))).toBe(
      'INVALID_CREDENTIALS',
    );
  });

  it('refuses attempts after the limit, even with the right password', async () => {
    const { app } = await createTestApp();
    await completeSetup(app);
    const browser = new Browser(app);
    for (let i = 0; i < 5; i++) await browser.post('/api/auth/login', { username: 'admin', password: 'wrong' });
    for (let i = 0; i < 5; i++) await browser.post('/api/admin/auth/login', { username: 'admin', password: 'wrong' });
    expect(errorCode(await browser.post('/api/auth/login', { username: 'admin', password: ADMIN_PASSWORD }))).toBe(
      'TOO_MANY_ATTEMPTS',
    );
  });

  it('requires changing a one-time password before anything else', async () => {
    const { app, db } = await createTestApp();
    await completeSetup(app);
    await addAccount(db, 'marek', 'Temp-Pass-0000', { temporary: true, expiresAt: '2999-01-01T00:00:00.000Z' });
    const browser = new Browser(app);
    const login = await browser.post('/api/auth/login', { username: 'marek', password: 'Temp-Pass-0000' });
    expect(login.json().account.mustChangePassword).toBe(true);
    expect(errorCode(await browser.get('/api/cycles/active'))).toBe('PASSWORD_CHANGE_REQUIRED');
    expect(errorCode(await browser.post('/api/me/password', { newPassword: 'Temp-Pass-0000' }))).toBe('PASSWORD_UNCHANGED');
    const changed = await browser.post('/api/me/password', { newPassword: 'my own password' });
    expect(changed.json().account.mustChangePassword).toBe(false);
    expect(errorCode(await browser.get('/api/cycles/active'))).toBe('VEHICLE_SETUP_REQUIRED');
  });

  it('refuses an expired one-time password', async () => {
    const { app, db } = await createTestApp();
    await completeSetup(app);
    await addAccount(db, 'ewa', 'Temp-Pass-1111', { temporary: true, expiresAt: '2000-01-01T00:00:00.000Z' });
    const browser = new Browser(app);
    expect(errorCode(await browser.post('/api/auth/login', { username: 'ewa', password: 'Temp-Pass-1111' }))).toBe(
      'TEMPORARY_PASSWORD_EXPIRED',
    );
  });

  it('ends other sessions after a password change', async () => {
    const { app } = await createTestApp();
    const panel = await completeSetup(app);
    const phone = new Browser(app);
    await phone.post('/api/auth/login', { username: 'admin', password: ADMIN_PASSWORD });
    const laptop = new Browser(app);
    await laptop.post('/api/auth/login', { username: 'admin', password: ADMIN_PASSWORD });
    expect(
      (await laptop.post('/api/me/password', { currentPassword: 'wrong', newPassword: 'new admin password' })).statusCode,
    ).toBe(400);
    const response = await laptop.post('/api/me/password', { currentPassword: ADMIN_PASSWORD, newPassword: 'new admin password' });
    expect(response.statusCode).toBe(200);
    expect((await laptop.get('/api/me')).statusCode).toBe(200);
    expect(errorCode(await phone.get('/api/me'))).toBe('UNAUTHENTICATED');
    expect(errorCode(await panel.get('/api/admin/me'))).toBe('UNAUTHENTICATED');
  });

  it('saves preferences', async () => {
    const { app } = await createTestApp();
    const browser = await completeSetup(app);
    const response = await browser.patch('/api/admin/me/preferences', { accent: 'purple', language: 'en' });
    expect(response.json().account).toMatchObject({ accent: 'purple', language: 'en' });
    expect(errorCode(await browser.patch('/api/admin/me/preferences', { accent: 'orange' }))).toBe('VALIDATION_FAILED');
  });
});
