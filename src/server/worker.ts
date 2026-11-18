// Cloudflare Workers entry. Migrations are applied by `wrangler d1 migrations apply`, not here.
// Never import ../db/server.ts in this file: it pulls in node:sqlite, which Workers do not have.
// Static assets answer first (see wrangler.toml); the Worker gets the API, the trailing-slash
// redirects, the client routes (it returns the shell for them) and everything outside the prefix.
import type { Hono } from 'hono';
import { createD1Db, type D1Like } from '../db/index.ts';
import { createApp } from './create-app.ts';
import { features } from './features.ts';
import { BASE, classify } from './paths.ts';

interface Assets {
  fetch(request: Request): Promise<Response>;
}

interface Env {
  DB: D1Like;
  ASSETS: Assets;
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
  return env.ASSETS.fetch(shell ? new Request(new URL(BASE, request.url)) : request);
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname.startsWith('www.')) {
      url.hostname = url.hostname.slice('www.'.length);
      return Promise.resolve(redirect(url.toString()));
    }
    const path = classify(url.pathname);
    switch (path.kind) {
      case 'redirect':
        return Promise.resolve(redirect(`${path.to}${url.search}`));
      case 'api':
        return Promise.resolve(appFor(env.DB).fetch(request));
      case 'shell':
        return fromAssets(request, env, true);
      case 'asset':
        return fromAssets(request, env, false);
      case 'outside':
        return Promise.resolve(new Response('Not Found', { status: 404 }));
    }
  },
};
