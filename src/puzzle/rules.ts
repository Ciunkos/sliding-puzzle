/** Row-major 4x4 board. 0 is the blank; tiles 1..15 appear exactly once. */
export type Board = readonly number[];

export const SIZE = 4;
const CELLS = SIZE * SIZE;
const BLANK = 0;
const MAX_TILE = CELLS - 1;

export const SOLVED_BOARD: Board = [...Array.from({ length: MAX_TILE }, (_, i) => i + 1), BLANK];

/** The cells a valid board holds: 0..MAX_TILE. `unknown` so any value can be looked up. */
const CELL_VALUES: ReadonlySet<unknown> = new Set(SOLVED_BOARD);

/** Exactly CELLS cells, each of 0..MAX_TILE appearing once. */
export function isValidBoard(value: unknown): value is Board {
  if (!Array.isArray(value) || value.length !== CELLS) return false;
  const cells: unknown[] = value;
  return cells.every((cell) => CELL_VALUES.has(cell)) && new Set(cells).size === CELLS;
}

export function isSolved(board: Board): boolean {
  return board.every((cell, index) => cell === SOLVED_BOARD[index]);
}

/**
 * Standard 15-puzzle parity rule for a SIZE-wide grid with the goal blank at the bottom-right:
 * solvable iff (inversions among tiles + blank row counted from the top, 0-based) is odd.
 * For the solved board: 0 inversions + row 3 = 3, odd, solvable.
 */
export function isSolvable(board: Board): boolean {
  let inversions = 0;
  const tiles = board.filter((cell) => cell !== BLANK);
  tiles.forEach((earlier, i) => {
    tiles.slice(i + 1).forEach((later) => {
      if (earlier > later) inversions++;
    });
  });
  const blankRow = Math.floor(board.indexOf(BLANK) / SIZE);
  return (inversions + blankRow) % 2 === 1;
}

/**
 * Index of the blank's orthogonal neighbours, i.e. the cells a tile may slide from.
 * Up and down are not range-checked: an index above or below the board matches no cell
 * (applyMove rejects a tile that is not found, index -1, before it looks here).
 * Left and right are, or the end of one row would touch the start of the next.
 */
function neighboursOf(index: number): number[] {
  const col = index % SIZE;
  const result = [index - SIZE, index + SIZE];
  if (col > 0) result.push(index - 1);
  if (col < SIZE - 1) result.push(index + 1);
  return result;
}

export function legalMoves(board: Board): number[] {
  const neighbours = neighboursOf(board.indexOf(BLANK));
  return board.filter((_, index) => neighbours.includes(index)).sort((a, b) => a - b);
}

/**
 * The board after `tile` slides into the blank, or undefined when it cannot: a number that is not
 * on the board (16, 1.5, ...), the blank itself, a tile not next to the blank, or no blank at all.
 */
export function applyMove(board: Board, tile: number): Board | undefined {
  const from = board.indexOf(tile);
  const blank = board.indexOf(BLANK);
  if (from === -1 || blank === -1 || !neighboursOf(blank).includes(from)) return undefined;
  const next = [...board];
  next[blank] = tile;
  next[from] = BLANK;
  return next;
}
