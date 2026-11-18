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
  return createGameApi(tallyGame, () => Promise.resolve(reply()));
}

/** An API client that pushes the url and init of every request to `sent` and answers SAVED. */
function recording(sent: unknown[]) {
  return createGameApi(tallyGame, (url, init) => {
    sent.push(url, init);
    return Promise.resolve(Response.json(SAVED));
  });
}

describe('the game API client', () => {
  test('a saved game in the response is returned parsed', async () => {
    const api = answering(() => Response.json(SAVED));

    assert.deepEqual(await api.load('Ada'), SAVED);
  });

  test('loading answers undefined when the server has no game', async () => {
    const api = answering(() => Response.json({ error: 'no active game' }, { status: 404 }));

    assert.equal(await api.load('Ada'), undefined);
  });

  test('a move sends the move as JSON to the move route of the profile and game', async () => {
    // Given a server that records what it was sent
    const sent: unknown[] = [];
    const api = recording(sent);

    // When Ana Lu moves
    await api.move('Ana Lu', { add: 2 });

    // Then the nickname is encoded and the body is the move
    assert.deepEqual(sent, [
      '/api/profiles/Ana%20Lu/games/tally/move',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"add":2}' },
    ]);
  });

  test('a 409 becomes a GameApiError with the status and the server message', async () => {
    const api = answering(() => Response.json({ error: 'illegal move' }, { status: 409 }));

    await assert.rejects(api.move('Ada', { add: 4 }), {
      name: 'GameApiError',
      status: 409,
      message: 'illegal move',
    });
  });

  test('an error response without a message names the status', async () => {
    const api = answering(() => new Response('oops', { status: 500 }));

    await assert.rejects(api.reset('Ada'), {
      status: 500,
      message: 'Request failed with status 500',
    });
  });

  test('a network failure becomes a GameApiError with status 0', async () => {
    const api = createGameApi(tallyGame, () => Promise.reject(new TypeError('fetch failed')));

    await assert.rejects(api.start('Ada', { target: 5 }), {
      name: 'GameApiError',
      status: 0,
      message: 'Could not reach the server',
    });
  });

  test('a response body that is not a saved game is rejected', async () => {
    const api = answering(() => Response.json({ state: 'nonsense' }));

    await assert.rejects(api.load('Ada'), {
      status: 200,
      message: 'Unexpected response from the server',
    });
  });
});
