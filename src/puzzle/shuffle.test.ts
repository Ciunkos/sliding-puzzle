import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import fc from 'fast-check';
import { grid } from '../test-support/grid.ts';
import { repeated, scriptedRng } from '../test-support/scripted-rng.ts';
import { isSolvable, isSolved, isValidBoard } from './index.ts';
import { shuffle } from './shuffle.ts';

/** With 0.5 at every step, a 200-move walk happens to end back on the solved board. */
const WALK_THAT_ENDS_SOLVED = repeated([0.5], 200);

describe('shuffle', () => {
  test('a source that always returns nearly 1 still gives an unsolved board', () => {
    // Given a source that always picks the highest-numbered tile it may move
    const rng = (): number => 0.999999;

    // When the board is shuffled (it used to toggle tile 15 forever)
    const board = shuffle(rng);

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
    const board = shuffle(() => 0.7);

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
    const rng = scriptedRng([...WALK_THAT_ENDS_SOLVED, ...repeated([0], 200)]);

    // When the board is shuffled
    const board = shuffle(rng);

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

  test('after three walks that all end solved the fixed fallback board is returned', () => {
    // Given exactly three walks' worth of a source that always returns the same value: a fourth
    // walk would throw, because the script runs out
    const rng = scriptedRng(repeated(WALK_THAT_ENDS_SOLVED, 3));

    // When the board is shuffled
    const board = shuffle(rng);

    // Then it is the fallback: 12 slid down, then 8 slid right (6 inversions + blank row 3 = 9, odd)
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

  test('any 200 picks among the legal moves end on a valid, solvable, unsolved board', () => {
    const pick = fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true });
    const picks = fc.array(pick, { minLength: 200, maxLength: 200 });

    fc.assert(
      fc.property(picks, (values) => {
        const board = shuffle(scriptedRng(values));
        assert.equal(isValidBoard(board), true);
        assert.equal(isSolvable(board), true);
        assert.equal(isSolved(board), false);
      }),
    );
  });
});
