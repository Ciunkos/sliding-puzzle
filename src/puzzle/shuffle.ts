import type { Rng } from './rng.ts';
import { applyMove, isSolved, legalMoves, SOLVED_BOARD, type Board } from './rules.ts';

const MIN_MOVES = 200;

/**
 * Random board that is always solvable (it is reached from the solved board by legal moves)
 * and never already solved. Re-rolls the walk if it happens to end on the solved board.
 */
export function shuffle(rng: Rng): Board {
  for (;;) {
    let board: Board = SOLVED_BOARD;
    for (let step = 0; step < MIN_MOVES; step++) {
      const moves = legalMoves(board);
      const tile = moves[Math.floor(rng() * moves.length)];
      const next = tile === undefined ? undefined : applyMove(board, tile);
      if (next === undefined) break;
      board = next;
    }
    if (!isSolved(board)) return board;
  }
}
