// What a key, a swipe or a tap asks the board to do. Plain functions; the event wiring is in
// use-board-input.ts and only reads the event and calls these.
import { type Board, legalMoves, sizeOf } from './rules.ts';

/**
 * Where a tile slides. Convention: a direction names where the TILE goes, so "left" (swiping or
 * pressing left) slides the tile to the RIGHT of the blank leftwards into it, and "up" slides the
 * tile BELOW the blank upwards.
 */
export type Direction = 'up' | 'down' | 'left' | 'right';

/** Where the tile that slides in a direction sits, as a row and column step from the blank. */
const SOURCE_STEP: Record<Direction, { row: number; col: number }> = {
  left: { row: 0, col: 1 },
  right: { row: 0, col: -1 },
  up: { row: 1, col: 0 },
  down: { row: -1, col: 0 },
};

/**
 * The tile that would slide in `direction` into the blank, or undefined when the blank is on that
 * edge. The tile must be a legal move, so the end of one row never counts as next to the next row.
 */
export function tileForDirection(board: Board, direction: Direction): number | undefined {
  const blank = board.indexOf(0);
  if (blank === -1) return undefined;
  const step = SOURCE_STEP[direction];
  // Not a board: no size, and legalMoves has nothing to find in.
  const from = blank + step.row * (sizeOf(board) ?? 0) + step.col;
  return legalMoves(board).find((tile) => board.indexOf(tile) === from);
}

const KEYS: ReadonlyMap<string, Direction> = new Map([
  ['ArrowUp', 'up'],
  ['ArrowDown', 'down'],
  ['ArrowLeft', 'left'],
  ['ArrowRight', 'right'],
  ['w', 'up'],
  ['a', 'left'],
  ['s', 'down'],
  ['d', 'right'],
  ['W', 'up'],
  ['A', 'left'],
  ['S', 'down'],
  ['D', 'right'],
]);

/** The direction of an arrow key or of W/A/S/D (`KeyboardEvent.key`), otherwise undefined. */
export function keyDirection(key: string): Direction | undefined {
  return KEYS.get(key);
}

/** The shortest movement, in CSS pixels, that counts as a swipe rather than a tap. */
const SWIPE_MIN_PX = 24;
/** A swipe is mostly along one axis: that axis is at least this many times the other. */
const AXIS_RATIO = 1.5;

/** The direction of a pointer movement of (dx, dy) pixels, y growing downwards; undefined for a tap. */
export function swipeDirection(dx: number, dy: number): Direction | undefined {
  const across = Math.abs(dx);
  const along = Math.abs(dy);
  if (Math.max(across, along) < SWIPE_MIN_PX) return undefined;
  if (across >= AXIS_RATIO * along) return dx > 0 ? 'right' : 'left';
  if (along >= AXIS_RATIO * across) return dy > 0 ? 'down' : 'up';
  return undefined;
}

/** `tile` when it can slide into the blank of an open game, otherwise undefined. */
export function movable(
  board: Board,
  finished: boolean,
  tile: number | undefined,
): number | undefined {
  if (finished) return undefined;
  return legalMoves(board).find((legal) => legal === tile);
}
