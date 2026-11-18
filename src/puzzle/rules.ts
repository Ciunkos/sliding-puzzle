/** Row-major N x N board, N in SIZES. 0 is the blank; tiles 1..N*N-1 appear exactly once. */
export type Board = readonly number[];

/** The board widths a game may have. */
export const SIZES = [3, 4, 5] as const;
export type Size = (typeof SIZES)[number];

const BLANK = 0;

/** The width of a board (or of any list) from its length: 9, 16 or 25 cells; otherwise undefined. */
export function sizeOf(cells: readonly unknown[]): Size | undefined {
  return SIZES.find((size) => size * size === cells.length);
}

/** Tiles 1..N*N-1 in order, then the blank in the bottom-right corner. */
export function solvedBoard(size: Size): Board {
  const tiles = Array.from({ length: size * size - 1 }, (_, i) => i + 1);
  return [...tiles, BLANK];
}

/** 9, 16 or 25 cells, each of 0..cells-1 appearing once. `unknown` so any value can be checked. */
export function isValidBoard(value: unknown): value is Board {
  if (!Array.isArray(value)) return false;
  const cells: unknown[] = value;
  const size = sizeOf(cells);
  if (size === undefined) return false;
  const allowed: ReadonlySet<unknown> = new Set(solvedBoard(size));
  return cells.every((cell) => allowed.has(cell)) && new Set(cells).size === cells.length;
}

export function isSolved(board: Board): boolean {
  const size = sizeOf(board);
  if (size === undefined) return false;
  const goal = solvedBoard(size);
  return board.every((cell, index) => cell === goal[index]);
}

/** Pairs of tiles (the blank left out) that stand in the wrong order, reading row by row. */
function inversions(board: Board): number {
  const tiles = board.filter((cell) => cell !== BLANK);
  let count = 0;
  tiles.forEach((earlier, i) => {
    count += tiles.slice(i + 1).filter((later) => earlier > later).length;
  });
  return count;
}

/**
 * Parity rule for the goal "tiles in order, blank bottom-right" (a move never changes it):
 * - odd width: solvable iff the number of inversions is even;
 * - even width: solvable iff inversions + the blank's row counted from the bottom (1-based) is odd.
 * A board of another length is not solvable.
 */
export function isSolvable(board: Board): boolean {
  const size = sizeOf(board);
  if (size === undefined) return false;
  if (size % 2 === 1) return inversions(board) % 2 === 0;
  const blankRowFromBottom = size - Math.floor(board.indexOf(BLANK) / size);
  return (inversions(board) + blankRowFromBottom) % 2 === 1;
}

/**
 * Index of the blank's orthogonal neighbours on a `size`-wide board, i.e. the cells a tile may
 * slide from. Up and down are not range-checked: an index above or below the board matches no cell
 * (applyMove rejects a tile that is not found, index -1, before it looks here).
 * Left and right are, or the end of one row would touch the start of the next.
 */
function neighboursOf(index: number, size: Size): number[] {
  const col = index % size;
  const result = [index - size, index + size];
  if (col > 0) result.push(index - 1);
  if (col < size - 1) result.push(index + 1);
  return result;
}

/** The tiles that can slide into the blank, ascending. None on a board of another length. */
export function legalMoves(board: Board): number[] {
  const size = sizeOf(board);
  if (size === undefined) return [];
  const neighbours = neighboursOf(board.indexOf(BLANK), size);
  return board.filter((_, index) => neighbours.includes(index)).sort((a, b) => a - b);
}

/**
 * The board after `tile` slides into the blank, or undefined when it cannot: a number that is not
 * on the board (26, 1.5, ...), the blank itself, a tile not next to the blank, no blank at all, or a
 * board whose length is not 9, 16 or 25.
 */
export function applyMove(board: Board, tile: number): Board | undefined {
  const size = sizeOf(board);
  const from = board.indexOf(tile);
  const blank = board.indexOf(BLANK);
  if (size === undefined || from === -1 || blank === -1) return undefined;
  if (!neighboursOf(blank, size).includes(from)) return undefined;
  const next = [...board];
  next[blank] = tile;
  next[from] = BLANK;
  return next;
}
