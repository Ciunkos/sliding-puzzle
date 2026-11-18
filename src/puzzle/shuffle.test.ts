import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import fc from 'fast-check';
import { grid } from '../test-support/grid.ts';
import { repeated, scriptedRng } from '../test-support/scripted-rng.ts';
import { isSolvable, isSolved, isValidBoard, SIZES, sizeOf } from './index.ts';
import { shuffle } from './shuffle.ts';

/** With 0.5 at every step, a walk happens to end back on the solved board (96, 200, 616 moves). */
const WALK_THAT_ENDS_SOLVED_3 = repeated([0.5], 96);
const WALK_THAT_ENDS_SOLVED_4 = repeated([0.5], 200);
const WALK_THAT_ENDS_SOLVED_5 = repeated([0.5], 616);
/** Enough picks for three walks of the longest size, so a rigged script never runs out. */
const PICKS = 3 * 616;

describe('shuffle', () => {
  test('a source that always returns nearly 1 still gives an unsolved board', () => {
    // Given a source that always picks the highest-numbered tile it may move
    const rng = (): number => 0.999999;

    // When the board is shuffled (it used to toggle tile 15 forever)
    const board = shuffle(4, rng);

    // Then it is a valid unsolved board reached without undoing a move
    assert.deepEqual(
      board,
      grid`
         1  2  3  4
         5  6  7  8
        10 14 13 11
         9  _ 15 12
      `,
    );
  });

  test('a source that always returns 0.7 still gives an unsolved board', () => {
    const board = shuffle(4, () => 0.7);

    assert.deepEqual(
      board,
      grid`
         1  2  3  4
         5  6  7  8
        10 14 13 11
         9  _ 15 12
      `,
    );
  });

  test('a walk that ends on the solved board is thrown away and walked again', () => {
    // Given a script whose first walk ends solved and whose second walk always picks the lowest tile
    const rng = scriptedRng([...WALK_THAT_ENDS_SOLVED_4, ...repeated([0], 200)]);

    // When the board is shuffled
    const board = shuffle(4, rng);

    // Then it is the end of the second walk
    assert.deepEqual(
      board,
      grid`
         5  1  _  4
         6  3  2  7
         9 10 11  8
        13 14 15 12
      `,
    );
  });

  test('after three 4x4 walks that all end solved the fixed fallback board is returned', () => {
    // Given exactly three walks' worth of a source that always returns the same value: a fourth
    // walk would throw, because the script runs out
    const rng = scriptedRng(repeated(WALK_THAT_ENDS_SOLVED_4, 3));

    // When the board is shuffled
    const board = shuffle(4, rng);

    // Then it is the fallback: 12 slid down, then 8 slid down (6 inversions + blank row 3 = 9, odd)
    assert.deepEqual(
      board,
      grid`
         1  2  3  4
         5  6  7  _
         9 10 11  8
        13 14 15 12
      `,
    );
  });

  test('after three 3x3 walks that all end solved the 3x3 fallback board is returned', () => {
    const rng = scriptedRng(repeated(WALK_THAT_ENDS_SOLVED_3, 3));

    const board = shuffle(3, rng);

    // Then it is 6 slid down, then 3 slid down (4 inversions: 4, 5 > 3 and 7, 8 > 6; even)
    assert.deepEqual(
      board,
      grid`
        1 2 _
        4 5 3
        7 8 6
      `,
    );
  });

  test('after three 5x5 walks that all end solved the 5x5 fallback board is returned', () => {
    const rng = scriptedRng(repeated(WALK_THAT_ENDS_SOLVED_5, 3));

    const board = shuffle(5, rng);

    // Then it is 20, 15, 10 and 5 slid down in turn (16 inversions: four larger tiles before each
    // of 5, 10, 15 and 20; even)
    assert.deepEqual(
      board,
      grid`
         1  2  3  4  _
         6  7  8  9  5
        11 12 13 14 10
        16 17 18 19 15
        21 22 23 24 20
      `,
    );
  });

  test('any picks among the legal moves end on a valid, solvable, unsolved board of the size', () => {
    const pick = fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true });
    const picks = fc.array(pick, { minLength: PICKS, maxLength: PICKS });

    fc.assert(
      fc.property(fc.constantFrom(...SIZES), picks, (size, values) => {
        const board = shuffle(size, scriptedRng(values));
        const facts = {
          size: sizeOf(board),
          valid: isValidBoard(board),
          solvable: isSolvable(board),
        };
        assert.deepEqual(facts, { size, valid: true, solvable: true });
        assert.equal(isSolved(board), false);
      }),
    );
  });
});
