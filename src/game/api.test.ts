// The browser API client. The only stand-in is `fetch`, the outside world.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { tallyGame } from '../test-support/tally-game.ts';
import { createGameApi } from './api.ts';

const SAVED = {
  state: { count: 1, target: 5 },
  initial: { count: 0, target: 5 },
  moves: 1,
  finished: false,
  version: 2,
  startedAt: '2026-01-01T00:00:00.000Z',
  finishedAt: null,
};

/** An API client whose every request is answered with `reply`. */
function answering(reply: () => Response) {
  return createGameApi(tallyGame, '/sliding-puzzle/api', () => Promise.resolve(reply()));
}

/** An API client that pushes the url and init of every request to `sent` and answers SAVED. */
function recording(sent: unknown[]) {
  return createGameApi(tallyGame, '/sliding-puzzle/api', (url, init) => {
    sent.push(url, init);
    return Promise.resolve(Response.json(SAVED));
  });
}

describe('the game API client', () => {
  test('resuming sends the options with PUT, a new game with POST, and both return the game', async () => {
    // Given a server that records what it was sent
    const sent: unknown[] = [];
    const api = recording(sent);

    // When Ana Lu resumes, then starts a new game
    const resumed = await api.resume('Ana Lu', { target: 5 });
    await api.start('Ana Lu', { target: 7 });

    // Then the nickname is encoded, each body is the options, and the answer is the game
    assert.deepEqual(sent, [
      '/sliding-puzzle/api/profiles/Ana%20Lu/games/tally',
      { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{"target":5}' },
      '/sliding-puzzle/api/profiles/Ana%20Lu/games/tally',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"target":7}' },
    ]);
    assert.deepEqual(resumed, SAVED);
  });

  test('a move and a reset send the version they were made on', async () => {
    // Given a server that records what it was sent
    const sent: unknown[] = [];
    const api = recording(sent);

    // When Ada moves from version 2, then resets from version 3
    await api.move('Ada', { add: 2 }, 2);
    await api.reset('Ada', 3);

    // Then each body carries its base version
    assert.deepEqual(sent, [
      '/sliding-puzzle/api/profiles/Ada/games/tally/move',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"baseVersion":2,"move":{"add":2}}',
      },
      '/sliding-puzzle/api/profiles/Ada/games/tally/reset',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"baseVersion":3}',
      },
    ]);
  });

  test('a 409 becomes a GameApiError with the status and the server message', async () => {
    const api = answering(() => Response.json({ error: 'illegal move' }, { status: 409 }));

    await assert.rejects(api.move('Ada', { add: 4 }, 1), {
      name: 'GameApiError',
      status: 409,
      message: 'illegal move',
    });
  });

  test('a stale 409 becomes a StaleGameError that carries the current game', async () => {
    const api = answering(() => Response.json({ error: 'stale', game: SAVED }, { status: 409 }));

    await assert.rejects(api.move('Ada', { add: 1 }, 1), {
      name: 'StaleGameError',
      status: 409,
      game: SAVED,
    });
  });

  test('an error response without a message names the status', async () => {
    const api = answering(() => new Response('oops', { status: 500 }));

    await assert.rejects(api.reset('Ada', 1), {
      status: 500,
      message: 'Request failed with status 500',
    });
  });

  test('a network failure becomes a GameApiError with status 0', async () => {
    const api = createGameApi(tallyGame, '/sliding-puzzle/api', () =>
      Promise.reject(new TypeError('fetch failed')),
    );

    await assert.rejects(api.start('Ada', { target: 5 }), {
      name: 'GameApiError',
      status: 0,
      message: 'Could not reach the server',
    });
  });

  test('a response body that is not a saved game is rejected', async () => {
    const api = answering(() => Response.json({ state: 'nonsense' }));

    await assert.rejects(api.resume('Ada', { target: 5 }), {
      status: 200,
      message: 'Unexpected response from the server',
    });
  });
});
