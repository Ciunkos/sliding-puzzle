import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, test } from 'node:test';
import type { Db } from '../db/index.ts';
import { createNodeSqliteDb, migrate } from '../db/server.ts';
import { profileSchema } from './index.ts';
import { createProfileService, profileRoutes } from './server.ts';

const migrationsDir = fileURLToPath(new URL('../../migrations', import.meta.url));
const FIXED_NOW = '2026-01-02T03:04:05.000Z';

let db: Db;
let app: ReturnType<typeof profileRoutes>;

beforeEach(async () => {
  db = createNodeSqliteDb(':memory:');
  await migrate(db, migrationsDir);
  app = profileRoutes(createProfileService(db, () => new Date(FIXED_NOW)));
});

async function postJson(body: unknown): Promise<Response> {
  return await app.request('/api/profiles', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/profiles', () => {
  test('creates a profile and returns it', async () => {
    const res = await postJson({ nickname: 'Ada' });
    assert.equal(res.status, 200);
    const profile = profileSchema.parse(await res.json());
    assert.deepEqual(profile, { id: profile.id, nickname: 'Ada', createdAt: FIXED_NOW });
  });

  test('is idempotent, including across casings', async () => {
    const first = profileSchema.parse(await (await postJson({ nickname: 'Ada' })).json());
    const res = await postJson({ nickname: 'ADA' });
    assert.equal(res.status, 200);
    const second = profileSchema.parse(await res.json());
    assert.equal(second.id, first.id);
    assert.equal(second.nickname, 'Ada');
  });

  test('a body without a nickname is 400 with an error string', async () => {
    const res = await postJson({});
    assert.equal(res.status, 400);
    assert.equal(typeof ((await res.json()) as { error?: unknown }).error, 'string');
  });

  test('a body that is not JSON is 400', async () => {
    const res = await app.request('/api/profiles', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    assert.equal(res.status, 400);
  });

  test('an invalid nickname is 400 with an error string', async () => {
    const res = await postJson({ nickname: 'a b' });
    assert.equal(res.status, 400);
    assert.equal(typeof ((await res.json()) as { error?: unknown }).error, 'string');
  });
});

describe('GET /api/profiles/:nickname', () => {
  test('returns the profile for a known nickname in any casing', async () => {
    const created = profileSchema.parse(await (await postJson({ nickname: 'Ada' })).json());
    const res = await app.request('/api/profiles/aDA');
    assert.equal(res.status, 200);
    assert.deepEqual(profileSchema.parse(await res.json()), created);
  });

  test('an unknown nickname is 404 with the fixed error', async () => {
    const res = await app.request('/api/profiles/nobody');
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: 'profile not found' });
  });

  test('an invalid nickname in the path is also 404', async () => {
    const res = await app.request('/api/profiles/a%20b');
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: 'profile not found' });
  });
});
