import type { FastifyInstance } from 'fastify';
import { activityCategories, type ActivityCategory } from '../../shared/activity.ts';
import type {
  ActivityPageDto,
  AdminCycleDetailsDto,
  AdminCycleListItemDto,
  AppSettingsDto,
  OverviewDto,
} from '../../shared/api.ts';
import { personName } from '../../shared/format.ts';
import { isValidTimeZone, validateAmount, validateFirstName, validateLastName, validateOdometer } from '../../shared/validation.ts';
import { transaction } from '../db/database.ts';
import { AppError } from '../lib/errors.ts';
import {
  createAccount,
  deleteAccount,
  deletePerson,
  listAdminAccounts,
  listAdminPersons,
  mergePersons,
  renamePerson,
  resetPassword,
  setAccountActive,
  setPersonActive,
  updateAccount,
} from '../services/accountAdmin.ts';
import { listActivity, logEvent } from '../services/activity.ts';
import {
  addRefuel,
  canUndoSettlement,
  deleteReading,
  deleteRefuel,
  insertReading,
  latestClosedCycle,
  undoSettlement,
  updateReading,
  updateRefuel,
  updateStartOdometer,
} from '../services/corrections.ts';
import {
  buildActiveCycle,
  buildCycleDetails,
  findActiveCycle,
  findCycleByNumber,
  getCycle,
  lastOdometer,
  listAllCycles,
  personRef,
  toSummary,
} from '../services/cycles.ts';
import { createPerson } from '../services/persons.ts';
import { getTimeZone, setSetting } from '../services/settings.ts';
import {
  authOf,
  bodyOf,
  idParam,
  int,
  intArray,
  isoDate,
  optionalInt,
  optionalIsoDate,
  optionalStr,
  str,
  textOrNumber,
  type AppContext,
} from './context.ts';

