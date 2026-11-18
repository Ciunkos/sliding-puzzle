import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import type { D1Like, D1PreparedLike, Db, SqlParam } from '../db/index.ts';
import { createNodeSqliteDb, migrate } from '../db/server.ts';
import { gameStateSchema } from '../game/index.ts';
import { legalMoves } from '../puzzle/index.ts';
import { profileSchema } from '../profile/index.ts';
import { createApp } from './create-app.ts';
import worker from './worker.ts';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations', import.meta.url));

/** Tile 15 slid into the blank of the solved board: one legal move from solved. */
const NEAR_SOLVED = [...Array.from({ length: 14 }, (_, i) => i + 1), 0, 15];

async function openDb(): Promise<Db> {
  const db = createNodeSqliteDb(':memory:');
  await migrate(db, MIGRATIONS_DIR);
  return db;
}

function send(method: string, body?: unknown): RequestInit {
  if (body === undefined) return { method };
  return {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

async function createProfile(app: ReturnType<typeof createApp>, nickname: string): Promise<void> {
  const res = await app.request('/api/profiles', send('POST', { nickname }));
  assert.equal(res.status, 200);
}

describe('createApp over HTTP', () => {
  it('GET /api/health returns ok', async () => {
    const app = createApp({ db: await openDb() });
    const res = await app.request('/api/health');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  });

  it('runs the product flow: profile, game, moves, illegal move, reset', async () => {
    const app = createApp({ db: await openDb() });

    const created = await app.request('/api/profiles', send('POST', { nickname: 'Anna' }));
    assert.equal(created.status, 200);
    const profile = profileSchema.parse(await created.json());
    assert.equal(profile.nickname, 'Anna');

    const fetched = await app.request('/api/profiles/Anna');
    assert.equal(fetched.status, 200);
    assert.deepEqual(profileSchema.parse(await fetched.json()), profile);

    const started = await app.request('/api/profiles/Anna/game', send('POST'));
    assert.equal(started.status, 201);
    const initial = gameStateSchema.parse(await started.json());
    assert.equal(initial.moves, 0);
    assert.equal(initial.solved, false);

    const current = await app.request('/api/profiles/Anna/game');
    assert.equal(current.status, 200);
    assert.deepEqual(gameStateSchema.parse(await current.json()), initial);

    const [tile] = legalMoves(initial.board);
    if (tile === undefined) assert.fail('a shuffled board always has a legal move');
    const moved = await app.request('/api/profiles/Anna/game/move', send('POST', { tile }));
    assert.equal(moved.status, 200);
    const afterMove = gameStateSchema.parse(await moved.json());
    assert.equal(afterMove.moves, 1);
    assert.notDeepEqual(afterMove.board, initial.board);

    const illegalTile = Array.from({ length: 15 }, (_, i) => i + 1).find(
      (t) => !legalMoves(afterMove.board).includes(t),
    );
    if (illegalTile === undefined) assert.fail('expected a non-adjacent tile');
    const illegal = await app.request(
      '/api/profiles/Anna/game/move',
      send('POST', { tile: illegalTile }),
    );
    assert.equal(illegal.status, 409);
    assert.deepEqual(await illegal.json(), { error: 'illegal move' });

    const reset = await app.request('/api/profiles/Anna/game/reset', send('POST'));
    assert.equal(reset.status, 200);
    const resetState = gameStateSchema.parse(await reset.json());
    assert.deepEqual(resetState.board, initial.board);
    assert.equal(resetState.moves, 0);
    assert.ok(resetState.version > afterMove.version);
  });

  it('resumes the same game from a second app on the same db, with a different nickname casing', async () => {
    const db = await openDb();
    const firstBrowser = createApp({ db });
    await createProfile(firstBrowser, 'Anna');
    const started = await firstBrowser.request('/api/profiles/Anna/game', send('POST'));
    assert.equal(started.status, 201);
    const fromFirst = await firstBrowser.request('/api/profiles/Anna/game');
    const expected = gameStateSchema.parse(await fromFirst.json());

    const secondBrowser = createApp({ db });
    const resumed = await secondBrowser.request('/api/profiles/aNNA/game');
    assert.equal(resumed.status, 200);
    assert.deepEqual(gameStateSchema.parse(await resumed.json()), expected);
  });

  it('answers 404 for an unknown profile and for a game that does not exist', async () => {
    const app = createApp({ db: await openDb() });

    const profile = await app.request('/api/profiles/Nobody');
    assert.equal(profile.status, 404);
    assert.deepEqual(await profile.json(), { error: 'profile not found' });

    const game = await app.request('/api/profiles/Nobody/game');
    assert.equal(game.status, 404);

    const start = await app.request('/api/profiles/Nobody/game', send('POST'));
    assert.equal(start.status, 404);

    await createProfile(app, 'Anna');
    const noGame = await app.request('/api/profiles/Anna/game');
    assert.equal(noGame.status, 404);
    assert.deepEqual(await noGame.json(), { error: 'no active game' });
  });

  it('answers 404 with a JSON body for an unknown /api path', async () => {
    const app = createApp({ db: await openDb() });
    const res = await app.request('/api/does-not-exist');
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: 'not found' });
  });

  it('answers 500 without leaking the error message when the db fails', async () => {
    const db = await openDb();
    const broken: Db = { ...db, get: () => Promise.reject(new Error('disk on fire')) };
    const app = createApp({ db: broken });

    const res = await app.request('/api/profiles', send('POST', { nickname: 'Anna' }));
    assert.equal(res.status, 500);
    const text = await res.text();
    assert.deepEqual(JSON.parse(text), { error: 'internal error' });
    assert.ok(!text.includes('disk on fire'));
    assert.ok(!text.includes('stack'));
  });

  it('does not mount the near-solved test route by default', async () => {
    const app = createApp({ db: await openDb() });
    await createProfile(app, 'Anna');
    const res = await app.request('/api/test/profiles/Anna/game/near-solved', send('POST'));
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: 'not found' });
  });

  it('with enableTestRoutes, the near-solved route reaches solved in one move', async () => {
    const app = createApp({ db: await openDb(), enableTestRoutes: true });
    await createProfile(app, 'Anna');

    const started = await app.request('/api/test/profiles/Anna/game/near-solved', send('POST'));
    assert.equal(started.status, 201);
    const state = gameStateSchema.parse(await started.json());
    assert.deepEqual(state.board, NEAR_SOLVED);
    assert.equal(state.solved, false);

    const solvedMove = await app.request(
      '/api/profiles/Anna/game/move',
      send('POST', { tile: 15 }),
    );
    assert.equal(solvedMove.status, 200);
    const solved = gameStateSchema.parse(await solvedMove.json());
    assert.equal(solved.solved, true);

    const after = await app.request('/api/profiles/Anna/game/move', send('POST', { tile: 1 }));
    assert.equal(after.status, 409);
    assert.deepEqual(await after.json(), { error: 'game already solved' });
  });

  it('answers 404 for the near-solved route with an unknown profile when test routes are on', async () => {
    const app = createApp({ db: await openDb(), enableTestRoutes: true });
    const res = await app.request('/api/test/profiles/Nobody/game/near-solved', send('POST'));
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: 'profile not found' });
  });
});

