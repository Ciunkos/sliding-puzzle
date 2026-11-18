// A tiny game used only to exercise the engine. Deliberately not a puzzle, so the engine tests
// prove the engine is generic. Count up by 1, 2 or 3 until the count reaches the target.
import { Hono } from 'hono';
import { z } from 'zod';
import type { GameDefinition, GameService, MoveContext, ServerFeature } from '../game/server.ts';

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
  // Games to different targets are different kinds of game, ranked apart in the best results.
  variant: ({ target }) => `to ${String(target)}`,
};

/** The tally game, except that every apply pushes the context it was given to `seen`. */
export function contextRecordingTally(
  seen: (MoveContext | undefined)[],
): GameDefinition<TallyState, TallyMove, TallyOptions> {
  return {
    ...tallyGame,
    apply: (state, move, context) => {
      seen.push(context);
      return tallyGame.apply(state, move);
    },
  };
}

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

/** One tally game played to its end: started to `target`, then `adds` sent as one batch. */
export interface TallyPlay {
  target: number;
  adds: number[];
  elapsedMs?: number;
}

/**
 * Plays each game in turn for one profile: `starter` starts it, `finisher` (the same service on a
 * later clock) sends its adds as one batch. For tests of the best results.
 */
export async function playTallyGames(
  starter: GameService<TallyState, TallyMove, TallyOptions>,
  finisher: GameService<TallyState, TallyMove, TallyOptions>,
  profileId: number,
  plays: readonly TallyPlay[],
): Promise<void> {
  for (const [index, play] of plays.entries()) {
    const game = await starter.start(profileId, { target: play.target });
    await finisher.applyMoves(profileId, {
      baseVersion: game.version,
      batchId: `play-${String(index)}-batch`,
      moves: play.adds.map((add) => ({ add })),
      elapsedMs: play.elapsedMs,
    });
  }
}
