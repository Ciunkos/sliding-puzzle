import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { dbContract } from '../test-support/db.contract.ts';
import { createNodeSqliteDb } from './server.ts';

dbContract('createNodeSqliteDb in memory', () => Promise.resolve(createNodeSqliteDb(':memory:')));

describe('createNodeSqliteDb', () => {
  test('a row pointing at a missing parent is rejected', async () => {
    // Given a child table that references a parent table with no rows
    const db = createNodeSqliteDb(':memory:');
    await db.run('CREATE TABLE parent (id INTEGER PRIMARY KEY)');
    await db.run('CREATE TABLE child (pid INTEGER REFERENCES parent(id))');

    // When a child row points at parent 1, then it is rejected
    await assert.rejects(db.run('INSERT INTO child (pid) VALUES (1)'));
  });
});
