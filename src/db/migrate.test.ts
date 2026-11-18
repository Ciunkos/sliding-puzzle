import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { createNodeSqliteDb, migrate } from './server.ts';

const dirs: string[] = [];

async function makeMigrationsDir(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'db-migrate-test-'));
  dirs.push(dir);
  for (const [name, sql] of Object.entries(files)) {
    await writeFile(join(dir, name), sql);
  }
  return dir;
}

after(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('migrate', () => {
  test('applies files in filename order and returns their names', async () => {
    const dir = await makeMigrationsDir({
      '002_insert.sql': "INSERT INTO t (v) VALUES ('first');",
      '001_create.sql': 'CREATE TABLE t (v TEXT);',
      'notes.txt': 'not a migration',
    });
    const db = createNodeSqliteDb(':memory:');
    const result = await migrate(db, dir);
    assert.deepEqual(result, { applied: ['001_create.sql', '002_insert.sql'] });
    assert.deepEqual(await db.all('SELECT v FROM t'), [{ v: 'first' }]);
  });

  test('a second run applies nothing', async () => {
    const dir = await makeMigrationsDir({ '001_create.sql': 'CREATE TABLE t (v TEXT);' });
    const db = createNodeSqliteDb(':memory:');
    await migrate(db, dir);
    assert.deepEqual(await migrate(db, dir), { applied: [] });
    assert.deepEqual(await db.all('SELECT name FROM _migrations'), [{ name: '001_create.sql' }]);
  });

  test('picks up only the new files on a later run', async () => {
    const dir = await makeMigrationsDir({ '001_create.sql': 'CREATE TABLE t (v TEXT);' });
    const db = createNodeSqliteDb(':memory:');
    await migrate(db, dir);
    await writeFile(join(dir, '002_more.sql'), 'ALTER TABLE t ADD COLUMN w TEXT;');
    assert.deepEqual(await migrate(db, dir), { applied: ['002_more.sql'] });
  });

  test('multi-statement files run all statements', async () => {
    const dir = await makeMigrationsDir({
      '001_schema.sql': [
        '-- two tables and a seed row',
        'CREATE TABLE a (id INTEGER PRIMARY KEY);',
        'CREATE TABLE b (id INTEGER PRIMARY KEY, a_id INTEGER REFERENCES a(id));',
        'INSERT INTO a (id) VALUES (1);',
        '',
      ].join('\n'),
    });
    const db = createNodeSqliteDb(':memory:');
    await migrate(db, dir);
    assert.deepEqual(await db.all('SELECT id FROM a'), [{ id: 1 }]);
    assert.deepEqual(await db.all('SELECT id FROM b'), []);
  });

  test('a bad migration throws naming the file, keeps earlier ones, and rolls back itself', async () => {
    const dir = await makeMigrationsDir({
      '001_good.sql': 'CREATE TABLE good (id INTEGER);',
      '002_bad.sql': [
        'CREATE TABLE half_done (id INTEGER);',
        'INSERT INTO no_such_table VALUES (1);',
        '',
      ].join('\n'),
      '003_never.sql': 'CREATE TABLE never (id INTEGER);',
    });
    const db = createNodeSqliteDb(':memory:');

    await assert.rejects(migrate(db, dir), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /002_bad\.sql/);
      return true;
    });

    assert.deepEqual(await db.all('SELECT name FROM _migrations'), [{ name: '001_good.sql' }]);
    assert.deepEqual(
      await db.all(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('good', 'half_done', 'never') ORDER BY name",
      ),
      [{ name: 'good' }],
    );
  });
});
