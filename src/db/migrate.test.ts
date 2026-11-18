import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import {
  addMigration,
  removeMigrationDirs,
  writeMigrations,
} from '../test-support/migration-files.ts';
import { createNodeSqliteDb, migrate } from './server.ts';

after(removeMigrationDirs);

describe('migrate', () => {
  test('applies .sql files in filename order and returns their names', async () => {
    // Given an insert that sorts after the table it needs, and a file that is not SQL
    const dir = await writeMigrations({
      '002_insert.sql': "INSERT INTO t (v) VALUES ('first');",
      '001_create.sql': 'CREATE TABLE t (v TEXT);',
      'notes.txt': 'not a migration',
    });
    const db = createNodeSqliteDb(':memory:');

    // When the migrations run
    const result = await migrate(db, dir);

    // Then both SQL files ran, create first
    assert.deepEqual(result, { applied: ['001_create.sql', '002_insert.sql'] });
    assert.deepEqual(await db.all('SELECT v FROM t'), [{ v: 'first' }]);
  });

  test('a second run applies nothing and repeats no statement', async () => {
    // Given migrations that create a table and insert one row, already applied
    const dir = await writeMigrations({
      '001_create.sql': 'CREATE TABLE t (v TEXT);',
      '002_insert.sql': "INSERT INTO t (v) VALUES ('once');",
    });
    const db = createNodeSqliteDb(':memory:');
    await migrate(db, dir);

    // When they run again
    const result = await migrate(db, dir);

    // Then nothing was applied and the row is still there only once
    assert.deepEqual(result, { applied: [] });
    assert.deepEqual(await db.all('SELECT v FROM t'), [{ v: 'once' }]);
  });

  test('a file added after a run is applied alone on the next run', async () => {
    // Given one applied migration and a new file added later
    const dir = await writeMigrations({ '001_create.sql': 'CREATE TABLE t (v TEXT);' });
    const db = createNodeSqliteDb(':memory:');
    await migrate(db, dir);
    await addMigration(dir, '002_more.sql', 'ALTER TABLE t ADD COLUMN w TEXT;');

    // When the migrations run again
    const result = await migrate(db, dir);

    // Then only the new file is applied and its column exists
    assert.deepEqual(result, { applied: ['002_more.sql'] });
    assert.deepEqual(await db.run("INSERT INTO t (v, w) VALUES ('a', 'b')"), { changes: 1 });
  });

  test('a multi-statement file runs every statement', async () => {
    // Given one file with a comment, two tables and a seed row
    const dir = await writeMigrations({
      '001_schema.sql': `-- two tables and a seed row
CREATE TABLE a (id INTEGER PRIMARY KEY);
CREATE TABLE b (id INTEGER PRIMARY KEY, a_id INTEGER REFERENCES a(id));
INSERT INTO a (id) VALUES (1);
`,
    });
    const db = createNodeSqliteDb(':memory:');

    // When it runs
    await migrate(db, dir);

    // Then the seed row exists and the second table accepts a row pointing at it
    assert.deepEqual(await db.all('SELECT id FROM a'), [{ id: 1 }]);
    assert.deepEqual(await db.run('INSERT INTO b (a_id) VALUES (1)'), { changes: 1 });
  });

  test('a failing file rejects naming it, keeps earlier files and nothing of itself', async () => {
    // Given a good file, then a file whose second statement fails
    const dir = await writeMigrations({
      '001_good.sql': 'CREATE TABLE good (id INTEGER);',
      '002_bad.sql': `CREATE TABLE half_done (id INTEGER);
INSERT INTO no_such_table VALUES (1);
`,
    });
    const db = createNodeSqliteDb(':memory:');

    // When the migrations run, then the error names the bad file
    await assert.rejects(migrate(db, dir), /002_bad\.sql/);

    // And the good table exists while the bad file's first table does not
    assert.deepEqual(await db.run('INSERT INTO good (id) VALUES (1)'), { changes: 1 });
    await assert.rejects(db.run('INSERT INTO half_done (id) VALUES (1)'));
  });

  test('a semicolon at a line end inside a string literal breaks the file (known limitation)', async () => {
    // Given a string value that holds a semicolon followed by a newline
    const dir = await writeMigrations({
      '001_text.sql': `CREATE TABLE t (v TEXT);
INSERT INTO t (v) VALUES ('a;
b');
`,
    });
    const db = createNodeSqliteDb(':memory:');

    // When it runs, then the statement is split there and the file is rejected
    await assert.rejects(migrate(db, dir), /001_text\.sql/);
  });
});
