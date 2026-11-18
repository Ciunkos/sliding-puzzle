// Boards as humans see them. Test-only: parses a drawing, never checks game rules, so tests can
// write invalid or unsolvable boards on purpose. A malformed drawing throws.

const MIN_SIZE = 2;
const MAX_SIZE = 6;
const BLANK = '_';

function parseCell(cell: string, row: number): number {
  if (cell === BLANK) return 0;
  if (!/^\d+$/.test(cell)) {
    throw new Error(
      `grid: cell "${cell}" in row ${String(row)} is not a non-negative integer or ${BLANK}`,
    );
  }
  return Number(cell);
}

function checkSquare(rows: readonly (readonly string[])[]): void {
  const size = rows.length;
  if (size < MIN_SIZE || size > MAX_SIZE) {
    throw new Error(
      `grid: a board has ${String(MIN_SIZE)} to ${String(MAX_SIZE)} rows, this drawing has ${String(size)}`,
    );
  }
  const first = rows[0]?.length ?? 0;
  rows.forEach((cells, index) => {
    if (cells.length !== first) {
      throw new Error(
        `grid: ragged rows, row ${String(index + 1)} has ${String(cells.length)} cells but row 1 has ${String(first)}`,
      );
    }
  });
  if (first !== size) {
    throw new Error(
      `grid: not square, ${String(size)} rows of ${String(first)} cells (draw N rows of N cells)`,
    );
  }
}

/**
 * Tagged template: a hand-drawn square board -> flat readonly array, row by row.
 * Rows are lines, cells are separated by whitespace, `_` or `0` is the blank (0).
 * Blank lines and indentation are ignored. `${}` interpolations are rejected: draw every cell.
 */
export function grid(strings: readonly string[], ...values: readonly unknown[]): readonly number[] {
  if (values.length > 0) {
    throw new Error('grid: ${} interpolations are not allowed, write every cell out by hand');
  }
  const rows = strings
    .join('')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => line.split(/\s+/));
  checkSquare(rows);
  return Object.freeze(rows.flatMap((cells, index) => cells.map((c) => parseCell(c, index + 1))));
}

/** Renders a flat square board as right-aligned rows (blank as `_`); `grid` parses it back. */
export function formatGrid(board: readonly number[]): string {
  const size = Math.sqrt(board.length);
  if (!Number.isInteger(size) || size === 0) {
    throw new Error(`formatGrid: ${String(board.length)} cells is not a square board`);
  }
  const cells = board.map((n) => (n === 0 ? BLANK : String(n)));
  const width = Math.max(...cells.map((c) => c.length));
  const rows: string[] = [];
  for (let start = 0; start < cells.length; start += size) {
    rows.push(
      cells
        .slice(start, start + size)
        .map((c) => c.padStart(width))
        .join(' '),
    );
  }
  return rows.join('\n');
}
