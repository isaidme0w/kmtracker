// Account and people management in the administrator panel.
import type { AccountStatus, AdminAccountDto, AdminPersonDto, TemporaryPasswordDto } from '../../shared/api.ts';
import type { Changes } from '../../shared/activity.ts';
import { personName } from '../../shared/format.ts';
import { validateFirstName, validateLastName, validateUsername } from '../../shared/validation.ts';
import type { Db } from '../db/database.ts';
import { nowIso, transaction } from '../db/database.ts';
import { generateTemporaryPassword, hashPassword } from '../auth/passwords.ts';
import { deleteAccountSessions } from '../auth/sessions.ts';
import { AppError } from '../lib/errors.ts';
import {
  accountHasHistory,
  findAccount,
  findAccountByPerson,
  findAccountByUsername,
  listAccounts,
  type Account,
  type Role,
} from './accounts.ts';
import { logEvent, type Actor } from './activity.ts';
import { personRef, recalculate } from './cycles.ts';
import {
  createPerson,
  findPerson,
  getPerson,
  listPersons,
  personHasAccount,
  personHasHistory,
  updatePersonName,
} from './persons.ts';

export const TEMPORARY_PASSWORD_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

function getAccount(db: Db, id: number): Account {
  const account = findAccount(db, id);
  if (!account) throw new AppError('ACCOUNT_NOT_FOUND');
  return account;
}

function statusOf(account: Account): AccountStatus {
  if (!account.active) return 'deactivated';
  if (account.passwordIsTemporary) {
    return account.temporaryPasswordExpiresAt && account.temporaryPasswordExpiresAt <= nowIso() ? 'expired' : 'temporary';
  }
  return 'active';
}

export function listAdminAccounts(db: Db, selfAccountId: number): AdminAccountDto[] {
  return listAccounts(db).map((account) => ({
    id: account.id,
    person: personRef(db, account.personId),
    username: account.username,
    role: account.role,
    status: statusOf(account),
    temporaryPasswordExpiresAt: account.passwordIsTemporary ? account.temporaryPasswordExpiresAt : null,
    isProtected: account.isProtected,
    isSelf: account.id === selfAccountId,
    hasHistory: accountHasHistory(db, account.id) || personHasHistory(db, account.personId),
    createdAt: account.createdAt,
  }));
}

function parseRole(value: unknown): Role {
  if (value !== 'driver' && value !== 'admin') throw new AppError('VALIDATION_FAILED', { field: 'role' });
  return value;
}

async function newTemporaryPassword(): Promise<{ password: string; hash: string; expiresAt: string }> {
  const password = generateTemporaryPassword();
  return {
    password,
    hash: await hashPassword(password),
    expiresAt: new Date(Date.now() + TEMPORARY_PASSWORD_LIFETIME_MS).toISOString(),
  };
}

export interface CreateAccountInput {
  username: string;
  firstName: string;
  lastName: string;
  role: unknown;
  personId?: number;
}

export async function createAccount(db: Db, actor: Actor, input: CreateAccountInput): Promise<TemporaryPasswordDto> {
  const username = validateUsername(input.username);
  const firstName = validateFirstName(input.firstName);
  const lastName = validateLastName(input.lastName, true);
  const role = parseRole(input.role);
  const temporary = await newTemporaryPassword();

  transaction(db, () => {
    if (findAccountByUsername(db, username)) throw new AppError('USERNAME_TAKEN');
    let personId: number;
    if (input.personId !== undefined) {
      getPerson(db, input.personId);
      if (personHasAccount(db, input.personId)) throw new AppError('PERSON_HAS_ACCOUNT');
      updatePersonName(db, input.personId, firstName, lastName);
      db.prepare('UPDATE persons SET active = 1 WHERE id = ?').run(input.personId);
      personId = input.personId;
    } else {
      personId = createPerson(db, firstName, lastName).id;
    }
    db.prepare(
      `INSERT INTO accounts (person_id, username, password_hash, password_is_temporary, temporary_password_expires_at, role, created_at)
       VALUES (?, ?, ?, 1, ?, ?, ?)`,
    ).run(personId, username, temporary.hash, temporary.expiresAt, role, nowIso());
    logEvent(db, {
      type: 'account.created',
      actor,
      subjectPersonId: personId,
      data: { username, name: personName({ firstName, lastName }), role },
    });
  });
  return { username, temporaryPassword: temporary.password, expiresAt: temporary.expiresAt };
}

