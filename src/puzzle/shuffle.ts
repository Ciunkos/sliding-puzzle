import type { Rng } from './rng.ts';
import { applyMove, type Board, isSolved, legalMoves, type Size, solvedBoard } from './rules.ts';

/**
 * Moves per walk: more cells need a longer walk to be well mixed. Each length is a multiple of the
 * number of moves after which a walk whose rng always returns 0.5 is back on the solved board
 * (every 32 moves on 3x3, 100 on 4x4, 308 on 5x5), so tests can rig walks that end solved and
 * reach every fallback board.
 */
const WALK_MOVES: Record<Size, number> = { 3: 96, 4: 200, 5: 616 };
/** Walks tried before giving up on the rng; a walk ends solved only for a rare or rigged rng. */
const MAX_WALKS = 3;
/**
 * Returned when every walk ended solved: the solved board after the tile above the blank slid down
 * a few times in the last column (solvable, unsolved). 3x3: 6 then 3 (blank at the top). 4x4: 12
 * then 8 (blank in the second row). 5x5: 20, 15, 10 then 5 (blank at the top).
 */
// prettier-ignore
const FALLBACK_BOARDS: Record<Size, Board> = {
  3: [
    1, 2, 0,
    4, 5, 3,
    7, 8, 6,
  ],
  4: [
     1,  2,  3,  4,
     5,  6,  7,  0,
     9, 10, 11,  8,
    13, 14, 15, 12,
  ],
  5: [
     1,  2,  3,  4,  0,
     6,  7,  8,  9,  5,
    11, 12, 13, 14, 10,
    16, 17, 18, 19, 15,
    21, 22, 23, 24, 20,
  ],
};

/** WALK_MOVES legal moves from the solved board, never sliding back the tile that just moved. */
function walk(size: Size, rng: Rng): Board {
  let board = solvedBoard(size);
  let previous = 0;
  for (let step = 0; step < WALK_MOVES[size]; step++) {
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
 * Random `size` x `size` board that is always solvable (it is reached from the solved board by
 * legal moves) and never already solved. Re-walks if a walk ends on the solved board, at most
 * MAX_WALKS times, then returns the size's fallback board, so even a constant rng terminates.
 */
export function shuffle(size: Size, rng: Rng): Board {
  for (let attempt = 0; attempt < MAX_WALKS; attempt++) {
    const board = walk(size, rng);
    if (!isSolved(board)) return board;
  }
  return FALLBACK_BOARDS[size];
}
