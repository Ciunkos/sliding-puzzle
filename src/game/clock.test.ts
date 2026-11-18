import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { adoptClock, elapsedMs, newClock, reloadedClock, tick } from './clock.ts';

const VISIBLE = newClock(true);
const HIDDEN = newClock(false);

describe('the play clock', () => {
  test('nothing counts before the first move', () => {
    assert.equal(elapsedMs(VISIBLE, 9000), 0);
  });

  test('play time counts from the first move, not from later ones', () => {
    // Given moves at 1 s and at 3 s on a visible tab
    const clock = tick(tick(VISIBLE, { type: 'move', at: 1000 }), { type: 'move', at: 3000 });

    // When it is read at 5 s, then 4 s were played
    assert.equal(elapsedMs(clock, 5000), 4000);
  });

  test('time while the tab is hidden is not counted', () => {
    // Given a first move at 1 s, the tab hidden from 3 s to 10 s
    const moved = tick(VISIBLE, { type: 'move', at: 1000 });
    const hidden = tick(moved, { type: 'hide', at: 3000 });
    const shown = tick(hidden, { type: 'show', at: 10_000 });

    // When it is read at 12 s, then 2 s before and 2 s after the hidden stretch count
    assert.equal(elapsedMs(hidden, 9000), 2000);
    assert.equal(elapsedMs(shown, 12_000), 4000);
  });

  test('a show while the tab is already visible loses no time', () => {
    const moved = tick(VISIBLE, { type: 'move', at: 1000 });

    const shown = tick(moved, { type: 'show', at: 3000 });

    assert.equal(elapsedMs(shown, 5000), 4000);
  });

  test('a tab shown again counts as visible after a restart', () => {
    const shown = tick(tick(HIDDEN, { type: 'show', at: 1000 }), { type: 'restart' });

    const moved = tick(shown, { type: 'move', at: 2000 });

    assert.equal(elapsedMs(moved, 5000), 3000);
  });

  test('a first move on a hidden tab counts only once the tab is shown', () => {
    const moved = tick(HIDDEN, { type: 'move', at: 1000 });

    const shown = tick(moved, { type: 'show', at: 4000 });

    assert.equal(elapsedMs(shown, 6000), 2000);
  });

  test('a finished game stops the clock, and showing the tab again does not restart it', () => {
    // Given a game played from 1 s to its finish at 4 s
    const finished = tick(tick(VISIBLE, { type: 'move', at: 1000 }), { type: 'finish', at: 4000 });

    // When the tab is hidden and shown again much later
    const later = tick(tick(finished, { type: 'hide', at: 5000 }), { type: 'show', at: 50_000 });

    // Then the play time stays 3 s
    assert.equal(elapsedMs(later, 100_000), 3000);
  });

  test('a move after the finish does not restart the clock', () => {
    const finished = tick(tick(VISIBLE, { type: 'move', at: 1000 }), { type: 'finish', at: 4000 });

    const moved = tick(finished, { type: 'move', at: 5000 });

    assert.equal(elapsedMs(moved, 9000), 3000);
  });

  test('a restart forgets the time played, and the next move starts the clock again', () => {
    // Given 4 s played on a visible tab, then a reset
    const played = tick(VISIBLE, { type: 'move', at: 1000 });
    const restarted = tick(played, { type: 'restart' });

    // When the next move comes at 6 s
    const moved = tick(restarted, { type: 'move', at: 6000 });

    // Then nothing counted between the reset and that move
    assert.equal(elapsedMs(restarted, 5000), 0);
    assert.equal(elapsedMs(moved, 7000), 1000);
  });

  test('a restart keeps whether the tab is visible', () => {
    const restarted = tick(tick(VISIBLE, { type: 'hide', at: 1000 }), { type: 'restart' });

    const moved = tick(restarted, { type: 'move', at: 2000 });

    assert.equal(elapsedMs(moved, 9000), 0);
  });

  test('a clock that finished before it started counts nothing', () => {
    assert.equal(elapsedMs(tick(VISIBLE, { type: 'finish', at: 0 }), 9000), 0);
  });
});

const GAME = { startedAt: '2026-01-01T00:00:00.000Z', finished: false };
const FINISHED_GAME = { startedAt: '2026-01-01T00:00:00.000Z', finished: true };
const OTHER_GAME = { startedAt: '2026-01-01T00:09:00.000Z', finished: false };

describe('the play clock across reloads and server games', () => {
  test('a reload keeps the time played until the last move and counts again from the reload', () => {
    // Given moves at 0 s and 60 s, then the page reloaded at 70 s
    const played = tick(tick(VISIBLE, { type: 'move', at: 0 }), { type: 'move', at: 60_000 });

    const reloaded = reloadedClock(played, 70_000, true);

    // Then 60 s were kept, and 1 s more counts after the reload
    assert.equal(elapsedMs(reloaded, 71_000), 61_000);
  });

  test('a reload on a hidden tab counts nothing until the tab is shown', () => {
    const played = tick(VISIBLE, { type: 'move', at: 0 });

    const reloaded = reloadedClock(tick(played, { type: 'move', at: 5000 }), 9000, false);

    assert.equal(elapsedMs(reloaded, 20_000), 5000);
  });

  test('a reload of a finished game keeps its clock stopped', () => {
    const finished = tick(tick(VISIBLE, { type: 'move', at: 0 }), { type: 'finish', at: 3000 });

    assert.equal(elapsedMs(reloadedClock(finished, 9000, true), 20_000), 3000);
  });

  test('a rejected finish resumes the clock from the moment the server game is adopted', () => {
    // Given 2 s played up to a finishing tap that the server then rejected at 5 s
    const finished = tick(tick(VISIBLE, { type: 'move', at: 0 }), { type: 'finish', at: 2000 });

    const adopted = adoptClock({ startedAt: GAME.startedAt, clock: finished }, GAME, 5000, true);

    // Then it counts again from 5 s
    assert.equal(elapsedMs(adopted.clock, 8000), 5000);
  });

  test('a running clock keeps counting through the adoption of the same unfinished game', () => {
    const running = tick(VISIBLE, { type: 'move', at: 1000 });

    const adopted = adoptClock({ startedAt: GAME.startedAt, clock: running }, GAME, 5000, true);

    assert.equal(elapsedMs(adopted.clock, 9000), 8000);
  });

  test('a server game that started at another moment restarts the clock', () => {
    const running = tick(VISIBLE, { type: 'move', at: 1000 });

    const adopted = adoptClock(
      { startedAt: GAME.startedAt, clock: running },
      OTHER_GAME,
      5000,
      true,
    );

    assert.deepEqual(
      [adopted.startedAt, elapsedMs(adopted.clock, 9000)],
      ['2026-01-01T00:09:00.000Z', 0],
    );
  });

  test('a finished server game stops the clock where it is', () => {
    const running = tick(VISIBLE, { type: 'move', at: 1000 });

    const adopted = adoptClock(
      { startedAt: GAME.startedAt, clock: running },
      FINISHED_GAME,
      5000,
      true,
    );

    assert.equal(elapsedMs(adopted.clock, 9000), 4000);
  });

  test('without a stored clock the game gets a new one', () => {
    const adopted = adoptClock(undefined, GAME, 5000, true);

    assert.deepEqual(adopted, {
      startedAt: '2026-01-01T00:00:00.000Z',
      clock: {
        banked: 0,
        since: undefined,
        started: false,
        stopped: false,
        visible: true,
        lastAt: 0,
      },
    });
  });
});
