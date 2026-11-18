import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import fc from 'fast-check';
import { grid } from '../test-support/grid.ts';
import { permutationsWhere, reachableKeys } from '../test-support/reachable.ts';
import {
  applyMove,
  isSolvable,
  isSolved,
  isValidBoard,
  legalMoves,
  SIZES,
  sizeOf,
  solvedBoard,
} from './rules.ts';

/** Any arrangement of the cells of a 3x3, 4x4 or 5x5 board, solvable or not. */
const anyBoard = fc
  .constantFrom(...SIZES)
  .chain((size) => fc.shuffledSubarray([...Array(size * size).keys()], { minLength: size * size }));
const boardAndLegalTile = anyBoard.chain((board) =>
  fc.record({ board: fc.constant(board), tile: fc.constantFrom(...legalMoves(board)) }),
);
const boardAndTwoTiles = anyBoard.chain((board) =>
  fc.record({
    board: fc.constant(board),
    a: fc.integer({ min: 1, max: board.length - 1 }),
    b: fc.integer({ min: 1, max: board.length - 1 }),
  }),
);

const SOLVED_3 = grid`
  1 2 3
  4 5 6
  7 8 _
`;
const SOLVED_5 = grid`
   1  2  3  4  5
   6  7  8  9 10
  11 12 13 14 15
  16 17 18 19 20
  21 22 23 24  _
`;

describe('sizeOf and solvedBoard', () => {
  test('a board of 9, 16 or 25 cells is 3, 4 or 5 wide, any other length has no size', () => {
    assert.deepEqual([sizeOf(SOLVED_3), sizeOf(Array(16)), sizeOf(SOLVED_5)], [3, 4, 5]);
    assert.deepEqual(
      [sizeOf([]), sizeOf(Array(4)), sizeOf(Array(36))],
      [undefined, undefined, undefined],
    );
  });

  test('the solved board has the tiles in order and the blank bottom-right', () => {
    assert.deepEqual(solvedBoard(3), SOLVED_3);
    assert.deepEqual(solvedBoard(5), SOLVED_5);
  });
});

describe('isValidBoard', () => {
  test('every arrangement of the cells of a 3x3, 4x4 or 5x5 board is valid', () => {
    fc.assert(fc.property(anyBoard, (board) => isValidBoard(board)));
  });

  test('a value that is not 9, 16 or 25 cells is not a board', () => {
    const fourCells = grid`
      1 2
      3 _
    `;

    assert.equal(isValidBoard(fourCells), false);
    assert.equal(isValidBoard([...SOLVED_3, 9]), false);
    assert.equal(isValidBoard('123456780'), false);
  });

  test('an empty list is not a board', () => {
    assert.equal(isValidBoard([]), false);
  });

  test('a repeated tile or a tile above the largest makes the board invalid', () => {
    // Given 8 twice, and 9 in place of 8 on a 3x3 board
    const repeated = grid`
      1 2 3
      4 5 6
      7 8 8
    `;
    const aboveEight = grid`
      1 2 3
      4 5 6
      7 9 _
    `;

    assert.equal(isValidBoard(repeated), false);
    assert.equal(isValidBoard(aboveEight), false);
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
    const oneMoveAway = grid`
       1  2  3  4
       5  6  7  8
       9 10 11 12
      13 14  _ 15
    `;

    assert.equal(isSolved(solvedBoard(4)), true);
    assert.equal(isSolved(oneMoveAway), false);
  });

  test('the goal of each size is solved, and a list of another length never is', () => {
    assert.deepEqual([isSolved(SOLVED_3), isSolved(SOLVED_5)], [true, true]);
    assert.deepEqual([isSolved([1, 2, 3, 0]), isSolved([])], [false, false]);
  });
});

