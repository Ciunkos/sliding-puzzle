import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import fc from 'fast-check';
import { grid } from '../test-support/grid.ts';
import {
  applyMove,
  isSolvable,
  isSolved,
  isValidBoard,
  legalMoves,
  SOLVED_BOARD,
} from './rules.ts';

/** Any arrangement of the 16 cells, solvable or not. */
const anyBoard = fc.shuffledSubarray([...Array(16).keys()], { minLength: 16 });
const boardAndLegalTile = anyBoard.chain((board) =>
  fc.record({ board: fc.constant(board), tile: fc.constantFrom(...legalMoves(board)) }),
);
const tileNumber = fc.integer({ min: 1, max: 15 });

describe('isValidBoard', () => {
  test('every arrangement of 0 to 15 is a valid board', () => {
    fc.assert(fc.property(anyBoard, (board) => isValidBoard(board)));
  });

  test('a value that is not 16 cells is not a board', () => {
    const nineCells = grid`
      1 2 3
      4 5 6
      7 8 _
    `;

    assert.equal(isValidBoard(nineCells), false);
    assert.equal(isValidBoard([...SOLVED_BOARD, 15]), false);
    assert.equal(isValidBoard('1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,0'), false);
  });

  test('a repeated tile or a tile above 15 makes the board invalid', () => {
    // Given 15 twice, and 16 in place of 15
    const repeated = grid`
       1  2  3  4
       5  6  7  8
       9 10 11 12
      13 14 15 15
    `;
    const aboveFifteen = grid`
       1  2  3  4
       5  6  7  8
       9 10 11 12
      13 14 16  _
    `;

    assert.equal(isValidBoard(repeated), false);
    assert.equal(isValidBoard(aboveFifteen), false);
  });

  test('a fractional, negative or non-number cell makes the board invalid', () => {
    // Given 1.5, -1 and '1' in place of tile 1 (a drawing cannot hold them, so they are written out)
    const fractional = [1.5, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0];
    const negative = [-1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0];
    const text = ['1', 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0];

    assert.equal(isValidBoard(fractional), false);
    assert.equal(isValidBoard(negative), false);
    assert.equal(isValidBoard(text), false);
  });
});

describe('isSolved', () => {
  test('only the goal board is solved, not one a single move away', () => {
    const goal = grid`
       1  2  3  4
       5  6  7  8
       9 10 11 12
      13 14 15  _
    `;
    const oneMoveAway = grid`
       1  2  3  4
       5  6  7  8
       9 10 11 12
      13 14  _ 15
    `;

    assert.equal(isSolved(goal), true);
    assert.equal(isSolved(oneMoveAway), false);
  });
});

// Parity rule for a 4-wide board with the goal blank bottom-right: solvable iff
// (inversions among the tiles + row of the blank counted from the bottom, 1-based) is odd.
// The counts below are by hand, so a reader can check them without the code.
describe('isSolvable', () => {
  // Sam Loyd's 14-15 puzzle: Johnson & Story, "Notes on the '15' Puzzle",
  // American Journal of Mathematics 2(4), 1879. 1 inversion (15 > 14) + blank row 1 = 2, even.
  test("Sam Loyd's 14-15 puzzle is unsolvable", () => {
    const loyd = grid`
       1  2  3  4
       5  6  7  8
       9 10 11 12
      13 15 14  _
    `;

    assert.equal(isSolvable(loyd), false);
  });

  test('boards with an odd inversions-plus-blank-row sum are solvable', () => {
    // the goal itself: 0 inversions + blank row 1 = 1, odd
    const goal = SOLVED_BOARD;
    // 3 inversions (13, 14, 15 > 12) + blank row 2 = 5, odd
    const twelveDown = grid`
       1  2  3  4
       5  6  7  8
       9 10 11  _
      13 14 15 12
    `;
    // 1 inversion (15 > 14) + blank row 4 = 5, odd
    const blankTopLeft = grid`
       _  1  2  3
       4  5  6  7
       8  9 10 11
      12 13 15 14
    `;

    assert.equal(isSolvable(goal), true);
    assert.equal(isSolvable(twelveDown), true);
    assert.equal(isSolvable(blankTopLeft), true);
  });

  test('a board with an even inversions-plus-blank-row sum is unsolvable', () => {
    // 0 inversions + blank row 4 = 4, even
    const inOrderBlankFirst = grid`
       _  1  2  3
       4  5  6  7
       8  9 10 11
      12 13 14 15
    `;

    assert.equal(isSolvable(inOrderBlankFirst), false);
  });

  test('the reversed board is solvable with the blank first and unsolvable with it last', () => {
    // every pair of tiles is inverted: 15 * 14 / 2 = 105 inversions
    // blank first: 105 + blank row 4 = 109, odd
    const blankFirst = grid`
       _ 15 14 13
      12 11 10  9
       8  7  6  5
       4  3  2  1
    `;
    // blank last: 105 + blank row 1 = 106, even
    const blankLast = grid`
      15 14 13 12
      11 10  9  8
       7  6  5  4
       3  2  1  _
    `;

    assert.equal(isSolvable(blankFirst), true);
    assert.equal(isSolvable(blankLast), false);
  });

  test('swapping two tiles flips whether a board is solvable', () => {
    fc.assert(
      fc.property(anyBoard, tileNumber, tileNumber, (board, a, b) => {
        fc.pre(a !== b);
        const swapped = board.with(board.indexOf(a), b).with(board.indexOf(b), a);
        assert.notEqual(isSolvable(swapped), isSolvable(board));
      }),
    );
  });
});

