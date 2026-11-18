/** Row-major 4x4 board. 0 is the blank; tiles 1..15 appear exactly once. */
export type Board = readonly number[];

export const SIZE = 4;
const CELLS = SIZE * SIZE;
const BLANK = 0;
const MAX_TILE = CELLS - 1;

export const SOLVED_BOARD: Board = [...Array.from({ length: MAX_TILE }, (_, i) => i + 1), BLANK];

export function isValidBoard(value: unknown): value is Board {
  if (!Array.isArray(value) || value.length !== CELLS) return false;
  const seen = new Array<boolean>(CELLS).fill(false);
  for (const cell of value as unknown[]) {
    if (typeof cell !== 'number' || !Number.isInteger(cell)) return false;
    if (cell < 0 || cell > MAX_TILE || seen[cell]) return false;
    seen[cell] = true;
  }
  return true;
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

/** Index of the blank's orthogonal neighbours, i.e. the cells a tile may slide from. */
function neighboursOf(index: number): number[] {
  const row = Math.floor(index / SIZE);
  const col = index % SIZE;
  const result: number[] = [];
  if (row > 0) result.push(index - SIZE);
  if (row < SIZE - 1) result.push(index + SIZE);
  if (col > 0) result.push(index - 1);
  if (col < SIZE - 1) result.push(index + 1);
  return result;
}

export function legalMoves(board: Board): number[] {
  const blank = board.indexOf(BLANK);
  const moves: number[] = [];
  for (const index of neighboursOf(blank)) {
    const tile = board[index];
    if (tile !== undefined) moves.push(tile);
  }
  return moves.sort((a, b) => a - b);
}

export function applyMove(board: Board, tile: number): Board | undefined {
  if (!Number.isInteger(tile) || tile < 1 || tile > MAX_TILE) return undefined;
  const from = board.indexOf(tile);
  const blank = board.indexOf(BLANK);
  if (from === -1 || blank === -1) return undefined;
  if (!neighboursOf(blank).includes(from)) return undefined;
  const next = [...board];
  next[blank] = tile;
  next[from] = BLANK;
  return next;
}
