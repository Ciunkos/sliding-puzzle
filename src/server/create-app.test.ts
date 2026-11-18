import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { fixedNow, openTestDb } from '../test-support/db.ts';
import { openEmptyDb } from '../test-support/empty-db.ts';
import { repeated, scriptedRng } from '../test-support/scripted-rng.ts';
import { createApp } from './create-app.ts';
import { features } from './features.ts';

/** Enough hand-written random values for one puzzle shuffle; a shuffle needing more fails loudly. */
const SHUFFLE_VALUES = repeated([0.1, 0.6, 0.35, 0.85], 250);
const ADA_PUZZLE = '/sliding-puzzle/api/profiles/Ada/games/sliding-puzzle';
const NEAR_SOLVED = '/sliding-puzzle/api/test/profiles/Ada/game/near-solved';

type App = ReturnType<typeof createApp>;

function post(app: App, path: string, body: string): Promise<Response> {
  return Promise.resolve(
    app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body }),
  );
}

async function openApp(enableTestRoutes: boolean): Promise<App> {
  const db = await openTestDb();
  const random = scriptedRng(SHUFFLE_VALUES);
  return createApp({
    basePath: '/sliding-puzzle',
    db,
    features,
    random,
    now: fixedNow,
    enableTestRoutes,
  });
}

describe('createApp', () => {
  test('a new profile can start the puzzle and read the saved game back', async () => {
    // Given an app with the installed features over a fresh database
    const app = await openApp(false);

    // When Ada is created, starts the puzzle and reads it back
    const created = await post(app, '/sliding-puzzle/api/profiles', '{"nickname":"Ada"}');
    const started = await post(app, ADA_PUZZLE, '{}');
    const read = await app.request(ADA_PUZZLE);

    // Then every step succeeded and the saved game is fresh
    assert.deepEqual([created.status, started.status, read.status], [200, 201, 200]);
    assert.partialDeepStrictEqual(await read.json(), {
      moves: 0,
      version: 1,
      finished: false,
      startedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  test('an api path that no route answers is 404 not found', async () => {
    const app = await openApp(false);

    const res = await app.request('/sliding-puzzle/api/nothing-here');

    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: 'not found' });
  });

  test('an internal error is 500 without the error message', async () => {
    // Given an app over a database whose tables are missing
    const app = createApp({
      basePath: '/sliding-puzzle',
      db: openEmptyDb(),
      features,
      random: scriptedRng([]),
      now: fixedNow,
    });

    // When a request reaches the database
    const res = await post(app, '/sliding-puzzle/api/profiles', '{"nickname":"Ada"}');

    // Then the client sees only the generic error, not "no such table: profiles"
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { error: 'internal error' });
  });

  test('an internal error is handed to the server log with its message', async () => {
    // Given an app over a database whose tables are missing, with a log that keeps what it gets
    const logged: unknown[] = [];
    const app = createApp({
      basePath: '/sliding-puzzle',
      db: openEmptyDb(),
      features,
      random: scriptedRng([]),
      now: fixedNow,
      logError: (error) => logged.push(error),
    });

    // When a request reaches the database
    await post(app, '/sliding-puzzle/api/profiles', '{"nickname":"Ada"}');

    // Then the server log got the one error, with the message the client never sees
    assert.equal(logged.length, 1);
    assert.match(String(logged[0]), /no such table: profiles/);
  });

  test('the test routes are absent by default', async () => {
    const app = await openApp(false);
    await post(app, '/sliding-puzzle/api/profiles', '{"nickname":"Ada"}');

    const res = await post(app, NEAR_SOLVED, '');

    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: 'not found' });
  });

  test('the test routes are present when enabled', async () => {
    const app = await openApp(true);
    await post(app, '/sliding-puzzle/api/profiles', '{"nickname":"Ada"}');

    const res = await post(app, NEAR_SOLVED, '');

    assert.equal(res.status, 201);
  });
});
