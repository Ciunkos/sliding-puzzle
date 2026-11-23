import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { SavedGame } from '../game/index.ts';
import { grid } from '../test-support/grid.ts';
import type { PuzzleState } from './index.ts';
import {
  announcement,
  bestOf,
  formatElapsed,
  layout,
  pictureBackground,
  skinOptions,
  skinPicture,
  resultLine,
  resultText,
  showSaving,
  sizeLabel,
  solvedText,
  statusText,
} from './view-model.ts';

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

  test('a game loaded already solved, or a solved board shown again, announces no win', () => {
    const solved = grid`
      1 2 3
      4 5 6
      7 8 _
    `;

    assert.equal(announcement(undefined, savedGame(solved, 34, true)), '');
    assert.equal(announcement(solved, savedGame(solved, 34, true)), '');
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

describe('formatElapsed', () => {
  test('under an hour reads as minutes and two-digit seconds, rounded down', () => {
    const times = [formatElapsed(0), formatElapsed(7_999), formatElapsed(754_000)];

    assert.deepEqual(times, ['0:00', '0:07', '12:34']);
  });

  test('an hour or more reads as hours, minutes and seconds', () => {
    assert.equal(formatElapsed(3_723_000), '1:02:03');
  });

  test('a negative time reads as no time at all', () => {
    assert.equal(formatElapsed(-500), '0:00');
  });
});

/** Best results as the engine lists them: per variant, the best first. */
const THREE_BY_THREE = {
  variant: '3x3',
  moves: 20,
  durationMs: 40_000,
  reportedMs: 31_000,
  finishedAt: 'a',
};
const ONE_MOVE = { variant: '4x4', moves: 1, durationMs: 9_000, reportedMs: 0, finishedAt: 'b' };
const NOT_REPORTED = {
  variant: '4x4',
  moves: 30,
  durationMs: 65_000,
  reportedMs: null,
  finishedAt: 'c',
};
const RESULTS = [
  THREE_BY_THREE,
  ONE_MOVE,
  NOT_REPORTED,
  { variant: '4x4', moves: 31, durationMs: 1_000, reportedMs: 1_000, finishedAt: 'd' },
  { variant: '4x4', moves: 40, durationMs: 1_000, reportedMs: 1_000, finishedAt: 'e' },
  { variant: '4x4', moves: 41, durationMs: 1_000, reportedMs: 1_000, finishedAt: 'f' },
  { variant: '4x4', moves: 42, durationMs: 1_000, reportedMs: 1_000, finishedAt: 'g' },
];

describe('bestOf', () => {
  test('the best of one variant are its first five results, in the order given', () => {
    const best = bestOf(RESULTS, '4x4');

    assert.deepEqual(best, [
      ONE_MOVE,
      NOT_REPORTED,
      { variant: '4x4', moves: 31, durationMs: 1_000, reportedMs: 1_000, finishedAt: 'd' },
      { variant: '4x4', moves: 40, durationMs: 1_000, reportedMs: 1_000, finishedAt: 'e' },
      { variant: '4x4', moves: 41, durationMs: 1_000, reportedMs: 1_000, finishedAt: 'f' },
    ]);
  });

  test('results that read the same (moves and shown time) are listed once', () => {
    // Given two 1-move wins in 0 and 0.4 s, both shown as "1 move · 0:00", then a 2-move win
    const best = bestOf(
      [
        ONE_MOVE,
        { ...ONE_MOVE, reportedMs: 400, finishedAt: 'x' },
        { ...ONE_MOVE, moves: 2, finishedAt: 'y' },
      ],
      '4x4',
    );

    assert.deepEqual(best, [
      ONE_MOVE,
      { variant: '4x4', moves: 2, durationMs: 9_000, reportedMs: 0, finishedAt: 'y' },
    ]);
  });

  test('a variant without results has an empty list', () => {
    assert.deepEqual(bestOf(RESULTS, '5x5'), []);
  });
});

describe('resultLine', () => {
  test('a result reads as its moves and the play time the browser reported', () => {
    assert.equal(resultLine(THREE_BY_THREE), '20 moves · 0:31');
    assert.equal(resultLine(ONE_MOVE), '1 move · 0:00');
  });

  test('without a reported time the server-side duration is shown', () => {
    assert.equal(resultLine(NOT_REPORTED), '30 moves · 1:05');
  });
});

describe('resultText', () => {
  test('the result of a won game is its play time', () => {
    assert.equal(resultText(43_500, false), 'Time 0:43');
  });

  test('a personal best says so', () => {
    assert.equal(resultText(43_500, true), 'Time 0:43 · New best!');
  });
});

describe('showSaving', () => {
  test('saving is shown once it has lasted 400 ms', () => {
    assert.deepEqual([showSaving(1_000, 1_399), showSaving(1_000, 1_400)], [false, true]);
  });

  test('nothing is shown while nothing is being saved', () => {
    assert.equal(showSaving(undefined, 5_000), false);
  });
});

describe('pictureBackground', () => {
  test('on a 3x3 board the picture is three tiles wide, tile 1 shows its top-left ninth', () => {
    assert.deepEqual(pictureBackground(1, 3, 'a.svg'), {
      backgroundImage: 'url("a.svg")',
      backgroundSize: '300% 300%',
      backgroundPosition: '0% 0%',
    });
  });

  test('on a 3x3 board tile 5 shows the middle ninth and tile 9 the bottom-right corner', () => {
    assert.deepEqual(
      [
        pictureBackground(5, 3, 'a.svg').backgroundPosition,
        pictureBackground(9, 3, 'a.svg').backgroundPosition,
      ],
      ['50% 50%', '100% 100%'],
    );
  });

  test('on a 4x4 board tile 7 shows the square in the second row, third column', () => {
    assert.deepEqual(pictureBackground(7, 4, 'data:image/jpeg;base64,AA'), {
      backgroundImage: 'url("data:image/jpeg;base64,AA")',
      backgroundSize: '400% 400%',
      backgroundPosition: '66.667% 33.333%',
    });
  });
});

describe('skinOptions', () => {
  test('the picker offers numbers first, then the five pictures by title, each picture with its SVG', () => {
    const options = skinOptions(undefined);

    assert.equal(options.length, 6);
    assert.partialDeepStrictEqual(options, [
      { id: 'numbers', title: 'Numbers', thumbnail: undefined },
      { id: 'rocket', title: 'Rocket' },
      { id: 'cat', title: 'Cat' },
      { id: 'balloon', title: 'Balloon' },
      { id: 'fish', title: 'Fish' },
      { id: 'castle', title: 'Castle' },
    ]);
    assert.match(
      JSON.stringify(options),
      /"thumbnail":"data:image\/svg\+xml,%3Csvg%20.+%3C%2Fsvg%3E"}\]$/,
    );
  });

  test('a stored photo is offered last as "Your photo", with itself as the thumbnail', () => {
    const options = skinOptions('data:image/jpeg;base64,AA');

    assert.deepEqual(options.slice(6), [
      { id: 'photo', title: 'Your photo', thumbnail: 'data:image/jpeg;base64,AA' },
    ]);
  });
});

describe('skinPicture', () => {
  test('numbers show no picture, the photo skin shows the photo, a picture skin its SVG', () => {
    assert.deepEqual(
      [
        skinPicture('numbers', 'data:image/jpeg;base64,AA'),
        skinPicture('photo', 'data:image/jpeg;base64,AA'),
      ],
      [undefined, 'data:image/jpeg;base64,AA'],
    );
    assert.match(
      String(skinPicture('fish', undefined)),
      /^data:image\/svg\+xml,%3Csvg%20.+%3C%2Fsvg%3E$/,
    );
  });
});
