import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import fc from 'fast-check';
import { grid } from '../test-support/grid.ts';
import {
  COMMIT_SHARE,
  dragShift,
  expects,
  isTap,
  keyDirection,
  movable,
  progressOf,
  releaseGesture,
  startGesture,
  stepGesture,
  swipeDirection,
  tabStopTile,
  tileForDirection,
} from './input.ts';

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

/** Tile 2 is left of the gap and slides right; then tile 1 behind it can follow. */
const ROW_TO_PUSH = grid`
  1 2 _
  4 5 3
  7 8 6
`;
/** ROW_TO_PUSH after tile 2 slid right. */
const AFTER_2 = grid`
  1 _ 2
  4 5 3
  7 8 6
`;
/** A cell of the board on screen, in CSS pixels. */
const CELL = 100;
/**
 * A pointer position (dx, dy) from where each press begins, (200, 300) at 1000 ms, at that time or
 * `dt` ms later: a press never starts at 0, so a sum and a difference never look the same.
 */
const at = (dx: number, dy: number) => ({ x: 200 + dx, y: 300 + dy, t: 1000 });
const atTime = (dx: number, dy: number, dt: number) => ({ x: 200 + dx, y: 300 + dy, t: 1000 + dt });

/** A gesture that pressed `tile` of ROW_TO_PUSH at (0, 0) at time 0. */
function pressed(tile: number) {
  const gesture = startGesture(ROW_TO_PUSH, false, tile, at(0, 0));
  assert.ok(gesture);
  return gesture;
}

describe('startGesture', () => {
  test('a press on a tile next to the gap holds it, with the way it can go', () => {
    assert.deepEqual(pressed(2).held, { tile: 2, direction: 'right' });
  });

  test('a press on a tile that cannot move, or on the tray, is a swipe', () => {
    assert.deepEqual([pressed(7).held, pressed(0).held], [undefined, undefined]);
  });

  test('a finished game takes no gesture', () => {
    assert.equal(startGesture(ROW_TO_PUSH, true, 2, at(0, 0)), undefined);
  });
});

describe('progressOf', () => {
  test('progress is the share of a cell moved towards the gap, from 0 to 1', () => {
    assert.deepEqual(
      [
        progressOf('right', 30, 0, CELL),
        progressOf('right', 250, 0, CELL),
        progressOf('right', -40, 0, CELL),
        progressOf('up', 5, -50, CELL),
        progressOf('left', -40, 9, CELL),
        progressOf('down', 3, 60, CELL),
      ],
      [0.3, 1, 0, 0.5, 0.4, 0.6],
    );
  });

  test('movement across the free axis does not move a held tile', () => {
    assert.equal(progressOf('right', 0, 80, CELL), 0);
  });

  test('progress is always between 0 and 1', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('up', 'down', 'left', 'right' as const),
        fc.double({ min: -1e4, max: 1e4, noNaN: true }),
        fc.double({ min: -1e4, max: 1e4, noNaN: true }),
        fc.double({ min: 1, max: 500, noNaN: true }),
        // Within 0.5 of 0.5: between 0 and 1.
        (direction, dx, dy, cell) => Math.abs(progressOf(direction, dx, dy, cell) - 0.5) <= 0.5,
      ),
    );
  });
});

