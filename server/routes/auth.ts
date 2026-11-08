import type { FastifyInstance } from 'fastify';
import { isAccent, isLanguage } from '../../shared/preferences.ts';
import { normalizeUsername, validatePassword } from '../../shared/validation.ts';
import { transaction } from '../db/database.ts';
import { isBlocked, recordFailedAttempt, resetAttempts } from '../auth/limiter.ts';
import { hashPassword, verifyAgainstDummy, verifyPassword } from '../auth/passwords.ts';
import {
  SESSION_COOKIES,
  createSession,
  deleteAccountSessions,
  deleteSession,
  findSession,
  type SessionKind,
} from '../auth/sessions.ts';
import { AppError } from '../lib/errors.ts';
import { findAccount, findAccountByUsername } from '../services/accounts.ts';
import { logEvent } from '../services/activity.ts';
import {
  actorFor,
  authOf,
  bodyOf,
  buildMe,
  clearSessionCookie,
  optionalStr,
  setSessionCookie,
  str,
  type AppContext,
} from './context.ts';

// Sign-in and sign-out, available without a session.
export function registerLoginRoutes(api: FastifyInstance, ctx: AppContext, kind: SessionKind): void {
  const { db } = ctx;

  api.post('/auth/login', async (request, reply) => {
    const body = bodyOf(request);
    const username = normalizeUsername(str(body, 'username'));
    const password = str(body, 'password');

    if (isBlocked(db, username)) {
      logEvent(db, { type: 'auth.login_blocked', actor: null, data: { username, part: kind } });
      throw new AppError('TOO_MANY_ATTEMPTS');
    }

    const account = findAccountByUsername(db, username);
    const valid = account && account.active ? await verifyPassword(password, account.passwordHash) : false;
    if (!account || !account.active) await verifyAgainstDummy(password);
    if (!account || !valid) {
      recordFailedAttempt(db, username);
      logEvent(db, {
        type: 'auth.login_failed',
        actor: null,
        subjectPersonId: account?.personId ?? null,
        data: { username, part: kind },
      });
      throw new AppError('INVALID_CREDENTIALS');
    }
    if (account.passwordIsTemporary && account.temporaryPasswordExpiresAt && account.temporaryPasswordExpiresAt <= new Date().toISOString()) {
      throw new AppError('TEMPORARY_PASSWORD_EXPIRED');
    }
    if (kind === 'admin' && account.role !== 'admin') throw new AppError('NOT_AN_ADMINISTRATOR');

    resetAttempts(db, username);
    const { token } = createSession(db, account.id, kind);
    logEvent(db, { type: 'auth.login', actor: actorFor(db, account), data: { part: kind } });
    setSessionCookie(reply, ctx, kind, token);
    return buildMe(db, account);
  });

  api.post('/auth/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIES[kind]];
    const found = token ? findSession(db, token, kind) : null;
    if (found) deleteSession(db, found.session.id);
    clearSessionCookie(reply, kind);
    return { ok: true };
  });
}

// The signed-in user's own account: details, password, and preferences.
export function registerAccountRoutes(api: FastifyInstance, ctx: AppContext): void {
  const { db } = ctx;

  api.get('/me', { config: { allowTemporaryPassword: true } }, async (request) => {
    return buildMe(db, authOf(request).account);
  });

  api.post('/me/password', { config: { allowTemporaryPassword: true } }, async (request) => {
    const auth = authOf(request);
    const body = bodyOf(request);
    const newPassword = validatePassword(str(body, 'newPassword'));
    const account = auth.account;
    if (!account.passwordIsTemporary) {
      const current = optionalStr(body, 'currentPassword') ?? '';
      if (!(await verifyPassword(current, account.passwordHash))) throw new AppError('CURRENT_PASSWORD_INVALID');
    }
    if (await verifyPassword(newPassword, account.passwordHash)) throw new AppError('PASSWORD_UNCHANGED');
    const hash = await hashPassword(newPassword);
    transaction(db, () => {
      db.prepare(
        'UPDATE accounts SET password_hash = ?, password_is_temporary = 0, temporary_password_expires_at = NULL WHERE id = ?',
      ).run(hash, account.id);
      deleteAccountSessions(db, account.id, { exceptSessionId: auth.session.id });
      logEvent(db, { type: 'auth.password_changed', actor: auth.actor, subjectPersonId: account.personId });
    });
    return buildMe(db, findAccount(db, account.id)!);
  });

  api.patch('/me/preferences', async (request) => {
    const auth = authOf(request);
    const body = bodyOf(request);
    if (body.accent !== undefined) {
      if (!isAccent(body.accent)) throw new AppError('VALIDATION_FAILED', { field: 'accent' });
      db.prepare('UPDATE accounts SET accent = ? WHERE id = ?').run(body.accent, auth.account.id);
    }
    if (body.language !== undefined) {
      if (!isLanguage(body.language)) throw new AppError('VALIDATION_FAILED', { field: 'language' });
      db.prepare('UPDATE accounts SET language = ? WHERE id = ?').run(body.language, auth.account.id);
    }
    return buildMe(db, findAccount(db, auth.account.id)!);
  });
}
