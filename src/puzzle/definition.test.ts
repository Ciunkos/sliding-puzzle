import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { grid } from '../test-support/grid.ts';
import { repeated, scriptedRng } from '../test-support/scripted-rng.ts';
import { puzzleDefinition } from './definition.ts';

const SOLVED = grid`
   1  2  3  4
   5  6  7  8
   9 10 11 12
  13 14 15  _
`;
/** One legal move (tile 12) from the solved board. */
const TWELVE_DOWN = grid`
   1  2  3  4
   5  6  7  8
   9 10 11  _
  13 14 15 12
`;

/** The end of a walk that always slides the lowest-numbered tile it may (see shuffle.ts). */
const AFTER_LOWEST_WALK_3 = grid`
  4 3 _
  5 2 1
  7 8 6
`;
const AFTER_LOWEST_WALK_5 = grid`
   6  3  1  4  5
   7  _  2  8  9
  11 12 13 14 10
  16 17 18 19 15
  21 22 23 24 20
`;

describe('puzzleDefinition', () => {
  test('a new game is a board shuffled with the given random source', () => {
    // Given a source that always picks the lowest-numbered tile it may move
    const random = scriptedRng(repeated([0], 200));

    // When a game starts
    const state = puzzleDefinition.start({}, random);

    // Then its board is the end of that walk
    assert.deepEqual(state, {
      board: grid`
         5  1  _  4
         6  3  2  7
         9 10 11  8
        13 14 15 12
      `,
    });
  });

  test('the size option chooses a 3x3 or a 5x5 board', () => {
    // Given sources that always pick the lowest-numbered tile, one walk long for each size
    const three = puzzleDefinition.start({ size: 3 }, scriptedRng(repeated([0], 96)));
    const five = puzzleDefinition.start({ size: 5 }, scriptedRng(repeated([0], 616)));

    // Then each board is the end of its walk
    assert.deepEqual(three, { board: AFTER_LOWEST_WALK_3 });
    assert.deepEqual(five, { board: AFTER_LOWEST_WALK_5 });
  });

  test('the variant of a game is its board size, e.g. "4x4"', () => {
    const variants = [
      puzzleDefinition.variant({ board: AFTER_LOWEST_WALK_3 }),
      puzzleDefinition.variant({ board: SOLVED }),
      puzzleDefinition.variant({ board: AFTER_LOWEST_WALK_5 }),
    ];

    assert.deepEqual(variants, ['3x3', '4x4', '5x5']);
  });

  test('a legal move gives the board after the slide', () => {
    const next = puzzleDefinition.apply({ board: SOLVED }, { tile: 12 });

    assert.deepEqual(next, { board: TWELVE_DOWN });
  });

  test('an illegal move gives no state', () => {
    const next = puzzleDefinition.apply({ board: SOLVED }, { tile: 1 });

    assert.equal(next, undefined);
  });

  test('a game is finished exactly when the board is solved', () => {
    assert.equal(puzzleDefinition.isFinished({ board: SOLVED }), true);
    assert.equal(puzzleDefinition.isFinished({ board: TWELVE_DOWN }), false);
  });

  test('only a solvable board that is not yet solved is a valid start', () => {
    // Given Sam Loyd's 14-15 puzzle, which is unsolvable
    const loyd = grid`
       1  2  3  4
       5  6  7  8
       9 10 11 12
      13 15 14  _
    `;

    assert.equal(puzzleDefinition.isValidStart({ board: TWELVE_DOWN }), true);
    assert.equal(puzzleDefinition.isValidStart({ board: SOLVED }), false);
    assert.equal(puzzleDefinition.isValidStart({ board: loyd }), false);
  });

  test('a stored state is accepted only with a valid board', () => {
    const repeatedTile = { board: [1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] };

    assert.equal(puzzleDefinition.stateSchema.safeParse({ board: SOLVED }).success, true);
    assert.equal(puzzleDefinition.stateSchema.safeParse(repeatedTile).success, false);
  });

  test('a stored 3x3 or 5x5 state is accepted too', () => {
    const three = {
      board: grid`
      1 2 3
      4 5 6
      7 8 _
    `,
    };

    assert.equal(puzzleDefinition.stateSchema.safeParse(three).success, true);
    assert.equal(
      puzzleDefinition.stateSchema.safeParse({ board: AFTER_LOWEST_WALK_5 }).success,
      true,
    );
  });

  test('a move must name a whole tile number from 1 to 24', () => {
    assert.equal(puzzleDefinition.moveSchema.safeParse({ tile: 0 }).success, false);
    assert.equal(puzzleDefinition.moveSchema.safeParse({ tile: 25 }).success, false);
    assert.equal(puzzleDefinition.moveSchema.safeParse({ tile: 1.5 }).success, false);
  });

  test('new-game options take a size of 3, 4 or 5 and nothing else', () => {
    const parse = (value: unknown) => puzzleDefinition.optionsSchema.safeParse(value).success;

    assert.deepEqual([parse({}), parse({ size: 3 }), parse({ size: 5 })], [true, true, true]);
    assert.deepEqual([parse({ size: 6 }), parse({ size: '4' })], [false, false]);
    assert.equal(parse({ colour: 'red' }), false);
  });
});