describe('stepGesture', () => {
  test('before a third of a cell the held tile follows the pointer and nothing moves', () => {
    const { step } = stepGesture(pressed(2), at(20, 3), CELL);

    assert.deepEqual(step, { kind: 'hold', tile: 2, progress: 0.2 });
  });

  test('at the threshold the move commits while the pointer is still down', () => {
    assert.equal(COMMIT_SHARE, 0.3);
    assert.deepEqual(stepGesture(pressed(2), at(30, 0), CELL).step, { kind: 'commit', tile: 2 });
  });

  test('after a commit the next tile that goes the same way is held, from where the first lands', () => {
    // The first tile lands one cell on from where it was pressed: the next starts moving from there.
    const { gesture } = stepGesture(pressed(2), at(30, 0), CELL);

    assert.deepEqual(
      { board: gesture.board, held: gesture.held, anchor: gesture.anchor },
      {
        board: AFTER_2,
        held: { tile: 1, direction: 'right' },
        anchor: { x: 300, y: 300, t: 1000 },
      },
    );
  });

  test('the next tile waits until the finger has pushed the first one all the way', () => {
    const first = stepGesture(pressed(2), at(30, 0), CELL);

    assert.deepEqual(stepGesture(first.gesture, at(90, 0), CELL).step, {
      kind: 'hold',
      tile: 1,
      progress: 0,
    });
  });

  test('one long drag pushes a whole row, then goes on as a swipe from the end', () => {
    const first = stepGesture(pressed(2), at(30, 0), CELL);
    const second = stepGesture(first.gesture, at(130, 0), CELL);

    assert.deepEqual(second.step, { kind: 'commit', tile: 1 });
    assert.equal(second.gesture.held, undefined);
  });

  test('at the end of a row the gesture goes on as a swipe from the finger, not back', () => {
    const first = stepGesture(pressed(2), at(30, 0), CELL);
    const second = stepGesture(first.gesture, at(130, 0), CELL);

    assert.deepEqual(stepGesture(second.gesture, at(120, 0), CELL).step, { kind: 'idle' });
    assert.deepEqual(second.gesture.anchor, { x: 330, y: 300, t: 1000 });
  });

  test('a swipe from a tile that cannot move commits the tile on that side of the gap', () => {
    // Up: the tile below the gap, 3, slides up into it.
    const { step } = stepGesture(pressed(7), at(2, -30), CELL);

    assert.deepEqual(step, { kind: 'commit', tile: 3 });
  });

  test('a swipe shorter than a swipe does nothing yet', () => {
    assert.deepEqual(stepGesture(pressed(7), at(0, -20), CELL).step, { kind: 'idle' });
  });

  test('a held tile dragged away from the gap never moves itself, wherever the pointer goes', () => {
    // Going up or down far enough is a swipe that moves tile 3; tile 2 itself never moves.
    fc.assert(
      fc.property(
        fc.integer({ min: -400, max: 0 }),
        fc.integer({ min: -400, max: 400 }),
        (x, y) =>
          JSON.stringify(stepGesture(pressed(2), at(x, y), CELL).step) !==
          JSON.stringify({ kind: 'commit', tile: 2 }),
      ),
    );
  });

  test('a flick away from the gap never commits, however fast', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -400, max: 0 }),
        fc.integer({ min: 1, max: 80 }),
        (x, t) =>
          releaseGesture(stepGesture(pressed(2), atTime(x, 0, t), CELL).gesture, 1000 + t).kind !==
          'commit',
      ),
    );
  });
});

describe('releaseGesture', () => {
  test('a quick flick towards the gap commits even when short', () => {
    const { gesture } = stepGesture(pressed(2), atTime(12, 0, 16), CELL);

    assert.deepEqual(releaseGesture(gesture, 1020), { kind: 'commit', tile: 2 });
  });

  test('a slow short drag springs back: no move', () => {
    const { gesture } = stepGesture(pressed(2), atTime(12, 0, 200), CELL);

    assert.deepEqual(releaseGesture(gesture, 1210), { kind: 'idle' });
  });

  test('a flick that stopped before the finger lifted springs back', () => {
    const { gesture } = stepGesture(pressed(2), atTime(12, 0, 16), CELL);

    assert.deepEqual(releaseGesture(gesture, 1400), { kind: 'idle' });
  });

  test('a quick flick away from the gap springs back', () => {
    const { gesture } = stepGesture(pressed(2), atTime(-12, 0, 16), CELL);

    assert.deepEqual(releaseGesture(gesture, 1020), { kind: 'idle' });
  });

  test('a swipe that never reached its distance is not a flick', () => {
    const { gesture } = stepGesture(pressed(7), atTime(0, -12, 16), CELL);

    assert.deepEqual(releaseGesture(gesture, 1020), { kind: 'idle' });
  });
});

describe('isTap', () => {
  test('a press released where it began is a tap; one that travelled or moved a tile is not', () => {
    const travelled = stepGesture(pressed(2), at(12, 0), CELL).gesture;
    const committed = stepGesture(pressed(2), at(30, 0), CELL).gesture;

    assert.deepEqual(
      [isTap(pressed(2), at(4, 3)), isTap(travelled, at(4, 0)), isTap(committed, at(30, 0))],
      [true, false, false],
    );
  });
});

describe('dragShift', () => {
  test('a held tile is drawn its progress of a cell towards the gap', () => {
    assert.deepEqual(
      [
        dragShift(ROW_TO_PUSH, { tile: 2, progress: 0.25 }),
        dragShift(ROW_TO_PUSH, { tile: 3, progress: 0.5 }),
      ],
      [
        { col: 0.25, row: 0 },
        { col: 0, row: -0.5 },
      ],
    );
  });

  test('a tile that is not next to the gap, or no drag at all, is not shifted', () => {
    assert.deepEqual(
      [dragShift(ROW_TO_PUSH, { tile: 7, progress: 0.5 }), dragShift(ROW_TO_PUSH, undefined)],
      [undefined, undefined],
    );
  });
});

describe('stepGesture, more', () => {
  test('a column is pushed up the same way: the next tile waits one cell above the press', () => {
    const { gesture } = stepGesture(pressed(3), at(0, -30), CELL);

    assert.deepEqual(
      { held: gesture.held, anchor: gesture.anchor, commits: gesture.commits },
      { held: { tile: 6, direction: 'up' }, anchor: { x: 200, y: 200, t: 1000 }, commits: 1 },
    );
  });

  test('a press that wobbles less than a tap allows is still a tap', () => {
    const { gesture } = stepGesture(pressed(2), at(-3, 4), CELL);

    assert.equal(isTap(gesture, at(-3, 4)), true);
  });

  test('a press that went away and came back is not a tap', () => {
    const { gesture } = stepGesture(pressed(7), at(0, -15), CELL);

    assert.equal(isTap(gesture, at(0, 0)), false);
  });
});

