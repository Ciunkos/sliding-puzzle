// The HTTP mapping of the game routes, over the real service and the real profile service.
// gameRoutes is reached through featureRoutes (./server.ts): a test may not import service.ts to
// build the service that gameRoutes needs, and featureRoutes builds exactly gameRoutes over it.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { fixedNow, openTestDb } from '../test-support/db.ts';
import { createTestProfile, testProfiles } from '../test-support/profiles.ts';
import { ALWAYS_LOW, tallyGame } from '../test-support/tally-game.ts';
import { featureRoutes } from './server.ts';

const ADA_GAME = '/api/profiles/Ada/games/tally';

/** The tally game's routes over a fresh database that has one profile, Ada. */
async function setup() {
  const db = await openTestDb();
  await createTestProfile(db, 'Ada');
  const profiles = testProfiles(db);
  const context = { db, profiles, random: ALWAYS_LOW, now: fixedNow, enableTestRoutes: false };
  return featureRoutes({ definition: tallyGame }, context);
}

type App = Awaited<ReturnType<typeof setup>>;

async function post(app: App, path: string, body: string): Promise<Response> {
  return app.request(path, { method: 'POST', body });
}

/** Ada's game after `body` started it. */
async function started(body: string): Promise<App> {
  const app = await setup();
  await post(app, ADA_GAME, body);
  return app;
}

describe('the game routes', () => {
  test('starting with an empty body is 201 with a game of the default options', async () => {
    const app = await setup();

    const res = await post(app, ADA_GAME, '');

    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), {
      state: { count: 0, target: 5 },
      initial: { count: 0, target: 5 },
      moves: 0,
      finished: false,
      version: 1,
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: null,
    });
  });

  test('starting with options the game rejects is 400', async () => {
    const app = await setup();

    const res = await post(app, ADA_GAME, '{"target":"far"}');

    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: 'invalid game options' });
  });

  test('getting a saved game is 200 with the game', async () => {
    const app = await started('{"target":3}');

    const res = await app.request(ADA_GAME);

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      state: { count: 0, target: 3 },
      initial: { count: 0, target: 3 },
      moves: 0,
      finished: false,
      version: 1,
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: null,
    });
  });

  test('getting a game when there is none is 404', async () => {
    const app = await setup();

    const res = await app.request(ADA_GAME);

    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: 'no active game' });
  });

  test('a nickname in another casing finds the same profile', async () => {
    const app = await started('');

    const res = await app.request('/api/profiles/ADA/games/tally');

    assert.equal(res.status, 200);
  });

  test('an unknown nickname is 404', async () => {
    const app = await setup();

    const res = await app.request('/api/profiles/Nobody/games/tally');

    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: 'profile not found' });
  });

  test('a legal move is 200 with the moved game', async () => {
    const app = await started('');

    const res = await post(app, `${ADA_GAME}/move`, '{"add":2}');

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      state: { count: 2, target: 5 },
      initial: { count: 0, target: 5 },
      moves: 1,
      finished: false,
      version: 2,
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: null,
    });
  });

  test('a move body that is not JSON is 400', async () => {
    const app = await started('');

    const res = await post(app, `${ADA_GAME}/move`, '{add');

    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: 'invalid move request' });
  });

  test('a move without a game is 404', async () => {
    const app = await setup();

    const res = await post(app, `${ADA_GAME}/move`, '{"add":1}');

    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: 'no active game' });
  });

  test('an illegal move is 409', async () => {
    const app = await started('');

    const res = await post(app, `${ADA_GAME}/move`, '{"add":4}');

    assert.equal(res.status, 409);
    assert.deepEqual(await res.json(), { error: 'illegal move' });
  });

  test('a move on a finished game is 409', async () => {
    const app = await started('{"target":1}');
    await post(app, `${ADA_GAME}/move`, '{"add":1}');

    const res = await post(app, `${ADA_GAME}/move`, '{"add":1}');

    assert.equal(res.status, 409);
    assert.deepEqual(await res.json(), { error: 'game already finished' });
  });

  test('a reset is 200 with the game back at its start', async () => {
    const app = await started('');
    await post(app, `${ADA_GAME}/move`, '{"add":2}');

    const res = await post(app, `${ADA_GAME}/reset`, '');

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      state: { count: 0, target: 5 },
      initial: { count: 0, target: 5 },
      moves: 0,
      finished: false,
      version: 3,
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: null,
    });
  });
});
