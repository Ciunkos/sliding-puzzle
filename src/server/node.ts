// Local entrypoint: `node src/server/node.ts`. Serves the API and the built web app from one port,
// under the same path prefix as the Worker.
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve, type ServerType } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { compress } from 'hono/compress';
import { z } from 'zod';
import { createNodeSqliteDb, migrate } from '../db/server.ts';
import { analyticsResponse, type AnalyticsSettings } from './analytics.ts';
import { createApp } from './create-app.ts';
import { features } from './features.ts';
import { BASE, classify, pathHeaders } from './paths.ts';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations', import.meta.url));
/** Relative to the working directory, where `npm run build` writes the web app. */
const WEB_DIR = 'dist/web';

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  DB_PATH: z.string().min(1).default('data/puzzle.db'),
  ENABLE_TEST_ROUTES: z.string().optional(),
  // Usage statistics are off unless a token is set; locally only to try the proxy against a stand-in.
  POSTHOG_PROJECT_TOKEN: z.string().min(1).optional(),
  POSTHOG_HOST: z.string().optional(),
});

/**
 * Static files from dist/web, whose paths mirror the URL paths, with the headers of their path
 * (the same ones dist/web/_headers gives them on Cloudflare). Empty when the build is missing.
 */
function webApp(): Hono {
  const web = new Hono();
  if (!existsSync(WEB_DIR)) return web;
  // Cloudflare compresses what it serves; this server does the same, so local measurements agree.
  web.use('*', compress());
  web.use('*', async (c, next) => {
    await next();
    // A missing file is not kept: only a file that was found gets its path's headers.
    if (!c.res.ok) return;
    for (const [name, value] of Object.entries(pathHeaders(c.req.path))) c.header(name, value);
  });
  web.get('*', serveStatic({ root: WEB_DIR }));
  return web;
}

/** The built shell, served for the base path and every client route. */
function shellApp(): Hono {
  const shell = new Hono();
  if (!existsSync(WEB_DIR)) return shell;
  shell.use('*', compress());
  shell.get('*', serveStatic({ root: WEB_DIR, path: `${BASE.slice(1)}/index.html` }));
  return shell;
}

/** Routes each request by its path, the same way the Worker does (see paths.ts). */
function router(
  api: Hono,
  analytics: AnalyticsSettings,
): (request: Request) => Response | Promise<Response> {
  const web = webApp();
  const shell = shellApp();
  return (request) => {
    const url = new URL(request.url);
    const path = classify(url.pathname);
    if (path.kind === 'redirect') {
      return new Response(null, { status: 301, headers: { location: `${path.to}${url.search}` } });
    }
    if (path.kind === 'api') return api.fetch(request);
    if (path.kind === 'analytics-config' || path.kind === 'analytics-proxy') {
      return analyticsResponse(request, path, analytics);
    }
    if (path.kind === 'outside') return new Response('Not Found', { status: 404 });
    return fromFiles(request, path.kind === 'shell' ? shell : web);
  };
}

/** Files are read-only: anything but GET and HEAD is refused before reaching them. */
function fromFiles(request: Request, files: Hono): Response | Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { allow: 'GET, HEAD' } });
  }
  return files.fetch(request);
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
    logError: (error, request) => {
      console.error(`sliding-puzzle: ${request.method} ${request.path} failed:`, error);
    },
  });
  const fetch = router(api, {
    token: env.POSTHOG_PROJECT_TOKEN,
    host: env.POSTHOG_HOST,
    fetch: globalThis.fetch,
  });

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
