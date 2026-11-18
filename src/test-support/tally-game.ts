// A tiny game used only to exercise the engine. Deliberately not a puzzle, so the engine tests
// prove the engine is generic. Count up by 1, 2 or 3 until the count reaches the target.
import { Hono } from 'hono';
import { z } from 'zod';
import type { GameDefinition, ServerFeature } from '../game/server.ts';

export interface TallyState {
  count: number;
  target: number;
}
export interface TallyMove {
  add: number;
}
export interface TallyOptions {
  target: number;
}

export const tallyGame: GameDefinition<TallyState, TallyMove, TallyOptions> = {
  id: 'tally',
  stateSchema: z.object({ count: z.number().int().min(0), target: z.number().int().min(1) }),
  moveSchema: z.object({ add: z.number().int() }),
  optionsSchema: z.object({ target: z.number().int().min(1).default(5) }),
  // The injected random is visible: below 0.5 the count starts at 0, otherwise at 1.
  start: ({ target }, random) => ({ count: random() < 0.5 ? 0 : 1, target }),
  apply: (state, { add }) =>
    add >= 1 && add <= 3 ? { ...state, count: state.count + add } : undefined,
  isFinished: (state) => state.count >= state.target,
};

/**
 * The tally game as a server feature. Its one test-only route starts the profile's game one add
 * short of the target, through the service and profile lookup the engine hands to test routes.
 */
export const tallyFeature: ServerFeature<TallyState, TallyMove, TallyOptions> = {
  definition: tallyGame,
  testRoutes({ service, profiles }) {
    const app = new Hono();
    app.post('/api/test/profiles/:nickname/tally/almost-done', async (c) => {
      const profile = await profiles.find(c.req.param('nickname'));
      if (profile === undefined) return c.json({ error: 'profile not found' }, 404);
      return c.json(await service.startWith(profile.id, { count: 4, target: 5 }), 201);
    });
    return app;
  },
};

/** Randoms for `start`: always the low branch, always the high branch. */
export const ALWAYS_LOW = (): number => 0;
export const ALWAYS_HIGH = (): number => 0.99;
