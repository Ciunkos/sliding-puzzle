// Isomorphic entry: the contract a game plugs into the engine, and the saved-game shape.
// The engine knows no particular game; everything game-specific comes through a GameDefinition.
import { z } from 'zod';

export interface GameDefinition<State, Move, Options> {
  /** Stable id, used in URLs and as the storage key, e.g. 'sliding-puzzle'. */
  id: string;
  /** Validates a state read from the database or the network. */
  stateSchema: z.ZodType<State>;
  moveSchema: z.ZodType<Move>;
  /** Options for a new game. */
  optionsSchema: z.ZodType<Options>;
  start(options: Options, random: () => number): State;
  /** The state after `move`, or undefined when the move is illegal. */
  apply(state: State, move: Move): State | undefined;
  isFinished(state: State): boolean;
  /** Whether a chosen start state is acceptable (see GameService.startWith). Default: not finished. */
  isValidStart?(state: State): boolean;
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
