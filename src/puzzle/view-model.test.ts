import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { SavedGame } from '../game/index.ts';
import { grid } from '../test-support/grid.ts';
import type { PuzzleState } from './index.ts';
import { announcement, layout, sizeLabel, solvedText, statusText } from './view-model.ts';

/** One move (tile 12) away from solved: tiles 8, 11 and 12 can slide into the blank. */
const TWELVE_DOWN = grid`
   1  2  3  4
   5  6  7  8
   9 10 11  _
  13 14 15 12
`;
/** A 3x3 board with the blank in the middle: 2, 4, 6 and 8 can slide. */
const BLANK_IN_THE_MIDDLE = grid`
  3 2 1
  4 _ 6
  7 8 5
`;
/** BLANK_IN_THE_MIDDLE after tile 6 slid left. */
const SIX_LEFT = grid`
  3 2 1
  4 6 _
  7 8 5
`;

function savedGame(
  board: readonly number[],
  moves: number,
  finished: boolean,
): SavedGame<PuzzleState> {
  return {
    state: { board },
    initial: { board },
    moves,
    finished,
    version: 1,
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: null,
  };
}

describe('layout', () => {
  test('a 3x3 game lists its tiles by number with their row, column and whether they can move', () => {
    const view = layout(savedGame(BLANK_IN_THE_MIDDLE, 0, false));

    // prettier-ignore
    assert.deepEqual(view, {
      size: 3,
      tiles: [
        { tile: 1, row: 0, col: 2, movable: false }, { tile: 2, row: 0, col: 1, movable: true },
        { tile: 3, row: 0, col: 0, movable: false }, { tile: 4, row: 1, col: 0, movable: true },
        { tile: 5, row: 2, col: 2, movable: false }, { tile: 6, row: 1, col: 2, movable: true },
        { tile: 7, row: 2, col: 0, movable: false }, { tile: 8, row: 2, col: 1, movable: true },
      ],
      blank: { row: 1, col: 1 },
    });
  });

  test('in a 4x4 game the tiles next to the blank are the movable ones', () => {
    const view = layout(savedGame(TWELVE_DOWN, 0, false));

    // prettier-ignore
    assert.deepEqual([view.size, view.blank, view.tiles[7], view.tiles[10], view.tiles[11], view.tiles[14]], [
      4, { row: 2, col: 3 },
      { tile: 8, row: 1, col: 3, movable: true }, { tile: 11, row: 2, col: 2, movable: true },
      { tile: 12, row: 3, col: 3, movable: true }, { tile: 15, row: 3, col: 2, movable: false },
    ]);
  });

  test('in a finished game no tile is movable', () => {
    const view = layout(savedGame(TWELVE_DOWN, 3, true));

    assert.deepEqual(
      [view.tiles[7], view.tiles[10], view.tiles[11]],
      [
        { tile: 8, row: 1, col: 3, movable: false },
        { tile: 11, row: 2, col: 2, movable: false },
        { tile: 12, row: 3, col: 3, movable: false },
      ],
    );
  });
});

describe('sizeLabel', () => {
  test('a size reads as its width times its height', () => {
    assert.deepEqual([sizeLabel(3), sizeLabel(4), sizeLabel(5)], ['3×3', '4×4', '5×5']);
  });
});

describe('solvedText', () => {
  test('one move is counted in the singular', () => {
    assert.equal(solvedText(savedGame(TWELVE_DOWN, 1, true)), 'Solved in 1 move!');
  });

  test('more moves are counted in the plural', () => {
    assert.equal(solvedText(savedGame(TWELVE_DOWN, 2, true)), 'Solved in 2 moves!');
  });
});

describe('statusText', () => {
  test('the status shows the move count', () => {
    assert.equal(statusText(savedGame(TWELVE_DOWN, 7, false)), 'Moves: 7');
  });
});

describe('announcement', () => {
  test('one legal move is announced with the tile and the new move count', () => {
    const text = announcement(BLANK_IN_THE_MIDDLE, savedGame(SIX_LEFT, 12, false));

    assert.equal(text, 'Moved tile 6. 12 moves.');
  });

  test('the first move is counted in the singular', () => {
    assert.equal(
      announcement(BLANK_IN_THE_MIDDLE, savedGame(SIX_LEFT, 1, false)),
      'Moved tile 6. 1 move.',
    );
  });

  test('the solving move announces the win', () => {
    const solved = grid`
      1 2 3
      4 5 6
      7 8 _
    `;

    assert.equal(announcement(SIX_LEFT, savedGame(solved, 34, true)), 'Solved in 34 moves!');
  });

  test('the first game, an unchanged board, a new game or a reset announce nothing', () => {
    assert.equal(announcement(undefined, savedGame(SIX_LEFT, 0, false)), '');
    assert.equal(announcement(SIX_LEFT, savedGame(SIX_LEFT, 4, false)), '');
    assert.equal(announcement(TWELVE_DOWN, savedGame(BLANK_IN_THE_MIDDLE, 0, false)), '');
  });

  test('a change of more than one tile is not taken for a move', () => {
    // Given 2 in the blank's old cell, as if it slid down, but 6 moved into the corner as well
    const twoChanges = grid`
      3 6 1
      4 2 _
      7 8 5
    `;

    assert.equal(announcement(BLANK_IN_THE_MIDDLE, savedGame(twoChanges, 5, false)), '');
  });
});
