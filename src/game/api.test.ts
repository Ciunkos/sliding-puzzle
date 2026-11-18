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

const RESULT = {
  variant: 'to 5',
  moves: 5,
  durationMs: 9000,
  reportedMs: 8000,
  finishedAt: '2026-01-01T00:00:09.000Z',
};

/** An API client whose every request is answered with `reply`. */
function answering(reply: () => Response) {
  return createGameApi(tallyGame, '/sliding-puzzle/api', () => Promise.resolve(reply()));
}

/** An API client that pushes the url and init of every request to `sent` and answers `body`. */
function recordingWith(sent: unknown[], body: unknown) {
  return createGameApi(tallyGame, '/sliding-puzzle/api', (url, init) => {
    sent.push(url, init);
    return Promise.resolve(Response.json(body));
  });
}

/** An API client that pushes the url and init of every request to `sent` and answers SAVED. */
function recording(sent: unknown[]) {
  return recordingWith(sent, SAVED);
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

  test('a batch of moves is posted to the moves route with its version, id and moves', async () => {
    const sent: unknown[] = [];
    const api = recording(sent);

    const moves = [{ add: 1 }, { add: 2 }];
    await api.sendMoves('Ada', { baseVersion: 2, batchId: 'batch-one', moves, elapsedMs: 900 });

    assert.deepEqual(sent, [
      '/sliding-puzzle/api/profiles/Ada/games/tally/moves',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"baseVersion":2,"batchId":"batch-one","moves":[{"add":1},{"add":2}],"elapsedMs":900}',
      },
    ]);
  });

  test('a 409 that carries a game becomes a StaleGameError with the server message', async () => {
    const api = answering(() =>
      Response.json({ error: 'illegal move', game: SAVED }, { status: 409 }),
    );

    const request = { baseVersion: 2, batchId: 'batch-one', moves: [{ add: 4 }] };
    await assert.rejects(api.sendMoves('Ada', request), {
      name: 'StaleGameError',
      message: 'illegal move',
      game: SAVED,
    });
  });

  test('the results are fetched from the results route and parsed', async () => {
    const sent: unknown[] = [];
    const api = recordingWith(sent, [RESULT]);

    const results = await api.results('Ada');

    assert.deepEqual(
      [sent, results],
      [['/sliding-puzzle/api/profiles/Ada/games/tally/results', {}], [RESULT]],
    );
  });

  test('results that are not results are rejected', async () => {
    const api = answering(() => Response.json([{ variant: 'to 5' }]));

    await assert.rejects(api.results('Ada'), { message: 'Unexpected response from the server' });
  });
});
