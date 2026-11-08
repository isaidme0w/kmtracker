import { existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import type { FastifyInstance, FastifyReply } from 'fastify';
import fastifyStatic from '@fastify/static';

export const webDistDir = resolve(import.meta.dirname, '../dist/web');

export function hasBuiltFrontends(dir = webDistDir): boolean {
  return existsSync(resolve(dir, 'index.html')) && existsSync(resolve(dir, 'admin/index.html'));
}

export function isPanelPath(path: string): boolean {
  return path === '/admin' || path.startsWith('/admin/');
}

// Serves the built client application at / and the panel at /admin, falling
// back to each frontend's index.html so that client-side routes work.
export async function registerFrontends(app: FastifyInstance, dir = webDistDir): Promise<void> {
  await app.register(fastifyStatic, {
    root: dir,
    index: false,
    setHeaders: (res, filePath) => {
      // Built assets have content hashes in their names, so they never change.
      if (filePath.includes(`${sep}assets${sep}`)) res.header('Cache-Control', 'public, max-age=31536000, immutable');
    },
  });

  const sendIndex = (path: string, reply: FastifyReply) => {
    reply.header('Cache-Control', 'no-cache');
    return reply.sendFile(isPanelPath(path) ? 'admin/index.html' : 'index.html');
  };

  // `/` and `/admin/` are directories in the build output, which the static
  // plugin refuses to list, so they get explicit routes.
  app.get('/', (_request, reply) => sendIndex('/', reply));
  app.get('/admin/', (_request, reply) => sendIndex('/admin/', reply));

  app.setNotFoundHandler((request, reply) => {
    const path = request.url.split('?')[0] ?? '/';
    const isFile = (path.split('/').pop() ?? '').includes('.');
    if (request.method !== 'GET' || path.startsWith('/api/') || path === '/api' || isFile) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND' } });
    }
    return sendIndex(path, reply);
  });
}
