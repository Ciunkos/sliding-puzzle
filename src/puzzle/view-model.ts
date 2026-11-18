// Plain view logic of the puzzle screen.
import type { SavedGame } from '../game/index.ts';
import type { PuzzleState } from './definition.ts';
import { applyMove, type Board, legalMoves, type Size, sizeOf } from './rules.ts';

/** A cell of the board: row and column from the top-left, 0-based. */
export interface Place {
  row: number;
  col: number;
}

export interface TileView extends Place {
  tile: number;
  /** It can slide into the blank and the game is open. */
  movable: boolean;
}

export interface BoardLayout {
  size: Size;
  /** Every tile once, in tile-number order: a stable order lets each tile's element slide. */
  tiles: TileView[];
  blank: Place;
}

/** Stored boards are validated, so the length always has a size; 4 only satisfies the type checker. */
const FALLBACK_SIZE: Size = 4;

function placeOf(index: number, size: Size): Place {
  return { row: Math.floor(index / size), col: index % size };
}

/** Where each tile and the blank sit, and which tiles can move. */
export function layout(game: SavedGame<PuzzleState>): BoardLayout {
  const { board } = game.state;
  const size = sizeOf(board) ?? FALLBACK_SIZE;
  const legal = new Set(legalMoves(board));
  const tiles = board
    .map((tile, index) => ({
      tile,
      ...placeOf(index, size),
      movable: !game.finished && legal.has(tile),
    }))
    .filter((cell) => cell.tile !== 0)
    .sort((a, b) => a.tile - b.tile);
  return { size, tiles, blank: placeOf(board.indexOf(0), size) };
}

/** "3×3", "4×4", "5×5". */
export function sizeLabel(size: Size): string {
  return `${String(size)}×${String(size)}`;
}

function countMoves(moves: number): string {
  return `${String(moves)} ${moves === 1 ? 'move' : 'moves'}`;
}

export function solvedText(game: SavedGame<PuzzleState>): string {
  return `Solved in ${countMoves(game.moves)}!`;
}

/** Always just the move count. The solved sentence lives in the banner (see solvedText). */
export function statusText(game: SavedGame<PuzzleState>): string {
  return `Moves: ${String(game.moves)}`;
}

/** The tile that slid from `before` to `after` in one legal move, otherwise undefined. */
function movedTile(before: Board, after: Board): number | undefined {
  // The blank (0) itself never moves, so a missing cell is no move either.
  const tile = after[before.indexOf(0)] ?? 0;
  return applyMove(before, tile)?.join() === after.join() ? tile : undefined;
}

/**
 * What the live region says when the game on screen changes from `before` (undefined on the first
 * game) to `game`: the win, one move, or nothing (a load, a new game, a reset).
 */
export function announcement(before: Board | undefined, game: SavedGame<PuzzleState>): string {
  if (game.finished) return solvedText(game);
  const tile = before === undefined ? undefined : movedTile(before, game.state.board);
  if (tile === undefined) return '';
  return `Moved tile ${String(tile)}. ${countMoves(game.moves)}.`;
}
