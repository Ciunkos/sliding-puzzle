// Behaviour every Db driver must satisfy. Each driver's test file calls dbContract with a factory
// that returns a fresh, empty database, so every driver is held to the same cases.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Db } from '../db/index.ts';

const CREATE_ITEMS = 'CREATE TABLE items (id INTEGER PRIMARY KEY, label TEXT UNIQUE, qty INTEGER)';
const INSERT_ITEM = 'INSERT INTO items (label, qty) VALUES (?, ?)';

export function dbContract(name: string, open: () => Promise<Db>): void {
  describe(name, () => {
    async function withItems(): Promise<Db> {
      const db = await open();
      await db.run(CREATE_ITEMS);
      return db;
    }

    test('run returns the number of changed rows', async () => {
      // Given three items
      const db = await withItems();
      await db.run("INSERT INTO items (label, qty) VALUES ('a', 1), ('b', 2), ('c', 3)");

      // When every item is updated
      const result = await db.run('UPDATE items SET qty = qty + 10');

      // Then three rows changed
      assert.deepEqual(result, { changes: 3 });
    });

    test('get returns undefined when no row matches', async () => {
      const db = await withItems();

      const row = await db.get('SELECT * FROM items WHERE id = ?', [42]);

      assert.equal(row, undefined);
    });

    test('all returns rows in the order the query asks for', async () => {
      // Given items inserted out of order
      const db = await withItems();
      await db.run("INSERT INTO items (label, qty) VALUES ('c', 3), ('a', 1), ('b', 2)");

      // When they are read ordered by label
      const rows = await db.all('SELECT label FROM items ORDER BY label');

      // Then they come back in that order
      assert.deepEqual(rows, [{ label: 'a' }, { label: 'b' }, { label: 'c' }]);
    });

    test('parameters bind in order, including null', async () => {
      // Given an item stored with a null quantity through parameters
      const db = await withItems();
      await db.run(INSERT_ITEM, ['x', null]);

      // When it is looked up by a null parameter
      const row = await db.get('SELECT label, qty FROM items WHERE qty IS ?', [null]);

      // Then the stored values come back
      assert.deepEqual(row, { label: 'x', qty: null });
    });

    test('a failing statement rejects the promise', async () => {
      const db = await withItems();

      await assert.rejects(db.run('SELECT * FROM no_such_table'));
      await assert.rejects(db.all('SELECT * FROM no_such_table'));
      await assert.rejects(db.get('SELECT * FROM no_such_table'));
    });

    test('batch commits every statement', async () => {
      // Given an empty table
      const db = await withItems();

      // When a batch inserts two items and updates one
      await db.batch([
        { sql: INSERT_ITEM, params: ['a', 1] },
        { sql: INSERT_ITEM, params: ['b', 2] },
        { sql: 'UPDATE items SET qty = 5 WHERE label = ?', params: ['a'] },
      ]);

      // Then every statement took effect
      assert.deepEqual(await db.all('SELECT label, qty FROM items ORDER BY label'), [
        { label: 'a', qty: 5 },
        { label: 'b', qty: 2 },
      ]);
    });

    test('batch reports the rows each statement changed, in statement order', async () => {
      // Given two items
      const db = await withItems();
      await db.run("INSERT INTO items (label, qty) VALUES ('a', 1), ('b', 2)");

      // When a batch updates both, inserts one and updates none
      const changes = await db.batch([
        { sql: 'UPDATE items SET qty = qty + 1' },
        { sql: INSERT_ITEM, params: ['c', 3] },
        { sql: 'UPDATE items SET qty = 0 WHERE label = ?', params: ['none'] },
      ]);

      // Then each statement says how many rows it changed
      assert.deepEqual(changes, [{ changes: 2 }, { changes: 1 }, { changes: 0 }]);
    });

    test('an empty batch resolves and changes nothing', async () => {
      // Given one stored item
      const db = await withItems();
      await db.run(INSERT_ITEM, ['kept', 0]);

      // When an empty batch runs
      await db.batch([]);

      // Then the table is unchanged
      assert.deepEqual(await db.all('SELECT label, qty FROM items'), [{ label: 'kept', qty: 0 }]);
    });

    test('batch rolls back everything when one statement fails', async () => {
      // Given one stored item
      const db = await withItems();
      await db.run(INSERT_ITEM, ['kept', 0]);

      // When a batch inserts a new item and then breaks the unique label
      const failing = db.batch([
        { sql: INSERT_ITEM, params: ['new', 1] },
        { sql: INSERT_ITEM, params: ['kept', 2] },
      ]);

      // Then the batch rejects and the new item was not kept either
      await assert.rejects(failing);
      assert.deepEqual(await db.all('SELECT label, qty FROM items'), [{ label: 'kept', qty: 0 }]);
    });
  });
}
