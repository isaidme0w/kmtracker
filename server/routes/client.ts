import type { FastifyInstance } from 'fastify';
import type { SelectablePersonDto, VehicleDto } from '../../shared/api.ts';
import { personName } from '../../shared/format.ts';
import { validateAmount, validateFirstName, validateLastName, validateOdometer } from '../../shared/validation.ts';
import { transaction } from '../db/database.ts';
import { logEvent } from '../services/activity.ts';
import {
  buildActiveCycle,
  buildCycleDetails,
  findActiveCycle,
  getCycle,
  lastOdometer,
  listClosedCycles,
  personRef,
  setupVehicle,
  toSummary,
} from '../services/cycles.ts';
import { createPerson, isSelectable, listPersons } from '../services/persons.ts';
import { addReading, previewRefuel, recordRefuel, undoReading, type RefuelInput } from '../services/trips.ts';
import { authOf, bodyOf, bool, idParam, int, intArray, optionalStr, str, textOrNumber, type AppContext } from './context.ts';

function refuelInput(body: Record<string, unknown>): RefuelInput {
  return {
    amount: validateAmount(textOrNumber(body, 'amount')),
    odometer: validateOdometer(textOrNumber(body, 'odometer')),
    paidBy: int(body, 'paidBy'),
    isFull: bool(body, 'isFull'),
    participantIds: intArray(body, 'participantIds'),
  };
}

export function registerClientRoutes(api: FastifyInstance, ctx: AppContext): void {
  const { db } = ctx;

  api.get('/vehicle', async (): Promise<VehicleDto> => {
    const cycle = findActiveCycle(db);
    return { setupDone: cycle !== null, lastOdometer: cycle ? lastOdometer(db, cycle) : null };
  });

  api.post('/vehicle/setup', async (request) => {
    const odometer = validateOdometer(textOrNumber(bodyOf(request), 'odometer'));
    transaction(db, () => setupVehicle(db, odometer, authOf(request).actor));
    return buildActiveCycle(db, { accountId: authOf(request).account.id });
  });

  api.get('/persons', async (): Promise<SelectablePersonDto[]> =>
    listPersons(db).map((item) => ({
      id: item.id,
      firstName: item.firstName,
      lastName: item.lastName,
      username: item.username,
      selectable: isSelectable(item),
    })),
  );

  api.post('/persons', async (request) => {
    const body = bodyOf(request);
    const firstName = validateFirstName(str(body, 'firstName'));
    const lastName = validateLastName(optionalStr(body, 'lastName'), false);
    const person = transaction(db, () => {
      const created = createPerson(db, firstName, lastName);
      logEvent(db, {
        type: 'person.created',
        actor: authOf(request).actor,
        subjectPersonId: created.id,
        data: { name: personName(created) },
      });
      return created;
    });
    return personRef(db, person.id);
  });

  api.get('/cycles/active', async (request) => buildActiveCycle(db, { accountId: authOf(request).account.id }));

  api.get('/cycles', async () => listClosedCycles(db).map((cycle) => toSummary(db, cycle)).reverse());

  api.get('/cycles/:id', async (request) =>
    buildCycleDetails(db, getCycle(db, idParam(request)), { accountId: authOf(request).account.id, markSeen: true }),
  );

  api.post('/readings', async (request) => {
    const body = bodyOf(request);
    const auth = authOf(request);
    addReading(db, auth.actor, validateOdometer(textOrNumber(body, 'odometer')), intArray(body, 'participantIds'));
    return buildActiveCycle(db, { accountId: auth.account.id });
  });

  api.delete('/readings/:id', async (request) => {
    const auth = authOf(request);
    undoReading(db, auth.actor, idParam(request));
    return buildActiveCycle(db, { accountId: auth.account.id });
  });

  api.post('/refuels/preview', async (request) => previewRefuel(db, authOf(request).actor, refuelInput(bodyOf(request))));

  api.post('/refuels', async (request) => recordRefuel(db, authOf(request).actor, refuelInput(bodyOf(request))));
}
