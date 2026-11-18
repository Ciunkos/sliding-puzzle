import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { SavedGame } from '../game/index.ts';
import { grid } from '../test-support/grid.ts';
import type { PuzzleState } from './index.ts';
import { solvedText, statusText, toCells } from './view-model.ts';

/** One move (tile 12) away from solved: tiles 8, 11 and 12 can slide into the blank. */
const TWELVE_DOWN = grid`
   1  2  3  4
   5  6  7  8
   9 10 11  _
  13 14 15 12
`;

function savedGame(moves: number, finished: boolean): SavedGame<PuzzleState> {
  return {
    state: { board: TWELVE_DOWN },
    initial: { board: TWELVE_DOWN },
    moves,
    finished,
    version: 1,
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: null,
  };
}

describe('toCells', () => {
  test('in an open game the tiles next to the blank are movable', () => {
    const cells = toCells(savedGame(0, false));

    // prettier-ignore
    assert.deepEqual(cells, [
      { tile: 1, movable: false }, { tile: 2, movable: false }, { tile: 3, movable: false }, { tile: 4, movable: false },
      { tile: 5, movable: false }, { tile: 6, movable: false }, { tile: 7, movable: false }, { tile: 8, movable: true },
      { tile: 9, movable: false }, { tile: 10, movable: false }, { tile: 11, movable: true }, { tile: 0, movable: false },
      { tile: 13, movable: false }, { tile: 14, movable: false }, { tile: 15, movable: false }, { tile: 12, movable: true },
    ]);
  });

  test('in a finished game no tile is movable', () => {
    const cells = toCells(savedGame(3, true));

    // prettier-ignore
    assert.deepEqual(cells, [
      { tile: 1, movable: false }, { tile: 2, movable: false }, { tile: 3, movable: false }, { tile: 4, movable: false },
      { tile: 5, movable: false }, { tile: 6, movable: false }, { tile: 7, movable: false }, { tile: 8, movable: false },
      { tile: 9, movable: false }, { tile: 10, movable: false }, { tile: 11, movable: false }, { tile: 0, movable: false },
      { tile: 13, movable: false }, { tile: 14, movable: false }, { tile: 15, movable: false }, { tile: 12, movable: false },
    ]);
  });
});

describe('solvedText', () => {
  test('one move is counted in the singular', () => {
    assert.equal(solvedText(savedGame(1, true)), 'Solved in 1 move!');
  });

  test('more moves are counted in the plural', () => {
    assert.equal(solvedText(savedGame(2, true)), 'Solved in 2 moves!');
  });
});

describe('statusText', () => {
  test('the status shows the move count', () => {
    assert.equal(statusText(savedGame(7, false)), 'Moves: 7');
  });
});
