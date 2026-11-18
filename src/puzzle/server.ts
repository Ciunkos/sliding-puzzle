// Server entry: the puzzle's server-side feature (its definition and its test-only routes).
import { Hono } from 'hono';
import type { ServerFeature } from '../game/server.ts';
import {
  type PuzzleMove,
  type PuzzleOptions,
  type PuzzleState,
  puzzleDefinition,
} from './definition.ts';
import { applyMove, SOLVED_BOARD } from './rules.ts';

/** The solved board with tile 15 slid into the blank once: one legal move (tile 15) solves it. */
function nearSolvedBoard(): readonly number[] {
  const board = applyMove(SOLVED_BOARD, 15);
  if (board === undefined) throw new Error('tile 15 must be movable on the solved board');
  return board;
}

export const puzzle: ServerFeature<PuzzleState, PuzzleMove, PuzzleOptions> = {
  definition: puzzleDefinition,
  testRoutes({ service, profiles }) {
    const app = new Hono();
    app.post('/api/test/profiles/:nickname/game/near-solved', async (c) => {
      const profile = await profiles.find(c.req.param('nickname'));
      if (profile === undefined) return c.json({ error: 'profile not found' }, 404);
      return c.json(await service.startWith(profile.id, { board: nearSolvedBoard() }), 201);
    });
    return app;
  },
};
