// Isomorphic entry: the contract a game plugs into the engine, and the saved-game shape.
// The engine knows no particular game; everything game-specific comes through a GameDefinition.
import { z } from 'zod';

/** What the server knows when it applies a move: the clock and randomness, both injected. */
export interface MoveContext {
  now: Date;
  random: () => number;
}

export interface GameDefinition<State, Move, Options> {
  /** Stable id, used in URLs and as the storage key, e.g. 'sliding-puzzle'. */
  id: string;
  /** Validates a state read from the database or the network. */
  stateSchema: z.ZodType<State>;
  moveSchema: z.ZodType<Move>;
  /** Options for a new game. */
  optionsSchema: z.ZodType<Options>;
  start(options: Options, random: () => number): State;
  /**
   * The state after `move`, or undefined when the move is illegal. Pure. The server passes
   * `context`; the browser applies moves optimistically without it, so a game that needs it must
   * still give the same answer the server will give, or the server's game wins on the next sync.
   */
  apply(state: State, move: Move, context?: MoveContext): State | undefined;
  isFinished(state: State): boolean;
  /** Whether a chosen start state is acceptable (see GameService.startWith). Default: not finished. */
  isValidStart?(state: State): boolean;
  /** Which kind of game `state` is, for grouping best results, e.g. '4x4'. Default: 'default'. */
  variant?(state: State): string;
}

export interface SavedGame<State> {
  state: State;
  initial: State;
  moves: number;
  finished: boolean;
  version: number;
  startedAt: string;
  finishedAt: string | null;
}

/** The schema of a saved game whose states match `stateSchema`. */
export function savedGameSchema<State>(stateSchema: z.ZodType<State>): z.ZodType<SavedGame<State>> {
  return z.object({
    state: stateSchema,
    initial: stateSchema,
    moves: z.number().int().min(0),
    finished: z.boolean(),
    version: z.number().int().min(1),
    startedAt: z.string(),
    finishedAt: z.string().nullable(),
  });
}

/** The most moves one batch may carry. */
export const MAX_BATCH = 64;

/** A batch id: a short opaque string the browser makes up (see batchIdFor in sync.ts). */
export const batchIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,40}$/);

/**
 * One finished game in the results: `durationMs` is what the server saw (finishedAt - startedAt),
 * `reportedMs` the active play time the browser reported, never more than `durationMs`.
 */
export const bestResultSchema = z.object({
  variant: z.string(),
  moves: z.number().int().min(0),
  durationMs: z.number().int().min(0),
  reportedMs: z.number().int().min(0).nullable(),
  finishedAt: z.string(),
});

export type BestResult = z.infer<typeof bestResultSchema>;

/** Best results per variant, each variant's best first (see GameService.results). */
export const bestResultsSchema = z.array(bestResultSchema);
