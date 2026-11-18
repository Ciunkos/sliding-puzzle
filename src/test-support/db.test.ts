import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { FIXED_NOW, fixedNow, openTestDb } from './db.ts';

const INSERT_PROFILE = 'INSERT INTO profiles (nickname, nickname_key, created_at) VALUES (?, ?, ?)';

describe('openTestDb', () => {
  test('a fresh test database stores and returns a profile', async () => {
    const db = await openTestDb();

    await db.run(INSERT_PROFILE, ['Ada', 'ada', FIXED_NOW.toISOString()]);

    assert.deepEqual(await db.get('SELECT * FROM profiles'), {
      id: 1,
      nickname: 'Ada',
      nickname_key: 'ada',
      created_at: '2026-01-01T00:00:00.000Z',
    });
  });

  test('two test databases do not share rows', async () => {
    const first = await openTestDb();
    const second = await openTestDb();

    await first.run(INSERT_PROFILE, ['Ada', 'ada', FIXED_NOW.toISOString()]);

    assert.deepEqual(await second.all('SELECT * FROM profiles'), []);
  });

  test('the fixed clock always returns the same instant', () => {
    assert.equal(fixedNow().toISOString(), '2026-01-01T00:00:00.000Z');
  });
});
