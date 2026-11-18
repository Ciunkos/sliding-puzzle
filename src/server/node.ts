// Local entrypoint: `node src/server/node.ts`. Serves the API and the built web app from one port,
// under the same path prefix as the Worker.
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve, type ServerType } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { z } from 'zod';
import { createNodeSqliteDb, migrate } from '../db/server.ts';
import { createApp } from './create-app.ts';
import { features } from './features.ts';
import { BASE, classify } from './paths.ts';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations', import.meta.url));
/** Relative to the working directory, where `npm run build` writes the web app. */
const WEB_DIR = 'dist/web';

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  DB_PATH: z.string().min(1).default('data/puzzle.db'),
  ENABLE_TEST_ROUTES: z.string().optional(),
});

/** Static files from dist/web, whose paths mirror the URL paths. Empty when the build is missing. */
function webApp(): Hono {
  const web = new Hono();
  if (!existsSync(WEB_DIR)) return web;
  web.get('*', serveStatic({ root: WEB_DIR }));
  return web;
}

/** The built shell, served for the base path and every client route. */
function shellApp(): Hono {
  const shell = new Hono();
  if (!existsSync(WEB_DIR)) return shell;
  shell.get('*', serveStatic({ root: WEB_DIR, path: `${BASE.slice(1)}/index.html` }));
  return shell;
}

/** Routes each request by its path, the same way the Worker does (see paths.ts). */
function router(api: Hono): (request: Request) => Response | Promise<Response> {
  const web = webApp();
  const shell = shellApp();
  return (request) => {
    const url = new URL(request.url);
    const path = classify(url.pathname);
    if (path.kind === 'redirect') {
      return new Response(null, { status: 301, headers: { location: `${path.to}${url.search}` } });
    }
    if (path.kind === 'api') return api.fetch(request);
    if (path.kind === 'outside') return new Response('Not Found', { status: 404 });
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(null, { status: 405, headers: { allow: 'GET, HEAD' } });
    }
    return (path.kind === 'shell' ? shell : web).fetch(request);
  };
}

export async function start(): Promise<ServerType> {
  const env = envSchema.parse(process.env);

  if (env.DB_PATH !== ':memory:') {
    mkdirSync(dirname(resolve(env.DB_PATH)), { recursive: true });
  }
  const db = createNodeSqliteDb(env.DB_PATH);
  await migrate(db, MIGRATIONS_DIR);

  const api = createApp({
    basePath: BASE,
    db,
    features,
    random: Math.random,
    now: () => new Date(),
    enableTestRoutes: env.ENABLE_TEST_ROUTES === '1',
  });
  const fetch = router(api);

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
