import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { SavedGame } from '../game/index.ts';
import { grid } from '../test-support/grid.ts';
import { gameEvents, skinChanged } from './events.ts';
import type { PuzzleState } from './index.ts';

const SOLVED_4 = grid`
   1  2  3  4
   5  6  7  8
   9 10 11 12
  13 14 15  _
`;
/** SOLVED_4 with tile 12 slid down: one move from solved. */
const TWELVE_DOWN = grid`
   1  2  3  4
   5  6  7  8
   9 10 11  _
  13 14 15 12
`;
const SHUFFLED_3 = grid`
  3 2 1
  4 _ 6
  7 8 5
`;
const MONDAY = '2026-01-05T10:00:00.000Z';
const TUESDAY = '2026-01-06T10:00:00.000Z';

function saved(
  board: readonly number[],
  moves: number,
  finished: boolean,
  startedAt: string,
): SavedGame<PuzzleState> {
  return {
    state: { board },
    initial: { board },
    moves,
    finished,
    version: moves + 1,
    startedAt,
    finishedAt: null,
  };
}

const PLAYING = saved(TWELVE_DOWN, 11, false, MONDAY);
const SOLVED = saved(SOLVED_4, 12, true, MONDAY);

describe('gameEvents', () => {
  test('a new game the player asked for is reported once it arrives, with its size', () => {
    const fresh = saved(SHUFFLED_3, 0, false, TUESDAY);

    const events = gameEvents({ previous: SOLVED, current: fresh, requested: true, elapsedMs: 0 });

    assert.deepEqual(events, [{ name: 'game_started', properties: { size: 3 } }]);
  });

  test('a new game asked for before any game was on screen is reported', () => {
    const fresh = saved(SHUFFLED_3, 0, false, TUESDAY);

    const events = gameEvents({
      previous: undefined,
      current: fresh,
      requested: true,
      elapsedMs: 0,
    });

    assert.deepEqual(events, [{ name: 'game_started', properties: { size: 3 } }]);
  });

  test('a game resumed on load is not a started game', () => {
    const input = { previous: undefined, current: PLAYING, requested: false, elapsedMs: 0 };

    assert.deepEqual(gameEvents(input), []);
  });

  test('a move in the same game is not a started game, even while a start is asked for', () => {
    const moved = saved(TWELVE_DOWN, 12, false, MONDAY);

    const events = gameEvents({ previous: PLAYING, current: moved, requested: true, elapsedMs: 0 });

    assert.deepEqual(events, []);
  });

  test('another game arriving without the player asking is not a started game', () => {
    const fresh = saved(SHUFFLED_3, 0, false, TUESDAY);

    const events = gameEvents({ previous: SOLVED, current: fresh, requested: false, elapsedMs: 0 });

    assert.deepEqual(events, []);
  });

  test('the move that solves the game reports its size, moves and whole seconds', () => {
    const input = { previous: PLAYING, current: SOLVED, requested: false, elapsedMs: 41_600 };

    assert.deepEqual(gameEvents(input), [
      { name: 'game_solved', properties: { size: 4, moves: 12, seconds: 42 } },
    ]);
  });

  test('a solved game opened by a reload is not solved again', () => {
    const input = { previous: undefined, current: SOLVED, requested: false, elapsedMs: 41_600 };

    assert.deepEqual(gameEvents(input), []);
  });

  test('a solved game shown again is not solved again', () => {
    const input = { previous: SOLVED, current: SOLVED, requested: false, elapsedMs: 41_600 };

    assert.deepEqual(gameEvents(input), []);
  });

  test('a solved game of another start replacing an unsolved one is not this game solved', () => {
    const other = saved(SOLVED_4, 30, true, TUESDAY);

    const events = gameEvents({
      previous: PLAYING,
      current: other,
      requested: false,
      elapsedMs: 0,
    });

    assert.deepEqual(events, []);
  });

  test('no game on screen reports nothing', () => {
    const input = { previous: PLAYING, current: undefined, requested: true, elapsedMs: 0 };

    assert.deepEqual(gameEvents(input), []);
  });
});

describe('skinChanged', () => {
  test('the skin read when the screen opens is not a change', () => {
    assert.equal(skinChanged(undefined, 'rocket'), undefined);
  });

  test('the same skin again is not a change', () => {
    assert.equal(skinChanged('rocket', 'rocket'), undefined);
  });

  test('a bundled picture is reported as a picture, never by its name', () => {
    assert.deepEqual(skinChanged('numbers', 'rocket'), {
      name: 'skin_changed',
      properties: { kind: 'picture' },
    });
  });

  test('the player photo is reported as a photo', () => {
    assert.deepEqual(skinChanged('rocket', 'photo'), {
      name: 'skin_changed',
      properties: { kind: 'photo' },
    });
  });

  test('going back to numbers is reported as numbers', () => {
    assert.deepEqual(skinChanged('photo', 'numbers'), {
      name: 'skin_changed',
      properties: { kind: 'numbers' },
    });
  });
});
