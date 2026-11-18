import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createRng, legalMoves } from '../puzzle/index.ts';
import { gameStateSchema, type GameState } from './index.ts';
import { createGameService, gameRoutes } from './server.ts';
import {
  addProfile,
  ALL_TILES,
  insertGame,
  lookupOf,
  NEAR_SOLVED,
  openDb,
} from './test-helpers.ts';

type App = ReturnType<typeof gameRoutes>;

const BASE = '/api/profiles/Alice/game';

async function setup() {
  const db = await openDb();
  const id = await addProfile(db, 'Alice');
  const app = gameRoutes(createGameService(db, { random: createRng(7) }), lookupOf({ Alice: id }));
  return { db, id, app };
}

function send(app: App, method: 'GET' | 'POST', path: string, body?: string) {
  return app.request(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body,
  });
}

async function startGame(app: App): Promise<GameState> {
  const res = await send(app, 'POST', BASE);
  assert.equal(res.status, 201);
  return gameStateSchema.parse(await res.json());
}

describe('GET game', () => {
  test('is 200 with the state after a start, and 404 no active game before one', async () => {
    const { app } = await setup();
    const before = await send(app, 'GET', BASE);
    assert.equal(before.status, 404);
    assert.deepEqual(await before.json(), { error: 'no active game' });

    const started = await startGame(app);
    const res = await send(app, 'GET', BASE);
    assert.equal(res.status, 200);
    assert.deepEqual(gameStateSchema.parse(await res.json()), started);
  });

  test('the nickname is resolved through the lookup, so case does not matter', async () => {
    const { app } = await setup();
    const started = await startGame(app);
    const res = await send(app, 'GET', '/api/profiles/ALICE/game');
    assert.equal(res.status, 200);
    assert.deepEqual(gameStateSchema.parse(await res.json()), started);
  });
});

describe('POST game', () => {
  test('is 201 with a new game, replacing any existing one', async () => {
    const { app } = await setup();
    const first = await startGame(app);
    const second = await startGame(app);
    assert.notDeepEqual(second.board, first.board);
    assert.equal(first.version, 1);
    assert.equal(second.version, 2);
  });
});

describe('POST game/move', () => {
  test('a legal tile is 200 with the updated state', async () => {
    const { app } = await setup();
    const started = await startGame(app);
    const tile = legalMoves(started.board)[0];
    assert.ok(tile !== undefined);

    const res = await send(app, 'POST', `${BASE}/move`, JSON.stringify({ tile }));
    assert.equal(res.status, 200);
    const state = gameStateSchema.parse(await res.json());
    assert.equal(state.moves, 1);
    assert.equal(state.version, 2);
  });

  test('an illegal tile is 409 illegal move', async () => {
    const { app } = await setup();
    const started = await startGame(app);
    const tile = ALL_TILES.find((t) => !legalMoves(started.board).includes(t));
    assert.ok(tile !== undefined);

    const res = await send(app, 'POST', `${BASE}/move`, JSON.stringify({ tile }));
    assert.equal(res.status, 409);
    assert.deepEqual(await res.json(), { error: 'illegal move' });
  });

  test('without a game it is 404 no active game', async () => {
    const { app } = await setup();
    const res = await send(app, 'POST', `${BASE}/move`, JSON.stringify({ tile: 1 }));
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: 'no active game' });
  });

  test('on a solved game it is 409 game already solved', async () => {
    const { db, id, app } = await setup();
    await insertGame(db, id, NEAR_SOLVED);

    const solving = await send(app, 'POST', `${BASE}/move`, JSON.stringify({ tile: 15 }));
    assert.equal(solving.status, 200);
    assert.equal(gameStateSchema.parse(await solving.json()).solved, true);

    const again = await send(app, 'POST', `${BASE}/move`, JSON.stringify({ tile: 12 }));
    assert.equal(again.status, 409);
    assert.deepEqual(await again.json(), { error: 'game already solved' });
  });

  test('a malformed body is 400 with an error message', async () => {
    const { app } = await setup();
    await startGame(app);
    const bodies = [
      undefined,
      'not json',
      '{}',
      '{"tile":0}',
      '{"tile":16}',
      '{"tile":"3"}',
      '{"tile":2.5}',
    ];
    for (const body of bodies) {
      const res = await send(app, 'POST', `${BASE}/move`, body);
      assert.equal(res.status, 400, `body ${String(body)}`);
      const error: unknown = ((await res.json()) as { error?: unknown }).error;
      assert.equal(typeof error, 'string', `body ${String(body)}`);
    }
  });
});

describe('POST game/reset', () => {
  test('is 200 and restores the initial board with zero moves', async () => {
    const { app } = await setup();
    const started = await startGame(app);
    const tile = legalMoves(started.board)[0];
    assert.ok(tile !== undefined);
    await send(app, 'POST', `${BASE}/move`, JSON.stringify({ tile }));

    const res = await send(app, 'POST', `${BASE}/reset`);
    assert.equal(res.status, 200);
    const state = gameStateSchema.parse(await res.json());
    assert.deepEqual(state.board, started.initial);
    assert.equal(state.moves, 0);
  });

  test('without a game it is 404 no active game', async () => {
    const { app } = await setup();
    const res = await send(app, 'POST', `${BASE}/reset`);
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: 'no active game' });
  });
});

describe('unknown profile', () => {
  test('every route is 404 profile not found', async () => {
    const { app } = await setup();
    const prefix = '/api/profiles/Nobody/game';
    const calls: ['GET' | 'POST', string, string | undefined][] = [
      ['GET', prefix, undefined],
      ['POST', prefix, undefined],
      ['POST', `${prefix}/move`, JSON.stringify({ tile: 1 })],
      ['POST', `${prefix}/reset`, undefined],
    ];
    for (const [method, path, body] of calls) {
      const res = await send(app, method, path, body);
      assert.equal(res.status, 404, `${method} ${path}`);
      assert.deepEqual(await res.json(), { error: 'profile not found' });
    }
  });
});