describe('releaseGesture, its limits', () => {
  test('a flick of exactly the shortest distance at exactly the speed commits', () => {
    // 8 px in 16 ms is 0.5 px per ms; lifted 80 ms after the last move.
    const { gesture } = stepGesture(pressed(2), atTime(8, 0, 16), CELL);

    assert.deepEqual(releaseGesture(gesture, 1096), { kind: 'commit', tile: 2 });
  });

  test('two samples at the same moment are no flick', () => {
    const { gesture } = stepGesture(pressed(2), atTime(20, 0, 0), CELL);

    assert.deepEqual(releaseGesture(gesture, 1000), { kind: 'idle' });
  });

  test('a flick lifted just after the window springs back', () => {
    const { gesture } = stepGesture(pressed(2), atTime(12, 0, 16), CELL);

    assert.deepEqual(releaseGesture(gesture, 1097), { kind: 'idle' });
  });

  test('a flick a little shorter than the shortest distance springs back', () => {
    const { gesture } = stepGesture(pressed(2), atTime(7, 0, 4), CELL);

    assert.deepEqual(releaseGesture(gesture, 1010), { kind: 'idle' });
  });
});

/** One move (tile 8 sliding left) from solved. */
const ONE_FROM_SOLVED = grid`
  1 2 3
  4 5 6
  7 _ 8
`;

describe('releaseGesture, from the moves', () => {
  test("an up at the last move's place still measures the flick from the moves before it", () => {
    const moved = stepGesture(pressed(2), atTime(12, 0, 16), CELL).gesture;
    const up = stepGesture(moved, atTime(12, 0, 20), CELL).gesture;

    assert.deepEqual(releaseGesture(up, 1020), { kind: 'commit', tile: 2 });
  });

  test('the speed is that of the last 50 ms of moves: a slow start and a quick end is a flick', () => {
    const slow = stepGesture(pressed(2), atTime(1, 0, 100), CELL).gesture;
    const slower = stepGesture(slow, atTime(2, 0, 200), CELL).gesture;
    const quick = stepGesture(slower, atTime(14, 0, 216), CELL).gesture;

    assert.deepEqual(releaseGesture(quick, 1220), { kind: 'commit', tile: 2 });
  });

  test('a quick start that slowed to a stop is no flick', () => {
    const quick = stepGesture(pressed(2), atTime(12, 0, 16), CELL).gesture;
    const crawl = stepGesture(quick, atTime(13, 0, 76), CELL).gesture;

    assert.deepEqual(releaseGesture(crawl, 1080), { kind: 'idle' });
  });
});

describe('stepGesture and the solved board', () => {
  test('the winning commit ends the gesture: nothing more is held or moved', () => {
    const start = startGesture(ONE_FROM_SOLVED, false, 8, at(0, 0));
    assert.ok(start);
    const won = stepGesture(start, at(-30, 0), CELL);

    assert.deepEqual(
      { step: won.step, held: won.gesture.held },
      { step: { kind: 'commit', tile: 8 }, held: undefined },
    );
    assert.deepEqual(stepGesture(won.gesture, at(-60, 0), CELL).step, { kind: 'idle' });
  });
});

describe('stepGesture, a held tile turned into a swipe', () => {
  test('from a held tile, a swipe across its free axis moves the tile on that side of the gap', () => {
    // Tile 2 slides right; a swipe up from it slides tile 3 (below the gap) up.
    assert.deepEqual(stepGesture(pressed(2), at(2, -30), CELL).step, { kind: 'commit', tile: 3 });
  });

  test('from a held tile, a swipe away from the gap lets go of it and is a swipe', () => {
    const { gesture, step } = stepGesture(pressed(2), at(-30, 2), CELL);

    assert.deepEqual({ step, held: gesture.held }, { step: { kind: 'idle' }, held: undefined });
  });

  test('a small wobble across the free axis keeps holding the tile', () => {
    assert.deepEqual(stepGesture(pressed(2), at(10, -15), CELL).step, {
      kind: 'hold',
      tile: 2,
      progress: 0.1,
    });
  });
});

describe('expects', () => {
  test('a gesture expects its own board, and right after a commit also the one before it', () => {
    const committed = stepGesture(pressed(2), at(30, 0), CELL).gesture;

    assert.deepEqual(
      [
        expects(pressed(2), ROW_TO_PUSH),
        expects(committed, AFTER_2),
        expects(committed, ROW_TO_PUSH),
      ],
      [true, true, true],
    );
  });

  test('a board changed by anything else (a reset, another tab) is not expected', () => {
    assert.equal(expects(pressed(2), AFTER_2), false);
  });
});
