import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, test } from 'node:test';
import type { Db } from '../db/index.ts';
import { createNodeSqliteDb, migrate } from '../db/server.ts';
import { createProfileService, InvalidNicknameError, type ProfileService } from './server.ts';

const migrationsDir = fileURLToPath(new URL('../../migrations', import.meta.url));
const FIXED_NOW = '2026-01-02T03:04:05.000Z';

let db: Db;
let service: ProfileService;

beforeEach(async () => {
  db = createNodeSqliteDb(':memory:');
  await migrate(db, migrationsDir);
  service = createProfileService(db, () => new Date(FIXED_NOW));
});

describe('ProfileService.getOrCreate', () => {
  test('creates a profile with the trimmed nickname and an ISO createdAt', async () => {
    const profile = await service.getOrCreate('  Ada ');
    assert.equal(profile.nickname, 'Ada');
    assert.equal(profile.createdAt, FIXED_NOW);
    assert.ok(Number.isInteger(profile.id) && profile.id > 0);
  });

  test('is idempotent for the same nickname', async () => {
    const first = await service.getOrCreate('Ada');
    const second = await service.getOrCreate('Ada');
    assert.deepEqual(second, first);
    assert.deepEqual(await db.all('SELECT COUNT(*) AS n FROM profiles'), [{ n: 1 }]);
  });

  test('a different casing returns the same profile and keeps the original display casing', async () => {
    const first = await service.getOrCreate('Ada');
    const other = await service.getOrCreate('ADA');
    assert.equal(other.id, first.id);
    assert.equal(other.nickname, 'Ada');
    assert.deepEqual(await db.all('SELECT COUNT(*) AS n FROM profiles'), [{ n: 1 }]);
  });

  test('rejects an invalid nickname with InvalidNicknameError', async () => {
    await assert.rejects(service.getOrCreate('a b'), InvalidNicknameError);
    await assert.rejects(service.getOrCreate(''), InvalidNicknameError);
  });

  test('two concurrent calls for the same new nickname return the same id', async () => {
    const [a, b] = await Promise.all([service.getOrCreate('Racer'), service.getOrCreate('racer')]);
    assert.equal(a.id, b.id);
    assert.deepEqual(await db.all('SELECT COUNT(*) AS n FROM profiles'), [{ n: 1 }]);
  });
});

describe('ProfileService.find', () => {
  test('finds an existing profile case-insensitively', async () => {
    const created = await service.getOrCreate('Ada');
    assert.deepEqual(await service.find('aDA'), created);
  });

  test('returns undefined for an unknown nickname', async () => {
    assert.equal(await service.find('nobody'), undefined);
  });

  test('returns undefined for an invalid nickname instead of throwing', async () => {
    assert.equal(await service.find('a b'), undefined);
    assert.equal(await service.find('a'), undefined);
  });
});
