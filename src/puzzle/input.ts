// What a key, a swipe, a drag or a tap asks the board to do. Plain functions; the event wiring is
// in use-board-input.ts and only reads the event and calls these. Times are passed in (ms).
import { applyMove, type Board, legalMoves, sizeOf } from './rules.ts';

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

/** What a key press needs to say: the key and whether Ctrl, Cmd (meta) or Alt is held. */
export interface KeyPress {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

/**
 * The direction of an arrow key or of W/A/S/D (`KeyboardEvent.key`), otherwise undefined. With
 * Ctrl, Cmd or Alt held the key belongs to a shortcut (Ctrl+S, Cmd+A, Alt+Left), so it moves
 * nothing; Shift alone is fine.
 */
export function keyDirection(press: KeyPress): Direction | undefined {
  if (press.ctrlKey || press.metaKey || press.altKey) return undefined;
  return KEYS.get(press.key);
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

/**
 * The tile that holds the board's one tab stop (roving tabindex): `preferred` (the tile that moved
 * or had focus last) when it is a tile of this board, else the lowest-numbered tile that can move,
 * else tile 1 (a finished game).
 */
export function tabStopTile(
  board: Board,
  finished: boolean,
  preferred: number | undefined,
): number {
  const kept = board.find((cell) => cell !== 0 && cell === preferred);
  if (kept !== undefined) return kept;
  const [lowest] = finished ? [] : legalMoves(board);
  return lowest ?? 1;
}

/**
 * The share of a cell a held tile travels before its move commits, with the finger still down.
 * 0.3: on a 4x4 board on a phone (cells of about 90 px) that is about 27 px, the distance a swipe
 * already needed (SWIPE_MIN_PX), so dragging feels no heavier than swiping did, and a finger that
 * wobbles on a tap (TAP_SLOP_PX) never gets there.
 */
export const COMMIT_SHARE = 0.3;
/** A flick: released moving towards the gap at least this fast (px per ms, i.e. 500 px/s)... */
export const FLICK_PX_PER_MS = 0.5;
/** ...after moving at least this far, and with the finger lifted within FLICK_WINDOW_MS of moving. */
export const FLICK_MIN_PX = 8;
const FLICK_WINDOW_MS = 80;
/** A press that travels less than this, and moves nothing, is still a tap. */
export const TAP_SLOP_PX = 10;

/** Which way a direction points on screen, y growing downwards. */
const UNIT: Record<Direction, { x: number; y: number }> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};
const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right'];

/** A pointer position in CSS pixels and when it was there, in ms. */
export interface Point {
  x: number;
  y: number;
  t: number;
}

/** A press on the board, from pointer down to up. */
export interface Gesture {
  /** The board as it is after this gesture's moves so far, and as it was before the last one. */
  board: Board;
  before: Board;
  /**
   * The tile held, the way it can go, and the run it pushes: the tiles from the one next to the
   * gap up to the held one ([tile] for a tile next to the gap). Undefined for a swipe (a press on
   * a tile out of line with the gap, or on the tray).
   */
  held: { tile: number; direction: Direction; run: readonly number[] } | undefined;
  /** Where the pointer was when the gesture started, or last committed a move. */
  anchor: Point;
  /** The last move, and the moves of the last TRAIL_MS (with the press), for a flick's speed. */
  last: Point;
  trail: readonly Point[];
  /** Where the press began, moves committed so far, and whether it ever travelled past a tap. */
  start: Point;
  commits: number;
  travelled: boolean;
  /** The press has made its move (or won the game): it moves nothing more. */
  done: boolean;
}

/** What the gesture does now. */
export type Step =
  | { kind: 'hold'; tile: number; progress: number }
  | { kind: 'commit'; tile: number }
  /** A row pushed from its far end: these tiles move, in this order, the one next to the gap first. */
  | { kind: 'push'; tiles: readonly number[] }
  | { kind: 'idle' };

const IDLE: Step = { kind: 'idle' };
/** A flick's speed is measured over about the last 50 ms of moves; older moves are dropped. */
const FLICK_SPAN_MS = 50;
const TRAIL_MS = 150;

/** The way a movable `tile` slides into the gap, if it is next to it. */
function directionOf(board: Board, tile: number): Direction | undefined {
  return DIRECTIONS.find((direction) => tileForDirection(board, direction) === tile);
}

/**
 * The tiles that slide `direction`, one after the other, until `tile` has: the run from the gap
 * to it. Undefined when `tile` is not in line with the gap that way.
 */
function runOf(board: Board, tile: number, direction: Direction): number[] | undefined {
  const run: number[] = [];
  let current: Board | undefined = board;
  while (current !== undefined) {
    const next = tileForDirection(current, direction);
    if (next === undefined) return undefined;
    run.push(next);
    if (next === tile) return run;
    current = applyMove(current, next);
  }
  return undefined;
}

/**
 * What a press on `tile` holds: the tile and the run between it and the gap, when it is in line
 * with the gap (next to it, or further along its row or column); else nothing, a swipe.
 */
function holdOf(board: Board, tile: number): Gesture['held'] {
  for (const direction of DIRECTIONS) {
    const run = runOf(board, tile, direction);
    if (run !== undefined) return { tile, direction, run };
  }
  return undefined;
}

/** How far a point is from another, along `direction` (negative: away from it). */
function along(direction: Direction, from: Point, to: Point): number {
  const unit = UNIT[direction];
  return (to.x - from.x) * unit.x + (to.y - from.y) * unit.y;
}

/**
 * A press on `tile` (undefined: the tray) at `at`: a tile next to the gap is held and follows the
 * pointer; any other press is a swipe, which moves the tile on that side of the gap.
 */
export function startGesture(
  board: Board,
  finished: boolean,
  tile: number | undefined,
  at: Point,
): Gesture | undefined {
  if (finished) return undefined;
  const held = tile === undefined ? undefined : holdOf(board, tile);
  const trail = [at];
  return {
    board,
    before: board,
    held,
    anchor: at,
    last: at,
    trail,
    start: at,
    commits: 0,
    travelled: false,
    done: false,
  };
}

/** Whether `live`, the board on screen, is one this gesture expects: its own, or the one before its last commit (not drawn yet). */
export function expects(gesture: Gesture, live: Board): boolean {
  const same = (board: Board) => board.join() === live.join();
  return same(gesture.board) || same(gesture.before);
}

/** How far a held tile has gone from its cell towards the gap: the share of a cell, 0 to 1. */
export function progressOf(direction: Direction, dx: number, dy: number, cellPx: number): number {
  const unit = UNIT[direction];
  const share = (dx * unit.x + dy * unit.y) / cellPx;
  return Math.min(1, Math.max(0, share));
}

/**
 * After a move (`tiles`, the one next to the gap first): the board after it, and the press spent.
 * One move per press: pulling a tile on past the gap never drags the tile behind it, and going
 * back in the same press moves nothing (a new press moves it back). A row is one move of its run.
 */
function committed(gesture: Gesture, tiles: readonly number[]) {
  const board = tiles.reduce((current, tile) => applyMove(current, tile) ?? current, gesture.board);
  const [first] = tiles;
  const step: Step =
    tiles.length === 1 && first !== undefined
      ? { kind: 'commit', tile: first }
      : { kind: 'push', tiles };
  const commits = gesture.commits + tiles.length;
  const before = gesture.board;
  return { gesture: { ...gesture, board, before, held: undefined, commits, done: true }, step };
}

/** A swipe: commits the tile on the swiped side of the gap once the swipe is long enough. */
function swipeStep(gesture: Gesture, at: Point) {
  const direction = swipeDirection(at.x - gesture.anchor.x, at.y - gesture.anchor.y);
  const tile = direction === undefined ? undefined : tileForDirection(gesture.board, direction);
  if (direction === undefined || tile === undefined) return { gesture, step: IDLE };
  return committed(gesture, [tile]);
}

/**
 * The pointer at `at`: a new move for the trail, unless it is where the last move was (a pointer
 * up there, which says nothing about speed).
 */
function withMove(gesture: Gesture, at: Point): Gesture {
  const far = Math.hypot(at.x - gesture.start.x, at.y - gesture.start.y) >= TAP_SLOP_PX;
  const travelled = gesture.travelled || far;
  if (at.x === gesture.last.x && at.y === gesture.last.y) return { ...gesture, travelled };
  const trail = [...gesture.trail, at].filter((point) => at.t - point.t <= TRAIL_MS);
  return { ...gesture, last: at, trail, travelled };
}

/**
 * Whether a held tile, still at its press, is being swiped another way: across its free axis or
 * away from the gap, as far as a swipe. It then lets go and is a swipe from the press.
 */
function swipedAway(gesture: Gesture, at: Point): boolean {
  const { held } = gesture;
  if (held === undefined || gesture.commits > 0) return false;
  const direction = swipeDirection(at.x - gesture.anchor.x, at.y - gesture.anchor.y);
  return direction !== undefined && direction !== held.direction;
}

/** The pointer moved to `at`, on a board whose cells are `cellPx` wide on screen. */
export function stepGesture(
  gesture: Gesture,
  at: Point,
  cellPx: number,
): { gesture: Gesture; step: Step } {
  const moved = withMove(gesture, at);
  if (moved.done) return { gesture: moved, step: IDLE };
  const { held } = moved;
  if (held === undefined || swipedAway(moved, at))
    return swipeStep({ ...moved, held: undefined }, at);
  const progress = progressOf(held.direction, at.x - moved.anchor.x, at.y - moved.anchor.y, cellPx);
  if (progress >= COMMIT_SHARE) return committed(moved, held.run);
  // A run pushed from its far end does not follow the finger; it moves at the threshold.
  const step: Step = held.run.length === 1 ? { kind: 'hold', tile: held.tile, progress } : IDLE;
  return { gesture: moved, step };
}

/** The speed of the last moves along `direction`, px per ms, over about FLICK_SPAN_MS. */
function speedOf(direction: Direction, gesture: Gesture): number {
  const { trail, last } = gesture;
  const recent = trail.find((point) => point !== last && last.t - point.t <= FLICK_SPAN_MS);
  const from = recent ?? trail.at(-2);
  if (from === undefined || last.t <= from.t) return 0;
  return along(direction, from, last) / (last.t - from.t);
}

/**
 * The pointer lifted at time `now`: a held tile flicked towards the gap (fast over its last moves,
 * far enough, and still moving when lifted) commits; anything else springs back.
 */
export function releaseGesture(gesture: Gesture, now: number): Step {
  const { held, last } = gesture;
  if (held?.run.length !== 1 || gesture.done) return IDLE;
  const flicked =
    along(held.direction, gesture.anchor, last) >= FLICK_MIN_PX &&
    speedOf(held.direction, gesture) >= FLICK_PX_PER_MS &&
    now - last.t <= FLICK_WINDOW_MS;
  return flicked ? { kind: 'commit', tile: held.tile } : IDLE;
}

/** Whether the press, lifted at `at`, was a tap: it moved nothing and never travelled far. */
export function isTap(gesture: Gesture, at: Point): boolean {
  const far = Math.hypot(at.x - gesture.start.x, at.y - gesture.start.y) >= TAP_SLOP_PX;
  return gesture.commits === 0 && !gesture.travelled && !far;
}

/** Where a held tile is drawn: its cell shifted by its progress towards the gap, in cells. */
export function dragShift(
  board: Board,
  drag: { tile: number; progress: number } | undefined,
): { col: number; row: number } | undefined {
  const direction = drag === undefined ? undefined : directionOf(board, drag.tile);
  if (drag === undefined || direction === undefined) return undefined;
  const unit = UNIT[direction];
  return { col: unit.x * drag.progress, row: unit.y * drag.progress };
}

/** The tiles of a push, each with the board it moves on (as the ones before it left it). */
export function pushStages(board: Board, tiles: readonly number[]): { tile: number; on: Board }[] {
  const stages: { tile: number; on: Board }[] = [];
  let current = board;
  for (const tile of tiles) {
    stages.push({ tile, on: current });
    current = applyMove(current, tile) ?? current;
  }
  return stages;
}