/** Fake D1 binding backed by node:sqlite. Duplicated from src/db/d1.test.ts on purpose. */
function fakeD1(sqlite: DatabaseSync): D1Like {
  function prepare(sql: string): D1PreparedLike {
    let bound: SqlParam[] = [];
    const stmt: D1PreparedLike = {
      bind(...values: SqlParam[]) {
        bound = values;
        return stmt;
      },
      run() {
        return Promise.resolve().then(() => {
          const result = sqlite.prepare(sql).run(...bound);
          return { meta: { changes: Number(result.changes) } };
        });
      },
      all() {
        return Promise.resolve().then(() => ({ results: sqlite.prepare(sql).all(...bound) }));
      },
      first() {
        return Promise.resolve().then(() => sqlite.prepare(sql).get(...bound) ?? null);
      },
    };
    return stmt;
  }

  return {
    prepare,
    batch(stmts: D1PreparedLike[]) {
      return Promise.all(stmts.map((stmt) => stmt.run()));
    },
  };
}

describe('worker entry', () => {
  it('fetch serves /api/health with a D1 binding', async () => {
    const env = { DB: fakeD1(new DatabaseSync(':memory:')) };
    const res = await worker.fetch(new Request('https://worker.test/api/health'), env);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  });

  it('fetch uses the D1 binding for profile routes', async () => {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec(
      'CREATE TABLE profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, nickname TEXT NOT NULL, nickname_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL)',
    );
    const env = { DB: fakeD1(sqlite) };
    const res = await worker.fetch(
      new Request('https://worker.test/api/profiles', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nickname: 'Anna' }),
      }),
      env,
    );
    assert.equal(res.status, 200);
    assert.equal(profileSchema.parse(await res.json()).nickname, 'Anna');
  });
});
