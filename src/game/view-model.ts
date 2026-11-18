import { legalMoves, SIZE } from '../puzzle/index.ts';
import type { GameState } from './index.ts';

export interface Cell {
  tile: number;
  row: number;
  col: number;
  movable: boolean;
}

/** The 16 cells in board order. A tile is movable when it can slide into the blank and the game is open. */
export function toCells(state: GameState): Cell[] {
  const movable = new Set(state.solved ? [] : legalMoves(state.board));
  return state.board.map((tile, index) => ({
    tile,
    row: Math.floor(index / SIZE),
    col: index % SIZE,
    movable: movable.has(tile),
  }));
}

export function solvedText(state: GameState): string {
  return `Solved in ${String(state.moves)} moves!`;
}

/** Always just the move count. The solved sentence lives in the banner (see solvedText). */
export function statusText(state: GameState): string {
  return `Moves: ${String(state.moves)}`;
}
