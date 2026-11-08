import type { FastifyInstance } from 'fastify';
import type { StatusDto } from '../../shared/api.ts';
import { isLanguage, DEFAULT_ACCENT } from '../../shared/preferences.ts';
import { isValidTimeZone, validateFirstName, validateLastName, validatePassword } from '../../shared/validation.ts';
import { nowIso, transaction } from '../db/database.ts';
import { hashPassword } from '../auth/passwords.ts';
import { createSession } from '../auth/sessions.ts';
import { AppError } from '../lib/errors.ts';
import { findAccount } from '../services/accounts.ts';
import { logEvent } from '../services/activity.ts';
import { createPerson } from '../services/persons.ts';
import { setSetting } from '../services/settings.ts';
import { version } from '../version.ts';
import { actorFor, bodyOf, buildMe, setSessionCookie, str, type AppContext } from './context.ts';

export const PROTECTED_USERNAME = 'admin';

export function registerSetupRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { db, setup } = ctx;

  app.get('/api/status', async (): Promise<StatusDto> => ({ setupRequired: setup.required, version }));

  app.post('/api/setup', async (request, reply) => {
    if (!setup.required) throw new AppError('SETUP_ALREADY_DONE');
    if (setup.limiter.isBlocked()) throw new AppError('TOO_MANY_ATTEMPTS');
    const body = bodyOf(request);
    if (!setup.verifyCode(str(body, 'code'))) {
      setup.limiter.recordFailure();
      throw new AppError('SETUP_CODE_INVALID');
    }
    const firstName = validateFirstName(str(body, 'firstName'));
    const lastName = validateLastName(str(body, 'lastName'), true);
    const password = validatePassword(str(body, 'password'));
    const timeZone = str(body, 'timeZone');
    if (!isValidTimeZone(timeZone)) throw new AppError('TIME_ZONE_INVALID');
    const language = isLanguage(body.language) ? body.language : 'pl';
    const hash = await hashPassword(password);

    const accountId = transaction(db, () => {
      if (!setup.required) throw new AppError('SETUP_ALREADY_DONE');
      const person = createPerson(db, firstName, lastName);
      const result = db
        .prepare(
          `INSERT INTO accounts (person_id, username, password_hash, role, is_protected, accent, language, created_at)
           VALUES (?, ?, ?, 'admin', 1, ?, ?, ?)`,
        )
        .run(person.id, PROTECTED_USERNAME, hash, DEFAULT_ACCENT, language, nowIso());
      setSetting(db, 'time_zone', timeZone);
      const id = Number(result.lastInsertRowid);
      logEvent(db, { type: 'setup.completed', actor: actorFor(db, findAccount(db, id)!), data: { timeZone } });
      return id;
    });
    setup.complete();

    const account = findAccount(db, accountId)!;
    const { token } = createSession(db, account.id, 'admin');
    setSessionCookie(reply, ctx, 'admin', token);
    return buildMe(db, account);
  });
}
