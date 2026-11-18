// Local entrypoint: `node src/server/node.ts`. Serves the API and the built web app from one port.
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve, type ServerType } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { z } from 'zod';
import { createNodeSqliteDb, migrate } from '../db/server.ts';
import { createApp } from './create-app.ts';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations', import.meta.url));
/** Relative to the working directory, where `npm run build` writes the web app. */
const WEB_DIR = 'dist/web';

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  DB_PATH: z.string().min(1).default('data/puzzle.db'),
  ENABLE_TEST_ROUTES: z.string().optional(),
});

/** Static files from dist/web, with index.html for any other GET. Empty when the build is missing. */
function webApp(): Hono {
  const web = new Hono();
  if (!existsSync(WEB_DIR)) return web;
  web.use('*', serveStatic({ root: WEB_DIR }));
  web.get('*', serveStatic({ root: WEB_DIR, path: 'index.html' }));
  return web;
}

export async function start(): Promise<ServerType> {
  const env = envSchema.parse(process.env);

  if (env.DB_PATH !== ':memory:') {
    mkdirSync(dirname(resolve(env.DB_PATH)), { recursive: true });
  }
  const db = createNodeSqliteDb(env.DB_PATH);
  await migrate(db, MIGRATIONS_DIR);

  const api = createApp({ db, enableTestRoutes: env.ENABLE_TEST_ROUTES === '1' });
  const web = webApp();

  const fetch = (request: Request): Response | Promise<Response> => {
    const { pathname } = new URL(request.url);
    if (pathname === '/api' || pathname.startsWith('/api/')) return api.fetch(request);
    return web.fetch(request);
  };

  return serve({ fetch, port: env.PORT }, (info) => {
    console.log(`sliding-puzzle listening on http://localhost:${String(info.port)}`);
  });
}

function isEntrypoint(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && resolve(entry) === fileURLToPath(import.meta.url);
}

if (isEntrypoint()) {
  await start();
}
