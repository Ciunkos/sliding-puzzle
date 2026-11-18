// Composition root: wires the profile and game services over one Db and mounts their routes.
// Runtime-agnostic: node.ts and worker.ts both build the app through createApp.
import { Hono } from 'hono';
import type { Db } from '../db/index.ts';
import { createGameService, gameRoutes } from '../game/server.ts';
import { applyMove, SOLVED_BOARD } from '../puzzle/index.ts';
import { createProfileService, profileRoutes } from '../profile/server.ts';

export interface AppOptions {
  db: Db;
  /** Mounts test-only routes. Never enable this in a deployed build. */
  enableTestRoutes?: boolean;
}

/** The solved board with tile 15 slid into the blank once: one legal move (tile 15) solves it. */
function nearSolvedBoard(): readonly number[] {
  const board = applyMove(SOLVED_BOARD, 15);
  if (board === undefined) throw new Error('tile 15 must be movable on the solved board');
  return board;
}

export function createApp(options: AppOptions): Hono {
  const profileService = createProfileService(options.db);
  const gameService = createGameService(options.db);

  const app = new Hono();

  app.get('/api/health', (c) => c.json({ ok: true }, 200));
  app.route('/', profileRoutes(profileService));
  app.route('/', gameRoutes(gameService, profileService));

  if (options.enableTestRoutes === true) {
    app.post('/api/test/profiles/:nickname/game/near-solved', async (c) => {
      const profile = await profileService.find(c.req.param('nickname'));
      if (profile === undefined) return c.json({ error: 'profile not found' }, 404);
      const state = await gameService.startWith(profile.id, nearSolvedBoard());
      return c.json(state, 201);
    });
  }

  // Registered last: anything under /api that no route answered.
  app.all('/api/*', (c) => c.json({ error: 'not found' }, 404));

  app.onError((_error, c) => {
    // Never expose the message or stack to the client.
    return c.json({ error: 'internal error' }, 500);
  });

  return app;
}
