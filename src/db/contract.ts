import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Db } from './index.ts';

/**
 * Behaviour every Db driver must satisfy. Each driver's test file calls this with a factory
 * that returns a fresh, empty database. Not a test file itself (no `.test.ts` suffix).
 */
export function dbContract(name: string, makeDb: () => Promise<Db> | Db): void {
  void describe(`Db contract: ${name}`, () => {
    async function withTable(): Promise<Db> {
      const db = await makeDb();
      await db.run('CREATE TABLE items (id INTEGER PRIMARY KEY, label TEXT UNIQUE, qty INTEGER)');
      return db;
    }

    void test('run returns the number of changed rows', async () => {
      const db = await withTable();
      assert.deepEqual(await db.run('INSERT INTO items (label, qty) VALUES (?, ?)', ['a', 1]), {
        changes: 1,
      });
      await db.run("INSERT INTO items (label, qty) VALUES ('b', 2), ('c', 3)");
      assert.deepEqual(await db.run('UPDATE items SET qty = qty + 10'), { changes: 3 });
      assert.deepEqual(await db.run('DELETE FROM items WHERE id = 999'), { changes: 0 });
    });

    void test('get returns undefined when no row matches', async () => {
      const db = await withTable();
      assert.equal(await db.get('SELECT * FROM items WHERE id = ?', [42]), undefined);
    });

    void test('get returns the first matching row as a plain object', async () => {
      const db = await withTable();
      await db.run("INSERT INTO items (label, qty) VALUES ('a', 1)");
      assert.deepEqual(await db.get('SELECT label, qty FROM items'), { label: 'a', qty: 1 });
    });

    void test('all returns every row in query order', async () => {
      const db = await withTable();
      await db.run("INSERT INTO items (label, qty) VALUES ('c', 3), ('a', 1), ('b', 2)");
      assert.deepEqual(await db.all('SELECT label FROM items ORDER BY label'), [
        { label: 'a' },
        { label: 'b' },
        { label: 'c' },
      ]);
    });

    void test('all returns an empty array when nothing matches', async () => {
      const db = await withTable();
      assert.deepEqual(await db.all('SELECT * FROM items'), []);
    });

    void test('params are bound in order, including null and numbers', async () => {
      const db = await withTable();
      await db.run('INSERT INTO items (label, qty) VALUES (?, ?)', ['x', null]);
      await db.run('INSERT INTO items (label, qty) VALUES (?, ?)', ['y', 7]);
      assert.deepEqual(await db.all('SELECT label, qty FROM items WHERE qty IS ?', [null]), [
        { label: 'x', qty: null },
      ]);
      assert.deepEqual(
        await db.get('SELECT label FROM items WHERE qty = ? AND label = ?', [7, 'y']),
        {
          label: 'y',
        },
      );
    });

    void test('batch commits every statement', async () => {
      const db = await withTable();
      await db.batch([
        { sql: 'INSERT INTO items (label, qty) VALUES (?, ?)', params: ['a', 1] },
        { sql: 'INSERT INTO items (label, qty) VALUES (?, ?)', params: ['b', null] },
        { sql: 'UPDATE items SET qty = 5 WHERE label = ?', params: ['a'] },
      ]);
      assert.deepEqual(await db.all('SELECT label, qty FROM items ORDER BY label'), [
        { label: 'a', qty: 5 },
        { label: 'b', qty: null },
      ]);
    });

    void test('an empty batch resolves and changes nothing', async () => {
      const db = await withTable();
      await db.batch([]);
      assert.deepEqual(await db.all('SELECT label FROM items'), []);
    });

    void test('batch rolls back everything when one statement fails', async () => {
      const db = await withTable();
      await db.run("INSERT INTO items (label, qty) VALUES ('kept', 0)");
      await assert.rejects(
        db.batch([
          { sql: "INSERT INTO items (label, qty) VALUES ('new', 1)" },
          { sql: "INSERT INTO items (label, qty) VALUES ('kept', 2)" }, // violates UNIQUE(label)
        ]),
      );
      assert.deepEqual(await db.all('SELECT label, qty FROM items ORDER BY label'), [
        { label: 'kept', qty: 0 },
      ]);
    });

    void test('a failing statement rejects the promise', async () => {
      const db = await withTable();
      await assert.rejects(db.run('SELECT * FROM no_such_table'));
      await assert.rejects(db.all('SELECT * FROM no_such_table'));
      await assert.rejects(db.get('SELECT * FROM no_such_table'));
    });
  });
}
