import type { Rng } from './rng.ts';
import { applyMove, isSolved, legalMoves, SOLVED_BOARD, type Board } from './rules.ts';

const MIN_MOVES = 200;
/** Walks tried before giving up on the rng; a walk ends solved only for a rare or rigged rng. */
const MAX_WALKS = 3;
/** Returned when every walk ended solved: tile 12 slid down, then tile 8 slid right. */
// prettier-ignore
const FALLBACK_BOARD: Board = [
   1,  2,  3,  4,
   5,  6,  7,  0,
   9, 10, 11,  8,
  13, 14, 15, 12,
];

/** MIN_MOVES legal moves from the solved board, never sliding back the tile that just moved. */
function walk(rng: Rng): Board {
  let board: Board = SOLVED_BOARD;
  let previous = 0;
  for (let step = 0; step < MIN_MOVES; step++) {
    const choices = legalMoves(board).filter((tile) => tile !== previous);
    // rng() < 1 and a board has at least two legal moves, so the index is always in range and the
    // move always legal: the fallbacks only satisfy the type checker.
    const tile = choices[Math.floor(rng() * choices.length)] ?? 0;
    board = applyMove(board, tile) ?? board;
    previous = tile;
  }
  return board;
}

/**
 * Random board that is always solvable (it is reached from the solved board by legal moves)
 * and never already solved. Re-walks if a walk ends on the solved board, at most MAX_WALKS times,
 * then returns FALLBACK_BOARD, so even a constant rng terminates.
 */
export function shuffle(rng: Rng): Board {
  for (let attempt = 0; attempt < MAX_WALKS; attempt++) {
    const board = walk(rng);
    if (!isSolved(board)) return board;
  }
  return FALLBACK_BOARD;
}
