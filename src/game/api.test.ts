import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createGameApi, GameApiError } from './api.ts';
import type { GameState } from './index.ts';

const SHUFFLED = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 0, 15];

const STATE: GameState = {
  board: SHUFFLED,
  initial: SHUFFLED,
  moves: 0,
  solved: false,
  version: 1,
};

interface Seen {
  url: string;
  method: string;
  body: string | undefined;
}

const describeCall = (call: Seen) => `${call.method} ${call.url}`;

/** A fake fetch that records each request and answers with `respond`. */
function fakeFetch(respond: (seen: Seen) => Response | Promise<Response>) {
  const calls: Seen[] = [];
  const impl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const seen: Seen = {
      url,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? init.body : undefined,
    };
    calls.push(seen);
    return respond(seen);
  };
  return { fetch: impl, calls };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function isGameApiError(status: number, message: string) {
  return (error: unknown) =>
    error instanceof GameApiError && error.status === status && error.message === message;
}

describe('load', () => {
  test('GET the game and parse a 200 body', async () => {
    const { fetch, calls } = fakeFetch(() => json(STATE));
    const api = createGameApi(fetch);
    assert.deepEqual(await api.load('Alice'), STATE);
    assert.deepEqual(calls.map(describeCall), ['GET /api/profiles/Alice/game']);
  });

  test('a 404 means there is no game yet, so undefined', async () => {
    const { fetch } = fakeFetch(() => json({ error: 'no active game' }, 404));
    assert.equal(await createGameApi(fetch).load('Alice'), undefined);
  });

  test('the nickname is URL-encoded', async () => {
    const { fetch, calls } = fakeFetch(() => json(STATE));
    await createGameApi(fetch).load('Ann Lee/2');
    assert.deepEqual(calls.map(describeCall), ['GET /api/profiles/Ann%20Lee%2F2/game']);
  });
});

describe('start', () => {
  test('POST a new game and parse the 201 body', async () => {
    const { fetch, calls } = fakeFetch(() => json(STATE, 201));
    assert.deepEqual(await createGameApi(fetch).start('Alice'), STATE);
    assert.deepEqual(calls.map(describeCall), ['POST /api/profiles/Alice/game']);
  });
});

describe('move', () => {
  test('POST the tile as JSON and parse the 200 body', async () => {
    const moved: GameState = { ...STATE, moves: 1, version: 2 };
    const { fetch, calls } = fakeFetch(() => json(moved));
    assert.deepEqual(await createGameApi(fetch).move('Alice', 14), moved);
    assert.deepEqual(calls.map(describeCall), ['POST /api/profiles/Alice/game/move']);
    assert.deepEqual(
      calls.map((call) => call.body),
      ['{"tile":14}'],
    );
  });

  test('an illegal move (409) throws GameApiError with status and server message', async () => {
    const { fetch } = fakeFetch(() => json({ error: 'illegal move' }, 409));
    await assert.rejects(
      createGameApi(fetch).move('Alice', 1),
      isGameApiError(409, 'illegal move'),
    );
  });

  test('a solved game (409) keeps the server message', async () => {
    const { fetch } = fakeFetch(() => json({ error: 'game already solved' }, 409));
    await assert.rejects(
      createGameApi(fetch).move('Alice', 1),
      isGameApiError(409, 'game already solved'),
    );
  });
});

describe('reset', () => {
  test('POST /reset and parse the 200 body', async () => {
    const { fetch, calls } = fakeFetch(() => json(STATE));
    assert.deepEqual(await createGameApi(fetch).reset('Alice'), STATE);
    assert.deepEqual(calls.map(describeCall), ['POST /api/profiles/Alice/game/reset']);
  });

  test('without a game (404) throws GameApiError', async () => {
    const { fetch } = fakeFetch(() => json({ error: 'no active game' }, 404));
    await assert.rejects(
      createGameApi(fetch).reset('Alice'),
      isGameApiError(404, 'no active game'),
    );
  });
});

describe('failures', () => {
  test('a network failure throws GameApiError "Could not reach the server"', async () => {
    const { fetch } = fakeFetch(() => {
      throw new TypeError('fetch failed');
    });
    await assert.rejects(
      createGameApi(fetch).load('Alice'),
      isGameApiError(0, 'Could not reach the server'),
    );
  });

  test('a non-JSON error body falls back to a generic message', async () => {
    const { fetch } = fakeFetch(() => new Response('oops', { status: 500 }));
    await assert.rejects(
      createGameApi(fetch).start('Alice'),
      isGameApiError(500, 'Request failed with status 500'),
    );
  });

  test('a 200 body that is not a game state throws GameApiError', async () => {
    const { fetch } = fakeFetch(() => json({ nope: true }));
    await assert.rejects(
      createGameApi(fetch).load('Alice'),
      isGameApiError(200, 'Unexpected response from the server'),
    );
  });
});
