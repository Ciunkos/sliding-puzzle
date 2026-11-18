import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { grid } from '../test-support/grid.ts';
import { keyDirection, movable, swipeDirection, tabStopTile, tileForDirection } from './input.ts';

/** A key pressed without Ctrl, Cmd or Alt. */
function plain(key: string) {
  return { key, ctrlKey: false, metaKey: false, altKey: false };
}

/** The blank in the middle: 2 is above it, 8 below, 4 to its left, 6 to its right. */
const BLANK_IN_THE_MIDDLE = grid`
  1 2 3
  4 _ 6
  7 8 5
`;
/** The blank in the top-left corner of a 4x4 board: only 1 (right) and 4 (below) touch it. */
const BLANK_TOP_LEFT = grid`
   _  1  2  3
   4  5  6  7
   8  9 10 11
  12 13 14 15
`;
/** The blank in the bottom-right corner of a 5x5 board: only 20 (above) and 24 (left) touch it. */
const SOLVED_5 = grid`
   1  2  3  4  5
   6  7  8  9 10
  11 12 13 14 15
  16 17 18 19 20
  21 22 23 24  _
`;

describe('tileForDirection', () => {
  test('a direction names where the tile goes: the tile on the opposite side of the blank', () => {
    const tiles = [
      tileForDirection(BLANK_IN_THE_MIDDLE, 'left'),
      tileForDirection(BLANK_IN_THE_MIDDLE, 'right'),
      tileForDirection(BLANK_IN_THE_MIDDLE, 'up'),
      tileForDirection(BLANK_IN_THE_MIDDLE, 'down'),
    ];

    // Then left takes the tile on the right (6), right the one on the left (4), up the one below (8)
    assert.deepEqual(tiles, [6, 4, 8, 2]);
  });

  test('with the blank top-left nothing can slide right or down into it', () => {
    assert.equal(tileForDirection(BLANK_TOP_LEFT, 'right'), undefined);
    assert.equal(tileForDirection(BLANK_TOP_LEFT, 'down'), undefined);
    assert.deepEqual(
      [tileForDirection(BLANK_TOP_LEFT, 'left'), tileForDirection(BLANK_TOP_LEFT, 'up')],
      [1, 4],
    );
  });

  test('with the blank bottom-right nothing can slide left or up into it', () => {
    assert.equal(tileForDirection(SOLVED_5, 'left'), undefined);
    assert.equal(tileForDirection(SOLVED_5, 'up'), undefined);
    assert.deepEqual(
      [tileForDirection(SOLVED_5, 'right'), tileForDirection(SOLVED_5, 'down')],
      [24, 20],
    );
  });

  test('a list that is not a board, or has no blank, has no tile for any direction', () => {
    assert.equal(tileForDirection([1, 0, 2, 3], 'left'), undefined);
    assert.equal(tileForDirection([1, 2, 3, 4, 5, 6, 7, 8, 9], 'left'), undefined);
  });
});

describe('keyDirection', () => {
  test('the arrow keys name their direction', () => {
    const keys = [
      keyDirection(plain('ArrowUp')),
      keyDirection(plain('ArrowDown')),
      keyDirection(plain('ArrowLeft')),
      keyDirection(plain('ArrowRight')),
    ];

    assert.deepEqual(keys, ['up', 'down', 'left', 'right']);
  });

  test('W, A, S and D name the same directions in either case', () => {
    const lower = [
      keyDirection(plain('w')),
      keyDirection(plain('a')),
      keyDirection(plain('s')),
      keyDirection(plain('d')),
    ];
    const upper = [
      keyDirection(plain('W')),
      keyDirection(plain('A')),
      keyDirection(plain('S')),
      keyDirection(plain('D')),
    ];

    assert.deepEqual(lower, ['up', 'left', 'down', 'right']);
    assert.deepEqual(upper, ['up', 'left', 'down', 'right']);
  });

  test('other keys, and names of object properties, name no direction', () => {
    assert.deepEqual(
      [keyDirection(plain('Enter')), keyDirection(plain(' ')), keyDirection(plain('x'))],
      [undefined, undefined, undefined],
    );
    assert.equal(keyDirection(plain('constructor')), undefined);
  });
});

describe('keyDirection with modifier keys', () => {
  test('with Ctrl, Cmd or Alt held a key is a shortcut, not a move', () => {
    const shortcuts = [
      keyDirection({ key: 's', ctrlKey: true, metaKey: false, altKey: false }),
      keyDirection({ key: 'a', ctrlKey: false, metaKey: true, altKey: false }),
      keyDirection({ key: 'ArrowLeft', ctrlKey: false, metaKey: false, altKey: true }),
    ];

    assert.deepEqual(shortcuts, [undefined, undefined, undefined]);
  });

  test('Shift alone does not stop a move: Shift+S is down', () => {
    assert.equal(keyDirection(plain('S')), 'down');
  });
});

describe('tabStopTile', () => {
  test('the tile that moved or had focus last holds the tab stop', () => {
    assert.equal(tabStopTile(BLANK_IN_THE_MIDDLE, false, 7), 7);
  });

  test('without one the lowest-numbered tile that can move holds it', () => {
    assert.equal(tabStopTile(BLANK_IN_THE_MIDDLE, false, undefined), 2);
  });

  test('a number that is not a tile here, or a finished game, falls back to the lowest tile that fits', () => {
    // Given 9 (not on a 3x3 board) and 0 (the blank)
    assert.deepEqual(
      [tabStopTile(BLANK_IN_THE_MIDDLE, false, 9), tabStopTile(BLANK_IN_THE_MIDDLE, false, 0)],
      [2, 2],
    );
    // Then in a finished game no tile can move, so tile 1 holds it
    assert.equal(tabStopTile(BLANK_IN_THE_MIDDLE, true, undefined), 1);
  });
});

describe('swipeDirection', () => {
  test('a movement of 24 px or more along one axis is a swipe that way (y grows downwards)', () => {
    const swipes = [
      swipeDirection(24, 0),
      swipeDirection(-24, 0),
      swipeDirection(0, 24),
      swipeDirection(0, -24),
    ];

    assert.deepEqual(swipes, ['right', 'left', 'down', 'up']);
  });

  test('a movement shorter than 24 px is a tap, not a swipe', () => {
    assert.deepEqual(
      [swipeDirection(23, 0), swipeDirection(0, -23), swipeDirection(0, 0)],
      [undefined, undefined, undefined],
    );
  });

  test('a movement counts when its main axis is at least 1.5 times the other', () => {
    // Given 30 px across with 20 px of drift, and 30 px down with 20 px of drift: exactly 1.5 times
    assert.deepEqual([swipeDirection(30, 20), swipeDirection(-20, 30)], ['right', 'down']);
    // Then a slightly more diagonal movement is no swipe
    assert.deepEqual([swipeDirection(30, 21), swipeDirection(21, -30)], [undefined, undefined]);
  });
});

describe('movable', () => {
  test('a tile next to the blank of an open game is the one to move', () => {
    assert.equal(movable(BLANK_IN_THE_MIDDLE, false, 6), 6);
  });

  test('a tile away from the blank, no tile, or any tile of a finished game moves nothing', () => {
    assert.deepEqual(
      [movable(BLANK_IN_THE_MIDDLE, false, 1), movable(BLANK_IN_THE_MIDDLE, false, undefined)],
      [undefined, undefined],
    );
    assert.equal(movable(BLANK_IN_THE_MIDDLE, true, 6), undefined);
    assert.equal(movable(BLANK_IN_THE_MIDDLE, false, Number.NaN), undefined);
  });
});
