import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { fixedNow, openTestDb } from '../test-support/db.ts';
import { createProfileService, profileRoutes, type ProfileService } from './server.ts';

/** The first profile created on a fresh database: its createdAt is the injected fixed clock. */
const ADA = { id: 1, nickname: 'Ada', createdAt: '2026-01-01T00:00:00.000Z' };

async function openService(): Promise<ProfileService> {
  return createProfileService(await openTestDb(), fixedNow);
}

async function openRoutes(): Promise<ReturnType<typeof profileRoutes>> {
  return profileRoutes(await openService());
}

function postProfile(app: ReturnType<typeof profileRoutes>, body: string): Promise<Response> {
  return Promise.resolve(
    app.request('/api/profiles', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }),
  );
}

describe('profile service', () => {
  test('getting the same nickname twice returns the same profile', async () => {
    // Given a fresh database
    const service = await openService();

    // When Ada is requested twice
    const first = await service.getOrCreate('Ada');
    const second = await service.getOrCreate('Ada');

    // Then both calls return the one profile
    assert.deepEqual([first, second], [ADA, ADA]);
  });

  test('a different casing returns the existing profile with its first display casing', async () => {
    const service = await openService();
    await service.getOrCreate('Ada');

    const again = await service.getOrCreate('ADA');

    assert.deepEqual(again, ADA);
  });

  test('two concurrent creations of one new nickname give one profile', async () => {
    const service = await openService();

    const both = await Promise.all([service.getOrCreate('Racer'), service.getOrCreate('racer')]);

    assert.deepEqual(both, [
      { id: 1, nickname: 'Racer', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 1, nickname: 'Racer', createdAt: '2026-01-01T00:00:00.000Z' },
    ]);
  });

  test('finding ignores casing', async () => {
    const service = await openService();
    await service.getOrCreate('Ada');

    assert.deepEqual(await service.find('aDA'), ADA);
  });

  test('finding an unknown nickname gives undefined', async () => {
    const service = await openService();

    assert.equal(await service.find('nobody'), undefined);
  });

  test('finding an invalid nickname gives undefined instead of throwing', async () => {
    const service = await openService();

    assert.equal(await service.find('a b'), undefined);
  });
});

describe('profile routes', () => {
  test('POST /api/profiles creates the profile and answers 200 with it', async () => {
    const app = await openRoutes();

    const res = await postProfile(app, '{"nickname":"Ada"}');

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), ADA);
  });

  test('POST /api/profiles for an existing nickname answers 200 with that profile', async () => {
    const app = await openRoutes();
    await postProfile(app, '{"nickname":"Ada"}');

    const res = await postProfile(app, '{"nickname":"Ada"}');

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), ADA);
  });

  test('POST /api/profiles with a body that is not JSON answers 400', async () => {
    const app = await openRoutes();

    const res = await postProfile(app, '{not json');

    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), {
      error: 'body must be a JSON object with a "nickname" string',
    });
  });

  test('POST /api/profiles with an invalid nickname answers 400 with the rule message', async () => {
    const app = await openRoutes();

    const res = await postProfile(app, '{"nickname":"a b"}');

    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), {
      error: 'nickname may only contain letters, digits, "_" and "-"',
    });
  });

  test('GET /api/profiles/:nickname answers 200 with a known profile', async () => {
    const app = await openRoutes();
    await postProfile(app, '{"nickname":"Ada"}');

    const res = await app.request('/api/profiles/Ada');

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), ADA);
  });

  test('GET /api/profiles/:nickname answers 404 for an unknown nickname', async () => {
    const app = await openRoutes();

    const res = await app.request('/api/profiles/nobody');

    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: 'profile not found' });
  });
});
