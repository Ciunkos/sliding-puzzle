// The plain session logic, over the real API client. The only stand-in is `fetch`, the outside world.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { type TallyState, tallyGame } from '../test-support/tally-game.ts';
import { createGameApi } from './client.tsx';
import type { SavedGame } from './index.ts';
import { errorMessage, runRequest, type SessionTarget } from './session.ts';

const SAVED = {
  state: { count: 1, target: 5 },
  initial: { count: 0, target: 5 },
  moves: 1,
  finished: false,
  version: 2,
  startedAt: '2026-01-01T00:00:00.000Z',
  finishedAt: null,
};

/** An API client whose requests get `replies` in order, one each. */
function replying(...replies: Response[]) {
  return createGameApi(tallyGame, '/sliding-puzzle/api', () => {
    const reply = replies.shift();
    assert.ok(reply, 'the API client sent more requests than the test expected');
    return Promise.resolve(reply);
  });
}

/** A session target that records the last value of every setter in `seen`. */
function recorder() {
  const seen: Record<string, unknown> = {};
  const target: SessionTarget<TallyState> = {
    setGame: (game) => {
      seen.game = game;
    },
    setMessage: (message) => {
      seen.message = message;
    },
    setBusy: (busy) => {
      seen.busy = busy;
    },
    inFlight: { current: false },
  };
  return { seen, target };
}

/** A request that answers only when `answer` is called. */
function pendingRequest() {
  let settle: (game: SavedGame<TallyState>) => void = () => undefined;
  const promise = new Promise<SavedGame<TallyState>>((resolve) => {
    settle = resolve;
  });
  // The executor has already run, so `settle` is the promise's resolve.
  return { request: () => promise, answer: settle };
}

const LIVE = () => true;

describe('the game session', () => {
  test('errorMessage of an unexpected error is a generic retry message', () => {
    assert.equal(errorMessage(new Error('boom')), 'Something went wrong. Try again.');
  });

  test('a running request marks the session busy and clears the old message', async () => {
    // Given a session showing an old error, and a request that has not answered yet
    const { seen, target } = recorder();
    target.setMessage('old error');
    const pending = pendingRequest();

    // When the request runs
    const running = runRequest(target, LIVE, pending.request);

    // Then the session is busy with no message until it answers
    assert.deepEqual(seen, { busy: true, message: undefined });
    assert.equal(target.inFlight.current, true);
    pending.answer(SAVED);
    await running;
  });

  test('a successful request stores the game and ends the busy state', async () => {
    const { seen, target } = recorder();

    await runRequest(target, LIVE, () => Promise.resolve(SAVED));

    assert.deepEqual(seen, { busy: false, message: undefined, game: SAVED });
    assert.equal(target.inFlight.current, false);
  });

  test('a failed request shows the server message and keeps no game', async () => {
    // Given a server that rejects the move
    const { seen, target } = recorder();
    const api = replying(Response.json({ error: 'illegal move' }, { status: 409 }));

    // When the move runs
    await runRequest(target, LIVE, () => api.move('Ada', { add: 4 }, 2));

    // Then its message is shown
    assert.deepEqual(seen, { busy: false, message: 'illegal move' });
  });

  test('a stale request shows the current game from the server with a notice', async () => {
    // Given a server where the game moved on in another tab
    const { seen, target } = recorder();
    const api = replying(Response.json({ error: 'stale', game: SAVED }, { status: 409 }));

    // When a move from the outdated version runs
    await runRequest(target, LIVE, () => api.move('Ada', { add: 1 }, 1));

    // Then the session adopts the server's game and says why
    assert.deepEqual(seen, {
      busy: false,
      message: 'This game changed somewhere else. Showing the latest.',
      game: SAVED,
    });
  });

  test('a response that arrives after the session moved on is ignored', async () => {
    const { seen, target } = recorder();

    await runRequest(
      target,
      () => false,
      () => Promise.resolve(SAVED),
    );

    assert.deepEqual(seen, { busy: true, message: undefined });
  });
});