export interface UpdateAccountInput {
  firstName?: string;
  lastName?: string;
  role?: unknown;
}

export function updateAccount(db: Db, actor: Actor, accountId: number, input: UpdateAccountInput): void {
  transaction(db, () => {
    const account = getAccount(db, accountId);
    const person = getPerson(db, account.personId);
    const changes: Changes = {};

    if (input.firstName !== undefined || input.lastName !== undefined) {
      const firstName = validateFirstName(input.firstName ?? person.firstName);
      const lastName = validateLastName(input.lastName ?? person.lastName, true);
      if (firstName !== person.firstName || lastName !== person.lastName) {
        changes.name = { from: personName(person), to: personName({ firstName, lastName }) };
        updatePersonName(db, person.id, firstName, lastName);
      }
    }
    if (input.role !== undefined) {
      const role = parseRole(input.role);
      if (role !== account.role) {
        if (account.isProtected) throw new AppError('ACCOUNT_PROTECTED');
        if (account.id === actor.accountId) throw new AppError('ACCOUNT_IS_SELF');
        db.prepare('UPDATE accounts SET role = ? WHERE id = ?').run(role, account.id);
        if (role === 'driver') deleteAccountSessions(db, account.id, { kind: 'admin' });
        changes.role = { from: account.role, to: role };
      }
    }
    if (Object.keys(changes).length > 0) {
      logEvent(db, { type: 'account.updated', actor, subjectPersonId: account.personId, data: { username: account.username, changes } });
    }
  });
}

// Generates a new one-time password and ends all of the account's sessions.
// The protected account can only be reset from the command line.
export async function resetPassword(
  db: Db,
  actor: Actor | null,
  accountId: number,
  options: { allowProtected?: boolean } = {},
): Promise<TemporaryPasswordDto> {
  const account = getAccount(db, accountId);
  if (account.isProtected && !options.allowProtected) throw new AppError('ACCOUNT_PROTECTED');
  const temporary = await newTemporaryPassword();
  transaction(db, () => {
    db.prepare(
      'UPDATE accounts SET password_hash = ?, password_is_temporary = 1, temporary_password_expires_at = ? WHERE id = ?',
    ).run(temporary.hash, temporary.expiresAt, account.id);
    deleteAccountSessions(db, account.id);
    logEvent(db, {
      type: 'account.password_reset',
      actor,
      subjectPersonId: account.personId,
      data: { username: account.username },
    });
  });
  return { username: account.username, temporaryPassword: temporary.password, expiresAt: temporary.expiresAt };
}

function assertManageable(account: Account, actor: Actor): void {
  if (account.isProtected) throw new AppError('ACCOUNT_PROTECTED');
  if (account.id === actor.accountId) throw new AppError('ACCOUNT_IS_SELF');
}

export function setAccountActive(db: Db, actor: Actor, accountId: number, active: boolean): void {
  transaction(db, () => {
    const account = getAccount(db, accountId);
    assertManageable(account, actor);
    if (account.active === active) return;
    db.prepare('UPDATE accounts SET active = ? WHERE id = ?').run(active ? 1 : 0, account.id);
    if (!active) deleteAccountSessions(db, account.id);
    logEvent(db, {
      type: active ? 'account.activated' : 'account.deactivated',
      actor,
      subjectPersonId: account.personId,
      data: { username: account.username, name: personName(getPerson(db, account.personId)) },
    });
  });
}

export function deleteAccount(db: Db, actor: Actor, accountId: number): void {
  transaction(db, () => {
    const account = getAccount(db, accountId);
    assertManageable(account, actor);
    if (accountHasHistory(db, account.id) || personHasHistory(db, account.personId)) {
      throw new AppError('ACCOUNT_HAS_HISTORY');
    }
    const name = personName(getPerson(db, account.personId));
    logEvent(db, { type: 'account.deleted', actor, data: { username: account.username, name } });
    db.prepare('DELETE FROM accounts WHERE id = ?').run(account.id);
    db.prepare('DELETE FROM persons WHERE id = ?').run(account.personId);
  });
}

// People

export function listAdminPersons(db: Db): AdminPersonDto[] {
  return listPersons(db).map((item) => ({
    person: { id: item.id, firstName: item.firstName, lastName: item.lastName, username: item.username },
    hasAccount: item.username !== null,
    accountActive: item.accountActive,
    active: item.active,
    hasHistory: personHasHistory(db, item.id),
  }));
}

