// Server entry: the puzzle's server-side feature (its definition and its test-only routes).
import { Hono } from 'hono';
import type { ServerFeature } from '../game/server.ts';
import {
  type PuzzleMove,
  type PuzzleOptions,
  type PuzzleState,
  puzzleDefinition,
} from './definition.ts';
import type { Board } from './rules.ts';

/** The solved board with tile 15 slid into the blank once: one legal move (tile 15) solves it. */
// prettier-ignore
const NEAR_SOLVED_BOARD: Board = [
   1,  2,  3,  4,
   5,  6,  7,  8,
   9, 10, 11, 12,
  13, 14,  0, 15,
];

export const puzzle: ServerFeature<PuzzleState, PuzzleMove, PuzzleOptions> = {
  definition: puzzleDefinition,
  testRoutes({ service, profiles }) {
    const app = new Hono();
    app.post('/api/test/profiles/:nickname/game/near-solved', async (c) => {
      const profile = await profiles.find(c.req.param('nickname'));
      if (profile === undefined) return c.json({ error: 'profile not found' }, 404);
      return c.json(await service.startWith(profile.id, { board: NEAR_SOLVED_BOARD }), 201);
    });
    return app;
  },
};
