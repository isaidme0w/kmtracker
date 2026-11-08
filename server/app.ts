import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import { ValidationError } from '../shared/errors.ts';
import type { Config } from './config.ts';
import type { Db } from './db/database.ts';
import type { SetupState } from './auth/setup.ts';
import { deleteExpiredSessions } from './auth/sessions.ts';
import { statusFor } from './lib/errors.ts';
import { version } from './version.ts';
import { hasBuiltFrontends, registerFrontends } from './static.ts';
import { registerAccountRoutes, registerLoginRoutes } from './routes/auth.ts';
import { registerSetupRoutes } from './routes/setup.ts';
import { registerClientRoutes } from './routes/client.ts';
import { registerAdminRoutes } from './routes/admin.ts';
import { requireSession, type AppContext } from './routes/context.ts';

export interface AppOptions {
  config: Config;
  db: Db;
  setup: SetupState;
  serveFrontends?: boolean;
}

const SETUP_PATH = '/admin/setup';
const SETUP_MODE_API = new Set(['/api/health', '/api/status', '/api/setup']);

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const { config, db, setup } = options;
  const ctx: AppContext = { db, config, setup };
  const serveFrontends = options.serveFrontends ?? hasBuiltFrontends();

  const app = Fastify({
    logger: config.logLevel === 'silent' ? false : { level: config.logLevel },
    trustProxy: false,
  });
  app.decorateRequest('auth', null);
  await app.register(fastifyCookie);

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ValidationError) {
      return reply.code(statusFor(error)).send({ error: { code: error.code, params: error.params } });
    }
    const fastifyError = error as { validation?: unknown; statusCode?: number };
    if (fastifyError.validation || fastifyError.statusCode === 400 || fastifyError.statusCode === 415) {
      return reply.code(400).send({ error: { code: 'VALIDATION_FAILED' } });
    }
    request.log.error(error);
    return reply.code(500).send({ error: { code: 'INTERNAL_ERROR' } });
  });

  // While setup is required, only the setup page and its API are available.
  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0] ?? '/';
    if (setup.required) {
      if (path.startsWith('/api/')) {
        if (!SETUP_MODE_API.has(path)) return reply.code(503).send({ error: { code: 'SETUP_REQUIRED' } });
        return;
      }
      if (serveFrontends && request.method === 'GET' && path !== SETUP_PATH && !path.includes('.')) {
        return reply.redirect(SETUP_PATH);
      }
    } else if (serveFrontends && request.method === 'GET' && path === SETUP_PATH) {
      return reply.redirect('/admin');
    }
  });

  app.get('/api/health', async () => ({ status: 'ok', version }));
  registerSetupRoutes(app, ctx);

  await app.register(
    async (api) => {
      registerLoginRoutes(api, ctx, 'client');
      await api.register(async (authed) => {
        requireSession(authed, ctx, 'client');
        registerAccountRoutes(authed, ctx);
        registerClientRoutes(authed, ctx);
      });
    },
    { prefix: '/api' },
  );

  await app.register(
    async (api) => {
      registerLoginRoutes(api, ctx, 'admin');
      await api.register(async (authed) => {
        requireSession(authed, ctx, 'admin');
        registerAccountRoutes(authed, ctx);
        registerAdminRoutes(authed, ctx);
      });
    },
    { prefix: '/api/admin' },
  );

  if (serveFrontends) {
    await registerFrontends(app);
  } else {
    app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: { code: 'NOT_FOUND' } }));
  }

  const cleanup = setInterval(() => deleteExpiredSessions(db), 60 * 60 * 1000);
  cleanup.unref();
  app.addHook('onClose', async () => clearInterval(cleanup));

  return app;
}

