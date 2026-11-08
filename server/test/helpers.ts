import { openMemoryDatabase, nowIso, type Db } from '../db/database.ts';
import { migrate } from '../db/migrate.ts';
import type { Actor } from '../services/activity.ts';
import { createPerson } from '../services/persons.ts';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../app.ts';
import { SetupState } from '../auth/setup.ts';
import type { Config } from '../config.ts';

export function createTestDb(): Db {
  const db = openMemoryDatabase();
  migrate(db, null);
  return db;
}

// Inserts an account directly, for tests that don't go through the API.
export function insertAccount(
  db: Db,
  username: string,
  firstName: string,
  lastName: string | null,
  role: 'driver' | 'admin' = 'driver',
): Actor {
  const person = createPerson(db, firstName, lastName);
  const result = db
    .prepare(
      `INSERT INTO accounts (person_id, username, password_hash, role, created_at)
       VALUES (?, ?, 'x', ?, ?)`,
    )
    .run(person.id, username, role, nowIso());
  return { accountId: Number(result.lastInsertRowid), personId: person.id, name: [firstName, lastName].filter(Boolean).join(' ') };
}

export const TEST_SETUP_CODE = 'ABCD-EFGH-JKLM';
export const ADMIN_PASSWORD = 'admin password';

export const testConfig: Config = {
  port: 3000,
  host: '127.0.0.1',
  dataDir: '/tmp/kmtracker-test-unused',
  cookieSecure: false,
  logLevel: 'silent',
};

export interface TestApp {
  app: FastifyInstance;
  db: Db;
  setup: SetupState;
}

export async function createTestApp(): Promise<TestApp> {
  const db = createTestDb();
  const setup = new SetupState(db);
  setup.useCode(TEST_SETUP_CODE);
  const app = await buildApp({ config: testConfig, db, setup, serveFrontends: false });
  return { app, db, setup };
}

// A minimal cookie jar for one simulated browser.
export class Browser {
  private cookies = new Map<string, string>();
  private readonly app: FastifyInstance;

  constructor(app: FastifyInstance) {
    this.app = app;
  }

  async request(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown): Promise<LightMyRequestResponse> {
    const response = await this.app.inject({
      method,
      url,
      payload: payload as Record<string, unknown> | undefined,
      cookies: Object.fromEntries(this.cookies),
    });
    for (const cookie of response.cookies) {
      if (cookie.value === '' || (cookie.expires && cookie.expires.getTime() <= Date.now())) this.cookies.delete(cookie.name);
      else this.cookies.set(cookie.name, cookie.value);
    }
    return response;
  }

  get(url: string) {
    return this.request('GET', url);
  }

  post(url: string, payload: unknown = {}) {
    return this.request('POST', url, payload);
  }

  patch(url: string, payload: unknown = {}) {
    return this.request('PATCH', url, payload);
  }

  delete(url: string) {
    return this.request('DELETE', url);
  }
}

export async function completeSetup(app: FastifyInstance): Promise<Browser> {
  const browser = new Browser(app);
  const response = await browser.post('/api/setup', {
    code: TEST_SETUP_CODE,
    username: 'admin',
    firstName: 'Jan',
    lastName: 'Zieliński',
    password: ADMIN_PASSWORD,
    timeZone: 'Europe/Warsaw',
    language: 'pl',
  });
  if (response.statusCode !== 200) throw new Error(`Setup failed: ${response.body}`);
  return browser;
}

export function errorCode(response: LightMyRequestResponse): string | undefined {
  return (response.json() as { error?: { code: string } }).error?.code;
}
