// A tiny game ranked by score, used only to exercise the engine's 'highest-score' ranking. Three
// turns, each gaining 0 to 10 points; the score is the points.
import { z } from 'zod';
import type { GameDefinition, GameService } from '../game/server.ts';

export interface ScoreState {
  points: number;
  turns: number;
}
export interface ScoreMove {
  gain: number;
}
export type ScoreOptions = Record<string, never>;

export const scoreGame: GameDefinition<ScoreState, ScoreMove, ScoreOptions> = {
  id: 'score',
  stateSchema: z.object({ points: z.number().int().min(0), turns: z.number().int().min(0) }),
  moveSchema: z.object({ gain: z.number().int() }),
  optionsSchema: z.object({}).strict(),
  start: () => ({ points: 0, turns: 0 }),
  apply: (state, { gain }) =>
    gain >= 0 && gain <= 10 ? { points: state.points + gain, turns: state.turns + 1 } : undefined,
  isFinished: (state) => state.turns >= 3,
  score: (state) => state.points,
  ranking: 'highest-score',
  variant: () => 'default',
};

/** One score game played to its end: its three gains sent as one batch. */
export interface ScorePlay {
  gains: [number, number, number];
  elapsedMs?: number;
}

/**
 * Plays each game in turn for one profile: `starter` starts it, `finisher` (the same service on a
 * later clock) sends its gains as one batch. For tests of the best results.
 */
export async function playScoreGames(
  starter: GameService<ScoreState, ScoreMove, ScoreOptions>,
  finisher: GameService<ScoreState, ScoreMove, ScoreOptions>,
  profileId: number,
  plays: readonly ScorePlay[],
): Promise<void> {
  for (const [index, play] of plays.entries()) {
    const game = await starter.start(profileId, {});
    await finisher.applyMoves(profileId, {
      baseVersion: game.version,
      batchId: `score-${String(index)}-batch`,
      moves: play.gains.map((gain) => ({ gain })),
      elapsedMs: play.elapsedMs,
    });
  }
}