export function renamePerson(db: Db, actor: Actor, personId: number, firstNameInput: string, lastNameInput: string | null): void {
  transaction(db, () => {
    const person = getPerson(db, personId);
    const firstName = validateFirstName(firstNameInput);
    const lastName = validateLastName(lastNameInput, personHasAccount(db, personId));
    if (firstName === person.firstName && lastName === person.lastName) return;
    updatePersonName(db, personId, firstName, lastName);
    logEvent(db, {
      type: 'person.updated',
      actor,
      subjectPersonId: personId,
      data: { changes: { name: { from: personName(person), to: personName({ firstName, lastName }) } } },
    });
  });
}

// Moves everything of one person to another and removes the first one. The
// person with an account always stays, whichever way round they were given.
export function mergePersons(db: Db, actor: Actor, sourceId: number, targetId: number): void {
  transaction(db, () => {
    if (sourceId === targetId) throw new AppError('MERGE_SAME_PERSON');
    let source = getPerson(db, sourceId);
    let target = getPerson(db, targetId);
    const sourceAccount = findAccountByPerson(db, source.id);
    const targetAccount = findAccountByPerson(db, target.id);
    if (sourceAccount && targetAccount) throw new AppError('MERGE_BOTH_HAVE_ACCOUNTS');
    if (sourceAccount) [source, target] = [target, source];

    const affectedCycles = (
      db
        .prepare(
          `SELECT DISTINCT c.id FROM cycles c WHERE c.closed = 1 AND (
             EXISTS (SELECT 1 FROM readings r JOIN reading_participants rp ON rp.reading_id = r.id WHERE r.cycle_id = c.id AND rp.person_id = ?)
             OR EXISTS (SELECT 1 FROM refuels f WHERE f.cycle_id = c.id AND f.paid_by = ?)
             OR EXISTS (SELECT 1 FROM cycle_shares s WHERE s.cycle_id = c.id AND s.person_id = ?))`,
        )
        .all(source.id, source.id, source.id) as { id: number }[]
    ).map((row) => row.id);

    db.prepare('INSERT OR IGNORE INTO reading_participants (reading_id, person_id) SELECT reading_id, ? FROM reading_participants WHERE person_id = ?').run(
      target.id,
      source.id,
    );
    db.prepare('DELETE FROM reading_participants WHERE person_id = ?').run(source.id);
    db.prepare('UPDATE refuels SET paid_by = ? WHERE paid_by = ?').run(target.id, source.id);
    db.prepare('DELETE FROM cycle_shares WHERE person_id = ?').run(source.id);
    db.prepare('DELETE FROM cycle_transfers WHERE from_person = ? OR to_person = ?').run(source.id, source.id);
    db.prepare('UPDATE activity_log SET actor_person_id = ? WHERE actor_person_id = ?').run(target.id, source.id);
    db.prepare('UPDATE activity_log SET subject_person_id = ? WHERE subject_person_id = ?').run(target.id, source.id);
    for (const cycleId of affectedCycles) recalculate(db, cycleId);
    db.prepare('DELETE FROM persons WHERE id = ?').run(source.id);

    logEvent(db, {
      type: 'person.merged',
      actor,
      subjectPersonId: target.id,
      data: { name: personName(source), into: personName(target) },
    });
  });
}

export function setPersonActive(db: Db, actor: Actor, personId: number, active: boolean): void {
  transaction(db, () => {
    const person = getPerson(db, personId);
    if (personHasAccount(db, personId)) throw new AppError('PERSON_HAS_ACCOUNT');
    if (person.active === active) return;
    db.prepare('UPDATE persons SET active = ? WHERE id = ?').run(active ? 1 : 0, personId);
    logEvent(db, {
      type: active ? 'person.activated' : 'person.deactivated',
      actor,
      subjectPersonId: personId,
      data: { name: personName(person) },
    });
  });
}

export function deletePerson(db: Db, actor: Actor, personId: number): void {
  transaction(db, () => {
    const person = findPerson(db, personId);
    if (!person) throw new AppError('PERSON_NOT_FOUND');
    if (personHasAccount(db, personId)) throw new AppError('PERSON_HAS_ACCOUNT');
    if (personHasHistory(db, personId)) throw new AppError('PERSON_HAS_HISTORY');
    logEvent(db, { type: 'person.deleted', actor, data: { name: personName(person) } });
    db.prepare('DELETE FROM persons WHERE id = ?').run(personId);
  });
}