// Parity rules for the goal "tiles in order, blank bottom-right". Odd width: solvable iff the
// inversions among the tiles are even. Even width: solvable iff (inversions + row of the blank
// counted from the bottom, 1-based) is odd. The counts below are by hand, checkable without code.
describe('isSolvable on 3x3 and 5x5 boards', () => {
  test('a 3x3 board with 10 inversions is solvable and one with 11 is not', () => {
    // 8 > 2 4 3 7 6 5 (6), 4 > 3 (1), 7 > 6 5 (2), 6 > 5 (1): 10, even
    const ten = grid`
      1 8 2
      _ 4 3
      7 6 5
    `;
    // the same with 8 and 1 swapped: 8 > 1 2 4 3 7 6 5 (7) + 4 > 3, 7 > 6 5, 6 > 5 (4): 11, odd
    const eleven = grid`
      8 1 2
      _ 4 3
      7 6 5
    `;

    assert.equal(isSolvable(ten), true);
    assert.equal(isSolvable(eleven), false);
  });

  test('the solved 3x3 board with 7 and 8 swapped is unsolvable', () => {
    // 1 inversion (8 > 7), odd
    const swapped = grid`
      1 2 3
      4 5 6
      8 7 _
    `;

    assert.equal(isSolvable(swapped), false);
  });

  test('on a 5x5 board the blank row does not count: tiles in order are solvable wherever it is', () => {
    // 0 inversions, even (on a 4x4 board the same layout is unsolvable, see below)
    const blankFirst = grid`
       _  1  2  3  4
       5  6  7  8  9
      10 11 12 13 14
      15 16 17 18 19
      20 21 22 23 24
    `;

    assert.equal(isSolvable(SOLVED_5), true);
    assert.equal(isSolvable(blankFirst), true);
  });

  test('the solved 5x5 board with 23 and 24 swapped is unsolvable', () => {
    // 1 inversion (24 > 23), odd
    const swapped = grid`
       1  2  3  4  5
       6  7  8  9 10
      11 12 13 14 15
      16 17 18 19 20
      21 22 24 23  _
    `;

    assert.equal(isSolvable(swapped), false);
  });

  test('a list of another length is never solvable', () => {
    assert.equal(isSolvable([1, 2, 3, 0]), false);
  });

  test('isSolvable says yes for exactly the 181,440 3x3 arrangements reachable from solved', () => {
    // Given every board that legal moves reach from the solved 3x3 board (a search, not the parity rule)
    const reached = reachableKeys(SOLVED_3, legalMoves, applyMove, (board) => board.join(','));

    // Then that is 9!/2 of the 9! = 362,880 arrangements, and isSolvable agrees on every arrangement
    const disagree = (board: readonly number[]) =>
      isSolvable(board) !== reached.has(board.join(','));
    assert.equal(reached.size, 181_440);
    assert.deepEqual(permutationsWhere(9, disagree), { count: 0, first: undefined });
  });
});

describe('isSolvable on 4x4 boards', () => {
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
    const goal = solvedBoard(4);
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
});

describe('isSolvable on every size', () => {
  test('swapping two tiles flips whether a board is solvable', () => {
    fc.assert(
      fc.property(boardAndTwoTiles, ({ board, a, b }) => {
        fc.pre(a !== b);
        const swapped = board.with(board.indexOf(a), b).with(board.indexOf(b), a);
        assert.notEqual(isSolvable(swapped), isSolvable(board));
      }),
    );
  });

  test('a legal move keeps a board valid and keeps whether it is solvable', () => {
    fc.assert(
      fc.property(boardAndLegalTile, ({ board, tile }) => {
        const moved = applyMove(board, tile);
        assert.equal(isValidBoard(moved), true);
        assert.ok(moved);
        assert.equal(isSolvable(moved), isSolvable(board));
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

  test('on 3x3 and 5x5 boards the neighbours follow the width', () => {
    // Given the blank in the middle of a 3x3 board, and at the end of row 2 of a 5x5 board
    const middle = grid`
      1 2 3
      4 _ 5
      6 7 8
    `;
    const endOfRow = grid`
       1  2  3  4  5
       6  7  8  9  _
      10 11 12 13 14
      15 16 17 18 19
      20 21 22 23 24
    `;

    assert.deepEqual(legalMoves(middle), [2, 4, 5, 7]);
    assert.deepEqual(legalMoves(endOfRow), [5, 9, 14]);
  });

  test('a list of another length has no legal moves', () => {
    assert.deepEqual(legalMoves([1, 2, 3, 0]), []);
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

  test('on a list of another length no tile can move', () => {
    // Given 1 next to the blank in a 2x2 drawing
    assert.equal(applyMove([1, 0, 2, 3], 1), undefined);
  });

  test('a 3x3 move slides the tile below the blank up into it', () => {
    const moved = applyMove(
      grid`
        1 2 3
        4 _ 6
        7 5 8
      `,
      5,
    );

    assert.deepEqual(moved, SOLVED_3_WITH_BLANK_IN_ROW_3);
  });

  test('a move is accepted exactly when the tile is a legal move', () => {
    fc.assert(
      fc.property(
        anyBoard,
        fc.integer({ min: -1, max: 26 }),
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

const SOLVED_3_WITH_BLANK_IN_ROW_3 = grid`
  1 2 3
  4 5 6
  7 _ 8
`;
