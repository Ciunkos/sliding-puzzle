import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { openEmptyDb } from './empty-db.ts';

describe('openEmptyDb', () => {
  test('an empty database has no profiles table, so a query on it rejects', async () => {
    // Given a database without migrations
    const db = openEmptyDb();

    // When profiles are read, Then the query fails
    await assert.rejects(db.all('SELECT * FROM profiles'), /no such table: profiles/);
  });
});
