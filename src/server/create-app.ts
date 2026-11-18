// Composition root: wires the profile service and every game feature over one Db and mounts their routes.
// Runtime-agnostic: node.ts and worker.ts both build the app through createApp.
import { Hono } from 'hono';
import type { Db } from '../db/index.ts';
import { featureRoutes, type ServerFeature } from '../game/server.ts';
import { createProfileService, profileRoutes } from '../profile/server.ts';

export interface AppOptions {
  /** The path prefix the app is served under, e.g. /sliding-puzzle; routes are mounted below it. */
  basePath: string;
  db: Db;
  features: readonly ServerFeature[];
  random: () => number;
  now: () => Date;
  /** Mounts test-only routes. Never enable this in a deployed build. */
  enableTestRoutes?: boolean;
  /**
   * Where an unexpected error goes, server side only: the entry files pass the console. The client
   * never sees it. Without it the error is not kept anywhere.
   */
  logError?: (error: unknown, request: { method: string; path: string }) => void;
}

export function createApp(options: AppOptions): Hono {
  const { db, random, now } = options;
  const profiles = createProfileService(db, now);
  const context = {
    db,
    profiles,
    random,
    now,
    enableTestRoutes: options.enableTestRoutes === true,
  };

  const api = new Hono();
  api.get('/api/health', (c) => c.json({ ok: true }, 200));
  api.route('/', profileRoutes(profiles));
  for (const feature of options.features) {
    api.route('/', featureRoutes(feature, context));
  }

  // Registered last: anything under <basePath>/api that no route answered.
  api.all('/api/*', (c) => c.json({ error: 'not found' }, 404));

  // Every route is mounted under the base path, e.g. /sliding-puzzle/api/health.
  const app = new Hono();
  app.route(options.basePath, api);
  app.onError((error, c) => {
    options.logError?.(error, { method: c.req.method, path: c.req.path });
    // Never expose the message or stack to the client.
    return c.json({ error: 'internal error' }, 500);
  });

  return app;
}
