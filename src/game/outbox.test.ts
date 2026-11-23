// Sending a batch over the real API client. The only stand-in is `fetch`, the outside world.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { tallyGame } from '../test-support/tally-game.ts';
import { createGameApi } from './client.tsx';
import { backoffMs, sendBatch } from './outbox.ts';

const SAVED = {
  state: { count: 1, target: 5 },
  initial: { count: 0, target: 5 },
  moves: 1,
  finished: false,
  version: 2,
  startedAt: '2026-01-01T00:00:00.000Z',
  finishedAt: null,
};
const REQUEST = { baseVersion: 1, batchId: 'batch-one', moves: [{ add: 1 }] };

/** An API client whose every request is answered with `reply`. */
function answering(reply: () => Promise<Response>) {
  return createGameApi(tallyGame, '/api', reply);
}

describe('sending a batch', () => {
  test('an accepted batch is acknowledged with the server game', async () => {
    const api = answering(() => Promise.resolve(Response.json(SAVED)));

    assert.deepEqual(await sendBatch(api, 'Ada', REQUEST), { type: 'acknowledged', game: SAVED });
  });

  test('a refused batch is rejected with the server game', async () => {
    const api = answering(() =>
      Promise.resolve(Response.json({ error: 'stale', game: SAVED }, { status: 409 })),
    );

    assert.deepEqual(await sendBatch(api, 'Ada', REQUEST), { type: 'rejected', game: SAVED });
  });

  test('an unreachable server or a server error is a network failure, retried later', async () => {
    const offline = answering(() => Promise.reject(new TypeError('fetch failed')));
    const broken = answering(() => Promise.resolve(new Response('oops', { status: 500 })));

    assert.deepEqual(await sendBatch(offline, 'Ada', REQUEST), { type: 'network-failed' });
    assert.deepEqual(await sendBatch(broken, 'Ada', REQUEST), { type: 'network-failed' });
  });

  test('a 400 or a 404 can never succeed: the batch is refused', async () => {
    const invalid = answering(() =>
      Promise.resolve(Response.json({ error: 'x' }, { status: 400 })),
    );
    const missing = answering(() =>
      Promise.resolve(Response.json({ error: 'x' }, { status: 404 })),
    );

    assert.deepEqual(await sendBatch(invalid, 'Ada', REQUEST), { type: 'refused' });
    assert.deepEqual(await sendBatch(missing, 'Ada', REQUEST), { type: 'refused' });
  });

  test('a 200 answer that is not a game, such as a portal login page, is retried later', async () => {
    // It says nothing about whether the server took the batch, so the batch is kept.
    const portal = answering(() =>
      Promise.resolve(new Response('<html>Sign in to the Wi-Fi</html>', { status: 200 })),
    );

    assert.deepEqual(await sendBatch(portal, 'Ada', REQUEST), { type: 'network-failed' });
  });

  test('a request timeout and too many requests are retried later', async () => {
    const slow = answering(() => Promise.resolve(new Response('', { status: 408 })));
    const busy = answering(() => Promise.resolve(new Response('', { status: 429 })));

    assert.deepEqual(await sendBatch(slow, 'Ada', REQUEST), { type: 'network-failed' });
    assert.deepEqual(await sendBatch(busy, 'Ada', REQUEST), { type: 'network-failed' });
  });

  test('retries wait 1 s, then twice as long each time, at most 30 s', () => {
    assert.deepEqual(
      [backoffMs(0), backoffMs(1), backoffMs(2), backoffMs(3), backoffMs(5), backoffMs(6)],
      [1000, 1000, 2000, 4000, 16_000, 30_000],
    );
  });
});
