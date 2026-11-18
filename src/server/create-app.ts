// Composition root: wires the profile service and every game feature over one Db and mounts their routes.
// Runtime-agnostic: node.ts and worker.ts both build the app through createApp.
import { Hono } from 'hono';
import type { Db } from '../db/index.ts';
import { featureRoutes, type ServerFeature } from '../game/server.ts';
import { createProfileService, profileRoutes } from '../profile/server.ts';

export interface AppOptions {
  db: Db;
  features: readonly ServerFeature[];
  random: () => number;
  now: () => Date;
  /** Mounts test-only routes. Never enable this in a deployed build. */
  enableTestRoutes?: boolean;
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

  const app = new Hono();
  app.get('/api/health', (c) => c.json({ ok: true }, 200));
  app.route('/', profileRoutes(profiles));
  for (const feature of options.features) {
    app.route('/', featureRoutes(feature, context));
  }

  // Registered last: anything under /api that no route answered.
  app.all('/api/*', (c) => c.json({ error: 'not found' }, 404));

  app.onError((_error, c) => {
    // Never expose the message or stack to the client.
    return c.json({ error: 'internal error' }, 500);
  });

  return app;
}