const WARNING_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export function registerAdminRoutes(api: FastifyInstance, ctx: AppContext): void {
  const { db } = ctx;

  api.get('/overview', async (request): Promise<OverviewDto> => {
    const active = findActiveCycle(db) ? buildActiveCycle(db, { accountId: null }) : null;
    const accounts = listAdminAccounts(db, authOf(request).account.id);
    const soon = new Date(Date.now() + WARNING_WINDOW_MS).toISOString();
    const warnings: OverviewDto['warnings'] = accounts
      .filter((account) => (account.status === 'temporary' || account.status === 'expired') && account.temporaryPasswordExpiresAt)
      .filter((account) => account.status === 'expired' || account.temporaryPasswordExpiresAt! <= soon)
      .map((account) => ({
        type: account.status === 'expired' ? 'temporary_password_expired' : 'temporary_password_expiring',
        username: account.username,
        expiresAt: account.temporaryPasswordExpiresAt!,
      }));
    return {
      activeCycle: active
        ? {
            number: active.cycle.number,
            startedAt: active.cycle.startedAt,
            totalKm: active.totalKm,
            refuelsTotal: active.refuelsTotal,
            readingsCount: active.readings.length,
            peopleCount: active.people.filter((person) => person.km > 0).length,
            lastReadingAt: active.lastReadingAt,
          }
        : null,
      warnings,
      recent: listActivity(db, { pageSize: 8 }).entries,
    };
  });

  api.get('/activity', async (request): Promise<ActivityPageDto> => {
    const query = request.query as Record<string, string | undefined>;
    const category = activityCategories.includes(query.category as ActivityCategory)
      ? (query.category as ActivityCategory)
      : undefined;
    const personId = query.personId ? Number(query.personId) : undefined;
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = 50;
    const from = query.from && !Number.isNaN(Date.parse(query.from)) ? new Date(query.from).toISOString() : undefined;
    const to = query.to && !Number.isNaN(Date.parse(query.to)) ? new Date(query.to).toISOString() : undefined;
    const result = listActivity(db, {
      personId: Number.isSafeInteger(personId) ? personId : undefined,
      category,
      from,
      to,
      page,
      pageSize,
    });
    return { ...result, page, pageSize };
  });

  // Accounts

  api.get('/accounts', async (request) => listAdminAccounts(db, authOf(request).account.id));

  api.post('/accounts', async (request) => {
    const body = bodyOf(request);
    return createAccount(db, authOf(request).actor, {
      username: str(body, 'username'),
      firstName: str(body, 'firstName'),
      lastName: str(body, 'lastName'),
      role: body.role,
      personId: optionalInt(body, 'personId'),
    });
  });

  api.patch('/accounts/:id', async (request) => {
    const body = bodyOf(request);
    updateAccount(db, authOf(request).actor, idParam(request), {
      firstName: optionalStr(body, 'firstName'),
      lastName: optionalStr(body, 'lastName'),
      role: body.role,
    });
    return listAdminAccounts(db, authOf(request).account.id);
  });

  api.post('/accounts/:id/reset-password', async (request) => resetPassword(db, authOf(request).actor, idParam(request)));

  api.post('/accounts/:id/deactivate', async (request) => {
    setAccountActive(db, authOf(request).actor, idParam(request), false);
    return listAdminAccounts(db, authOf(request).account.id);
  });

  api.post('/accounts/:id/activate', async (request) => {
    setAccountActive(db, authOf(request).actor, idParam(request), true);
    return listAdminAccounts(db, authOf(request).account.id);
  });

  api.delete('/accounts/:id', async (request) => {
    deleteAccount(db, authOf(request).actor, idParam(request));
    return listAdminAccounts(db, authOf(request).account.id);
  });

  // People

  api.get('/persons', async () => listAdminPersons(db));

  api.post('/persons', async (request) => {
    const body = bodyOf(request);
    const firstName = validateFirstName(str(body, 'firstName'));
    const lastName = validateLastName(optionalStr(body, 'lastName'), false);
    const person = transaction(db, () => {
      const created = createPerson(db, firstName, lastName);
      logEvent(db, { type: 'person.created', actor: authOf(request).actor, subjectPersonId: created.id, data: { name: personName(created) } });
      return created;
    });
    return personRef(db, person.id);
  });

  api.patch('/persons/:id', async (request) => {
    const body = bodyOf(request);
    renamePerson(db, authOf(request).actor, idParam(request), str(body, 'firstName'), optionalStr(body, 'lastName') ?? null);
    return listAdminPersons(db);
  });

  api.post('/persons/:id/merge', async (request) => {
    mergePersons(db, authOf(request).actor, idParam(request), int(bodyOf(request), 'targetId'));
    return listAdminPersons(db);
  });

  api.post('/persons/:id/deactivate', async (request) => {
    setPersonActive(db, authOf(request).actor, idParam(request), false);
    return listAdminPersons(db);
  });

  api.post('/persons/:id/activate', async (request) => {
    setPersonActive(db, authOf(request).actor, idParam(request), true);
    return listAdminPersons(db);
  });

  api.delete('/persons/:id', async (request) => {
    deletePerson(db, authOf(request).actor, idParam(request));
    return listAdminPersons(db);
  });

  // Cycles and corrections

  api.get('/cycles', async (): Promise<AdminCycleListItemDto[]> =>
    listAllCycles(db).map((cycle) => ({
      ...toSummary(db, cycle),
      totalKm: cycle.closed ? cycle.totalKm : lastOdometer(db, cycle) - cycle.startOdometer,
      readingsCount: (db.prepare('SELECT COUNT(*) AS count FROM readings WHERE cycle_id = ?').get(cycle.id) as { count: number })
        .count,
    })),
  );

  api.get('/cycles/:id', async (request): Promise<AdminCycleDetailsDto> => {
    const cycle = getCycle(db, idParam(request));
    const latest = latestClosedCycle(db);
    const previous = findCycleByNumber(db, cycle.number - 1);
    return {
      ...buildCycleDetails(db, cycle, { accountId: null, markSeen: false }),
      isLatestClosed: latest?.id === cycle.id,
      canUndoSettlement: latest?.id === cycle.id && canUndoSettlement(db),
      previousCycleEnd: previous?.endOdometer ?? null,
    };
  });

  api.post('/cycles/undo-settlement', async (request) => {
    undoSettlement(db, authOf(request).actor);
    return { ok: true };
  });

  api.patch('/vehicle', async (request) => {
    updateStartOdometer(db, authOf(request).actor, validateOdometer(textOrNumber(bodyOf(request), 'startOdometer')));
    return { ok: true };
  });

  api.post('/readings', async (request) => {
    const body = bodyOf(request);
    insertReading(db, authOf(request).actor, {
      cycleId: int(body, 'cycleId'),
      odometer: validateOdometer(textOrNumber(body, 'odometer')),
      participantIds: intArray(body, 'participantIds'),
      recordedAt: isoDate(body, 'recordedAt'),
    });
    return { ok: true };
  });

  api.patch('/readings/:id', async (request) => {
    const body = bodyOf(request);
    updateReading(db, authOf(request).actor, idParam(request), {
      odometer: body.odometer === undefined ? undefined : validateOdometer(textOrNumber(body, 'odometer')),
      participantIds: body.participantIds === undefined ? undefined : intArray(body, 'participantIds'),
      recordedAt: optionalIsoDate(body, 'recordedAt'),
    });
    return { ok: true };
  });

  api.delete('/readings/:id', async (request) => {
    deleteReading(db, authOf(request).actor, idParam(request));
    return { ok: true };
  });

  api.post('/refuels', async (request) => {
    const body = bodyOf(request);
    addRefuel(db, authOf(request).actor, {
      cycleId: int(body, 'cycleId'),
      amount: validateAmount(textOrNumber(body, 'amount')),
      paidBy: int(body, 'paidBy'),
      recordedAt: isoDate(body, 'recordedAt'),
    });
    return { ok: true };
  });

  api.patch('/refuels/:id', async (request) => {
    const body = bodyOf(request);
    updateRefuel(db, authOf(request).actor, idParam(request), {
      amount: body.amount === undefined ? undefined : validateAmount(textOrNumber(body, 'amount')),
      paidBy: optionalInt(body, 'paidBy'),
      recordedAt: optionalIsoDate(body, 'recordedAt'),
    });
    return { ok: true };
  });

  api.delete('/refuels/:id', async (request) => {
    deleteRefuel(db, authOf(request).actor, idParam(request));
    return { ok: true };
  });

  // Application settings

  api.get('/settings', async (): Promise<AppSettingsDto> => ({ timeZone: getTimeZone(db) }));

  api.patch('/settings', async (request): Promise<AppSettingsDto> => {
    const timeZone = str(bodyOf(request), 'timeZone');
    if (!isValidTimeZone(timeZone)) throw new AppError('TIME_ZONE_INVALID');
    transaction(db, () => {
      const previous = getTimeZone(db);
      if (previous === timeZone) return;
      setSetting(db, 'time_zone', timeZone);
      logEvent(db, {
        type: 'settings.updated',
        actor: authOf(request).actor,
        data: { changes: { timeZone: { from: previous, to: timeZone } } },
      });
    });
    return { timeZone: getTimeZone(db) };
  });

}