describe('legalMoves', () => {
  test('the four tiles around a blank in the middle are listed in ascending order', () => {
    const board = grid`
       1  9  3  4
       6  _  2  8
       5 10 11 12
      13 14 15  7
    `;

    assert.deepEqual(legalMoves(board), [2, 6, 9, 10]);
  });

  test('the tile at the end of the row above does not touch a blank at the start of a row', () => {
    // Given the blank at the start of row 2 and tile 4 at the end of row 1
    const board = grid`
       1  2  3  4
       _  5  6  7
       8  9 10 11
      12 13 14 15
    `;

    // Then tile 4 is not a legal move
    assert.deepEqual(legalMoves(board), [1, 5, 8]);
  });

  test('every board has two, three or four legal moves', () => {
    fc.assert(fc.property(anyBoard, (board) => [2, 3, 4].includes(legalMoves(board).length)));
  });
});

describe('applyMove', () => {
  test('the tile at the start of the row below does not touch a blank at the end of a row', () => {
    // Given the blank at the end of row 2 and tile 9 at the start of row 3
    const board = grid`
       1  2  3  4
       5  6  7  _
       9 10 11  8
      13 14 15 12
    `;

    // When tile 9 tries to slide
    const moved = applyMove(board, 9);

    // Then it cannot
    assert.equal(moved, undefined);
  });

  test('a number that is not a tile on the board cannot move', () => {
    // Given the blank in the top-right corner
    const board = grid`
       1  2  3  _
       5  6  7  4
       9 10 11  8
      13 14 15 12
    `;

    // Then the blank itself, 16 and 3.5 cannot slide
    assert.equal(applyMove(board, 0), undefined);
    assert.equal(applyMove(board, 16), undefined);
    assert.equal(applyMove(board, 3.5), undefined);
  });

  test('on a board without a blank no tile can move', () => {
    const noBlank = grid`
       1  2  3  4
       5  6  7  8
       9 10 11 12
      13 14 15 16
    `;

    assert.equal(applyMove(noBlank, 4), undefined);
  });

  test('a move is accepted exactly when the tile is a legal move', () => {
    fc.assert(
      fc.property(
        anyBoard,
        fc.integer({ min: -1, max: 16 }),
        (board, tile) =>
          (applyMove(board, tile) !== undefined) === legalMoves(board).includes(tile),
      ),
    );
  });

  test('a move swaps the tile and the blank and changes no other cell', () => {
    fc.assert(
      fc.property(boardAndLegalTile, ({ board, tile }) => {
        const moved = applyMove(board, tile);
        assert.ok(moved);
        assert.deepEqual([moved[board.indexOf(0)], moved[board.indexOf(tile)]], [tile, 0]);
        assert.deepEqual(moved.with(board.indexOf(tile), tile).with(board.indexOf(0), 0), board);
      }),
    );
  });

  test('sliding the same tile twice restores the board', () => {
    fc.assert(
      fc.property(boardAndLegalTile, ({ board, tile }) => {
        const once = applyMove(board, tile);
        assert.ok(once);
        assert.deepEqual(applyMove(once, tile), board);
      }),
    );
  });
});
