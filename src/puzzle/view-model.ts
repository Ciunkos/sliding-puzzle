// Plain view logic of the puzzle screen.
import type { SavedGame } from '../game/index.ts';
import type { PuzzleState } from './definition.ts';
import { legalMoves } from './rules.ts';

export interface Cell {
  tile: number;
  movable: boolean;
}

/** The cells in board order. A tile is movable when it can slide into the blank and the game is open. */
export function toCells(game: SavedGame<PuzzleState>): Cell[] {
  const legal = new Set(legalMoves(game.state.board));
  return game.state.board.map((tile) => ({ tile, movable: !game.finished && legal.has(tile) }));
}

export function solvedText(game: SavedGame<PuzzleState>): string {
  return `Solved in ${String(game.moves)} ${game.moves === 1 ? 'move' : 'moves'}!`;
}

/** Always just the move count. The solved sentence lives in the banner (see solvedText). */
export function statusText(game: SavedGame<PuzzleState>): string {
  return `Moves: ${String(game.moves)}`;
}
