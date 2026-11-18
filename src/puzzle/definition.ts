// The sliding puzzle as a game for the engine: the rules plugged into a GameDefinition.
import { z } from 'zod';
import type { GameDefinition } from '../game/index.ts';
import { applyMove, type Board, isSolvable, isSolved, isValidBoard } from './rules.ts';
import { shuffle } from './shuffle.ts';

/** An object, so a board size or a picture can join it later. */
export interface PuzzleState {
  board: Board;
}

/** A move names the tile that slides into the blank. */
export interface PuzzleMove {
  tile: number;
}

/** No options yet; later: board size. */
export type PuzzleOptions = Record<string, never>;

const stateSchema = z.object({
  board: z
    .array(z.number())
    .readonly()
    .refine((board) => isValidBoard(board), 'invalid board'),
});

export const puzzleDefinition: GameDefinition<PuzzleState, PuzzleMove, PuzzleOptions> = {
  id: 'sliding-puzzle',
  stateSchema,
  moveSchema: z.object({ tile: z.number().int().min(1).max(15) }),
  optionsSchema: z.object({}).strict(),
  start: (_options, random) => ({ board: shuffle(random) }),
  apply(state, move) {
    const board = applyMove(state.board, move.tile);
    return board === undefined ? undefined : { board };
  },
  isFinished: (state) => isSolved(state.board),
  isValidStart: (state) =>
    isValidBoard(state.board) && isSolvable(state.board) && !isSolved(state.board),
};
