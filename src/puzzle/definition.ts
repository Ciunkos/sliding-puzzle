// The sliding puzzle as a game for the engine: the rules plugged into a GameDefinition.
import { z } from 'zod';
import type { GameDefinition } from '../game/index.ts';
import {
  applyMove,
  type Board,
  isSolvable,
  isSolved,
  isValidBoard,
  type Size,
  sizeOf,
} from './rules.ts';
import { shuffle } from './shuffle.ts';

/** An object, so a picture can join it later. The board's length implies its size (9, 16, 25). */
export interface PuzzleState {
  board: Board;
}

/** A move names the tile that slides into the blank. */
export interface PuzzleMove {
  tile: number;
}

/** A new game's board width; 4 when left out. Mutable, so a screen can keep one stable object. */
export interface PuzzleOptions {
  size?: Size | undefined;
}

const DEFAULT_SIZE: Size = 4;
/** The largest tile number of the largest board (5x5). */
const MAX_TILE = 24;

const optionsSchema = z
  .object({ size: z.union([z.literal(3), z.literal(4), z.literal(5)]).optional() })
  .strict();

const stateSchema = z.object({
  board: z
    .array(z.number())
    .readonly()
    .refine((board) => isValidBoard(board)),
});

/** `satisfies` keeps isValidStart a required function in this type, so callers need no `?.`. */
export const puzzleDefinition = {
  id: 'sliding-puzzle',
  stateSchema,
  moveSchema: z.object({ tile: z.number().int().min(1).max(MAX_TILE) }),
  optionsSchema,
  start: (options, random) => ({ board: shuffle(options.size ?? DEFAULT_SIZE, random) }),
  apply(state, move) {
    const board = applyMove(state.board, move.tile);
    return board === undefined ? undefined : { board };
  },
  isFinished: (state) => isSolved(state.board),
  /** Results are grouped by board size: "3x3", "4x4" or "5x5". */
  variant(state) {
    // Stored boards are validated, so the length always has a size; the default only satisfies the type checker.
    const size = String(sizeOf(state.board) ?? DEFAULT_SIZE);
    return `${size}x${size}`;
  },
  isValidStart: (state) =>
    isValidBoard(state.board) && isSolvable(state.board) && !isSolved(state.board),
} satisfies GameDefinition<PuzzleState, PuzzleMove, PuzzleOptions>;
