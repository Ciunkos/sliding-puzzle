// Cloudflare Workers entry. Migrations are applied by `wrangler d1 migrations apply`, not here.
// Never import ../db/server.ts in this file: it pulls in node:sqlite, which Workers do not have.
// Static assets answer first (see wrangler.toml); the Worker gets the API, the trailing-slash
// redirects, the client routes (it returns the shell for them) and everything outside the prefix.
import type { Hono } from 'hono';
import { createD1Db, type D1Like } from '../db/index.ts';
import { analyticsResponse } from './analytics.ts';
import { createApp } from './create-app.ts';
import { features } from './features.ts';
import { BASE, classify } from './paths.ts';

interface Assets {
  fetch(request: Request): Promise<Response>;
}

interface Env {
  DB: D1Like;
  ASSETS: Assets;
  /** A secret (`wrangler secret put POSTHOG_PROJECT_TOKEN`): usage statistics are off without it. */
  POSTHOG_PROJECT_TOKEN?: string;
  /** Optional: another PostHog ingest host than the EU one. */
  POSTHOG_HOST?: string;
}

/** One app per D1 binding, built on its first request. Test routes are never enabled in the Worker. */
const apps = new WeakMap<D1Like, Hono>();

function appFor(binding: D1Like): Hono {
  const cached = apps.get(binding);
  if (cached !== undefined) return cached;
  const app = createApp({
    basePath: BASE,
    db: createD1Db(binding),
    features,
    random: Math.random,
    now: () => new Date(),
    // Shows in `wrangler tail` (and Workers Logs, if turned on); never sent to the client.
    logError: (error, request) => {
      console.error(`sliding-puzzle: ${request.method} ${request.path} failed:`, error);
    },
  });
  apps.set(binding, app);
  return app;
}

function redirect(location: string): Response {
  return new Response(null, { status: 301, headers: { location } });
}

/** Assets are read-only: anything but GET and HEAD is refused before reaching them. */
function fromAssets(request: Request, env: Env, shell: boolean): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return Promise.resolve(new Response(null, { status: 405, headers: { allow: 'GET, HEAD' } }));
  }
  // With html_handling "drop-trailing-slash" only this spelling answers the shell; others are 307s.
  return env.ASSETS.fetch(shell ? new Request(new URL(BASE, request.url)) : request).then(notKept);
}

/**
 * An error from the assets is never kept. The _headers rule for hashed files also matches a hashed
 * file that is missing, and would mark its 404 immutable for a year (the Node server only sets the
 * header on a file it found; this makes the Worker agree).
 */
function notKept(response: Response): Response {
  if (response.status < 400) return response;
  const copy = new Response(response.body, response);
  copy.headers.set('Cache-Control', 'no-store');
  return copy;
}

/** Answers a request on the apex host by what its path is (see paths.ts). */
function byPath(request: Request, env: Env, url: URL): Promise<Response> {
  const path = classify(url.pathname);
  switch (path.kind) {
    case 'redirect':
      return Promise.resolve(redirect(`${path.to}${url.search}`));
    case 'api':
      return Promise.resolve(appFor(env.DB).fetch(request));
    case 'analytics-config':
    case 'analytics-proxy':
      return analyticsResponse(request, path, {
        token: env.POSTHOG_PROJECT_TOKEN,
        host: env.POSTHOG_HOST,
        fetch: (url, init) => fetch(url, init),
      });
    case 'shell':
      return fromAssets(request, env, true);
    case 'asset':
      return fromAssets(request, env, false);
    case 'outside':
      return Promise.resolve(new Response('Not Found', { status: 404 }));
  }
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname.startsWith('www.')) {
      url.hostname = url.hostname.slice('www.'.length);
      return Promise.resolve(redirect(url.toString()));
    }
    return byPath(request, env, url);
  },
};
