import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import { afterAll, describe, expect, it } from 'vitest';
import { registerFrontends } from './static.ts';

describe('frontends', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kmtracker-web-'));
  mkdirSync(join(dir, 'admin'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), 'client');
  writeFileSync(join(dir, 'admin/index.html'), 'panel');
  writeFileSync(join(dir, 'assets/app.js'), 'js');

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('serves the matching index.html for every page, including the directory roots', async () => {
    const app = Fastify();
    await registerFrontends(app, dir);
    const get = async (url: string) => {
      const res = await app.inject({ method: 'GET', url });
      return [res.statusCode, res.body];
    };

    expect(await get('/')).toEqual([200, 'client']);
    expect(await get('/history')).toEqual([200, 'client']);
    expect(await get('/admin')).toEqual([200, 'panel']);
    expect(await get('/admin/')).toEqual([200, 'panel']);
    expect(await get('/admin/users')).toEqual([200, 'panel']);
    expect(await get('/assets/app.js')).toEqual([200, 'js']);
    expect((await get('/assets/missing.js'))[0]).toBe(404);
    expect((await get('/api/unknown'))[0]).toBe(404);
  });
});
