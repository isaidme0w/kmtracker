import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { MeDto } from '../../shared/api.ts';
import { personName } from '../../shared/format.ts';
import type { Config } from '../config.ts';
import type { Db } from '../db/database.ts';
import type { SetupState } from '../auth/setup.ts';
import {
  SESSION_COOKIE_PATHS,
  SESSION_COOKIES,
  SESSION_LIFETIMES_MS,
  findSession,
  type Session,
  type SessionKind,
} from '../auth/sessions.ts';
import { AppError } from '../lib/errors.ts';
import type { Account } from '../services/accounts.ts';
import type { Actor } from '../services/activity.ts';
import { isVehicleSetUp, personRef } from '../services/cycles.ts';
import { unseenCorrections } from '../services/activity.ts';
import { getPerson } from '../services/persons.ts';
import { getTimeZone } from '../services/settings.ts';

export interface AppContext {
  db: Db;
  config: Config;
  setup: SetupState;
}

export interface AuthContext {
  account: Account;
  session: Session;
  actor: Actor;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
  interface FastifyContextConfig {
    // Routes a user may call while they still have to replace a one-time password.
    allowTemporaryPassword?: boolean;
  }
}

export function actorFor(db: Db, account: Account): Actor {
  return { accountId: account.id, personId: account.personId, name: personName(getPerson(db, account.personId)) };
}

export function setSessionCookie(reply: FastifyReply, ctx: AppContext, kind: SessionKind, token: string): void {
  reply.setCookie(SESSION_COOKIES[kind], token, {
    path: SESSION_COOKIE_PATHS[kind],
    httpOnly: true,
    sameSite: 'lax',
    secure: ctx.config.cookieSecure,
    maxAge: Math.floor(SESSION_LIFETIMES_MS[kind] / 1000),
  });
}

export function clearSessionCookie(reply: FastifyReply, kind: SessionKind): void {
  reply.clearCookie(SESSION_COOKIES[kind], { path: SESSION_COOKIE_PATHS[kind] });
}

// Loads the session of the given kind on every request. Routes in the scope
// require a signed-in account; admin routes also require the Administrator role.
export function requireSession(scope: FastifyInstance, ctx: AppContext, kind: SessionKind): void {
  scope.addHook('preHandler', async (request: FastifyRequest) => {
    const token = request.cookies[SESSION_COOKIES[kind]];
    const found = token ? findSession(ctx.db, token, kind) : null;
    if (!found) throw new AppError('UNAUTHENTICATED');
    if (kind === 'admin' && found.account.role !== 'admin') throw new AppError('NOT_AN_ADMINISTRATOR');
    if (found.account.passwordIsTemporary && !request.routeOptions.config.allowTemporaryPassword) {
      throw new AppError('PASSWORD_CHANGE_REQUIRED');
    }
    request.auth = { account: found.account, session: found.session, actor: actorFor(ctx.db, found.account) };
  });
}

export function authOf(request: FastifyRequest): AuthContext {
  if (!request.auth) throw new AppError('UNAUTHENTICATED');
  return request.auth;
}

export function buildMe(db: Db, account: Account): MeDto {
  return {
    account: {
      id: account.id,
      username: account.username,
      role: account.role,
      createdAt: account.createdAt,
      mustChangePassword: account.passwordIsTemporary,
      accent: account.accent,
      language: account.language,
      isProtected: account.isProtected,
    },
    person: personRef(db, account.personId),
    timeZone: getTimeZone(db),
    vehicleSetupDone: isVehicleSetUp(db),
    unseenCorrections: unseenCorrections(db, account.id, account.personId),
  };
}

// Reading request bodies

type Body = Record<string, unknown>;

export function bodyOf(request: FastifyRequest): Body {
  const body = request.body;
  if (body && typeof body === 'object' && !Array.isArray(body)) return body as Body;
  return {};
}

function invalid(field: string): AppError {
  return new AppError('VALIDATION_FAILED', { field });
}

export function str(body: Body, field: string): string {
  const value = body[field];
  if (typeof value !== 'string') throw invalid(field);
  return value;
}

export function optionalStr(body: Body, field: string): string | undefined {
  const value = body[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw invalid(field);
  return value;
}

export function int(body: Body, field: string): number {
  const value = body[field];
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw invalid(field);
  return value;
}

export function optionalInt(body: Body, field: string): number | undefined {
  const value = body[field];
  if (value === undefined || value === null) return undefined;
  return int(body, field);
}

export function bool(body: Body, field: string): boolean {
  const value = body[field];
  if (typeof value !== 'boolean') throw invalid(field);
  return value;
}

export function intArray(body: Body, field: string): number[] {
  const value = body[field];
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'number' && Number.isSafeInteger(item))) {
    throw invalid(field);
  }
  return value as number[];
}

// Text or number fields that the shared validators parse (odometer, amount).
export function textOrNumber(body: Body, field: string): string | number {
  const value = body[field];
  if (typeof value !== 'string' && typeof value !== 'number') throw invalid(field);
  return value;
}

export function idParam(request: FastifyRequest, name = 'id'): number {
  const value = Number((request.params as Record<string, string>)[name]);
  if (!Number.isSafeInteger(value) || value < 1) throw new AppError('NOT_FOUND');
  return value;
}

export function isoDate(body: Body, field: string): string {
  const value = str(body, field);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new AppError('DATE_INVALID');
  return date.toISOString();
}

export function optionalIsoDate(body: Body, field: string): string | undefined {
  if (body[field] === undefined || body[field] === null) return undefined;
  return isoDate(body, field);
}
