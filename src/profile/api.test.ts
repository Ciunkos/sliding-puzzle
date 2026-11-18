import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createProfileApi } from './api.ts';

const ADA = { id: 7, nickname: 'Ada', createdAt: '2026-01-01T00:00:00.000Z' };
const GENERIC_ERROR = { name: 'ProfileApiError', message: 'Could not reach the server' };

/** A stand-in for the browser's fetch that always answers with `response`. */
function answering(response: Response): typeof fetch {
  return () => Promise.resolve(response);
}

/** A stand-in for fetch that records each request in `requests` and answers with `response`. */
function recording(requests: unknown[], response: Response): typeof fetch {
  return (input, init) => {
    requests.push({ input, init });
    return Promise.resolve(response);
  };
}

function json(body: unknown, status: number): Response {
  return Response.json(body, { status });
}

describe('createProfileApi', () => {
  test('selecting a nickname posts it as JSON to the profiles route', async () => {
    // Given a fetch that records what it was asked
    const requests: unknown[] = [];
    const api = createProfileApi('/sliding-puzzle/api', recording(requests, json(ADA, 200)));

    // When Ada is selected
    await api.selectOrCreate('Ada');

    // Then one JSON POST with the nickname went to the profiles route under the api base
    assert.deepEqual(requests, [
      {
        input: '/sliding-puzzle/api/profiles',
        init: {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{"nickname":"Ada"}',
        },
      },
    ]);
  });

  test('a successful answer gives the parsed profile', async () => {
    const api = createProfileApi('/sliding-puzzle/api', answering(json(ADA, 200)));

    assert.deepEqual(await api.selectOrCreate('Ada'), ADA);
  });

  test('a 400 answer carries the message the server sent', async () => {
    const api = createProfileApi(
      '/sliding-puzzle/api',
      answering(json({ error: 'nickname is taken' }, 400)),
    );

    await assert.rejects(api.selectOrCreate('Ada'), {
      name: 'ProfileApiError',
      message: 'nickname is taken',
    });
  });

  test('an unreachable server or an unusable answer gives the generic message', async () => {
    const offline = createProfileApi('/sliding-puzzle/api', () =>
      Promise.reject(new TypeError('fetch failed')),
    );
    const failing = createProfileApi(
      '/sliding-puzzle/api',
      answering(json({ error: 'database is down' }, 500)),
    );
    const malformed = createProfileApi(
      '/sliding-puzzle/api',
      answering(json({ id: 'seven' }, 200)),
    );

    await assert.rejects(offline.selectOrCreate('Ada'), GENERIC_ERROR);
    await assert.rejects(failing.selectOrCreate('Ada'), GENERIC_ERROR);
    await assert.rejects(malformed.selectOrCreate('Ada'), GENERIC_ERROR);
  });

  test('a request that never reached the server, or a 5xx, is marked unreachable', async () => {
    const offline = createProfileApi('/sliding-puzzle/api', () =>
      Promise.reject(new TypeError('fetch failed')),
    );
    const down = createProfileApi('/sliding-puzzle/api', answering(json({}, 503)));

    await assert.rejects(offline.selectOrCreate('Ada'), { unreachable: true });
    await assert.rejects(down.selectOrCreate('Ada'), { unreachable: true });
  });

  test('a refused name or an unusable answer is not marked unreachable', async () => {
    const refused = createProfileApi('/sliding-puzzle/api', answering(json({ error: 'no' }, 400)));
    const malformed = createProfileApi(
      '/sliding-puzzle/api',
      answering(json({ id: 'seven' }, 200)),
    );

    await assert.rejects(refused.selectOrCreate('Ada'), { unreachable: false });
    await assert.rejects(malformed.selectOrCreate('Ada'), { unreachable: false });
  });
});
