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

  test('a move must name a whole tile number from 1 to 15', () => {
    assert.equal(puzzleDefinition.moveSchema.safeParse({ tile: 0 }).success, false);
    assert.equal(puzzleDefinition.moveSchema.safeParse({ tile: 16 }).success, false);
    assert.equal(puzzleDefinition.moveSchema.safeParse({ tile: 1.5 }).success, false);
  });

  test('new-game options with an unknown field are rejected', () => {
    assert.equal(puzzleDefinition.optionsSchema.safeParse({ size: 5 }).success, false);
  });
});
