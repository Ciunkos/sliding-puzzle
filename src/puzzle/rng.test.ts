import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import fc from 'fast-check';
import { grid } from '../test-support/grid.ts';
import { isSolvable, isSolved, isValidBoard, SIZES, shuffle, sizeOf } from './index.ts';
import { createRng } from './rng.ts';

// Known answers: mulberry32 from its published definition, run as a one-off script outside this
// code base (node -e), not with createRng:
// a = seed; a += 0x6D2B79F5; t = imul(a ^ a >>> 15, a | 1); t ^= t + imul(t ^ t >>> 7, t | 61);
// result = ((t ^ t >>> 14) >>> 0) / 4294967296
describe('createRng', () => {
  test('seed 1 starts with the known mulberry32 outputs', () => {
    const rng = createRng(1);

    const firstThree = [rng(), rng(), rng()];

    assert.deepEqual(firstThree, [0.6270739405881613, 0.002735721180215478, 0.5274470399599522]);
  });

  test('seed 42 starts with the known mulberry32 outputs', () => {
    const rng = createRng(42);

    const firstThree = [rng(), rng(), rng()];

    assert.deepEqual(firstThree, [0.6011037519201636, 0.44829055899754167, 0.8524657934904099]);
  });
});

describe('shuffle with a seeded rng', () => {
  test('seed 1 always shuffles to the same board', () => {
    // Characterisation, not an outside answer: the board shuffle(createRng(1)) gave when this was
    // written. It changes when the walk or the generator changes, which is the point.
    const board = shuffle(4, createRng(1));

    assert.deepEqual(
      board,
      grid`
        11 12  6  7
         9  8  5  3
        10 13  _  2
        15  1  4 14
      `,
    );
  });

  test('any seed shuffles to a valid, solvable, unsolved board of the asked size', () => {
    const seed = fc.integer({ min: 0, max: 0xffffffff });
    fc.assert(
      fc.property(fc.constantFrom(...SIZES), seed, (size, s) => {
        const board = shuffle(size, createRng(s));
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
