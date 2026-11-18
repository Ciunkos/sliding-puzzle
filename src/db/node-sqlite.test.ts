import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createNodeSqliteDb } from './server.ts';
import { dbContract } from './contract.ts';

dbContract('createNodeSqliteDb(":memory:")', () => createNodeSqliteDb(':memory:'));

describe('createNodeSqliteDb', () => {
  test('enforces foreign keys', async () => {
    const db = createNodeSqliteDb(':memory:');
    await db.run('CREATE TABLE parent (id INTEGER PRIMARY KEY)');
    await db.run('CREATE TABLE child (pid INTEGER REFERENCES parent(id))');
    await assert.rejects(db.run('INSERT INTO child (pid) VALUES (1)'), /FOREIGN KEY/);
  });
});
