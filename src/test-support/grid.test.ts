import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import fc from 'fast-check';
import { formatGrid, grid } from './grid.ts';

const NUMBERS = [...Array(36).keys()];
const squareBoard = fc
  .integer({ min: 2, max: 6 })
  .chain((size) => fc.shuffledSubarray(NUMBERS.slice(0, size * size), { minLength: size * size }));

describe('grid', () => {
  test('a 4x4 drawing becomes a flat array read row by row', () => {
    const board = grid`
       1  2  3  4
       5  6  7  8
       9 10 11 12
      13 14  _ 15
    `;

    // prettier-ignore
    assert.deepEqual(board, [
       1,  2,  3,  4,
       5,  6,  7,  8,
       9, 10, 11, 12,
      13, 14,  0, 15,
    ]);
  });

  test('an underscore and a zero both mean the blank', () => {
    assert.deepEqual(grid`_ 1 \n 2 0`, [0, 1, 2, 0]);
  });

  test('blank lines and indentation around rows are ignored', () => {
    const board = grid`

          1 2

      3 _

    `;

    assert.deepEqual(board, [1, 2, 3, 0]);
  });

  test('a 6x6 drawing is accepted', () => {
    const board = grid`
       1  2  3  4  5  6
       7  8  9 10 11 12
      13 14 15 16 17 18
      19 20 21 22 23 24
      25 26 27 28 29 30
      31 32 33 34 35  _
    `;

    assert.equal(board.length, 36);
    assert.equal(board[35], 0);
  });

  test('a board that breaks the game rules is still drawn as written', () => {
    assert.deepEqual(grid`7 7 \n 99 7`, [7, 7, 99, 7]);
  });

  test('the parsed board cannot be changed', () => {
    assert.equal(Object.isFrozen(grid`1 2 \n 3 _`), true);
  });

  test('ragged rows are rejected with the row number', () => {
    assert.throws(() => grid`1 2 3 \n 4 5 \n 6 7 _`, /ragged rows, row 2 has 2 cells/);
  });

  test('a rectangular drawing is rejected as not square', () => {
    assert.throws(() => grid`1 2 3 \n 4 5 _`, /not square, 2 rows of 3 cells/);
  });

  test('a cell that is not a number or underscore is rejected', () => {
    assert.throws(() => grid`1 x \n 3 _`, /cell "x" in row 1/);
    assert.throws(() => grid`1 2 \n -3 _`, /cell "-3" in row 2/);
    assert.throws(() => grid`1 2 \n 3 1.5`, /cell "1.5" in row 2/);
  });

  test('an interpolated value is rejected', () => {
    assert.throws(() => grid`1 ${2} \n 3 _`, /interpolations are not allowed/);
  });

  test('a drawing smaller than 2x2 or larger than 6x6 is rejected', () => {
    assert.throws(() => grid``, /2 to 6 rows, this drawing has 0/);
    assert.throws(() => grid`_`, /2 to 6 rows, this drawing has 1/);
    assert.throws(() => grid`1\n2\n3\n4\n5\n6\n7`, /2 to 6 rows, this drawing has 7/);
  });
});

describe('formatGrid', () => {
  test('formatGrid lines up a board in right-aligned rows', () => {
    const text = formatGrid([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 0, 15]);

    assert.equal(text, ' 1  2  3  4\n 5  6  7  8\n 9 10 11 12\n13 14  _ 15');
  });

  test('formatGrid rejects a board that is not square', () => {
    assert.throws(() => formatGrid([1, 2, 0]), /3 cells is not a square board/);
  });

  test('grid reads back exactly what formatGrid wrote for any square board', () => {
    fc.assert(
      fc.property(
        squareBoard,
        (board) => JSON.stringify(grid([formatGrid(board)])) === JSON.stringify(board),
      ),
    );
  });
});
