import { DatabaseSync } from 'node:sqlite';
import type { Db, Row, SqlParam, Statement } from './index.ts';

/** Runs a synchronous body; anything it throws becomes a rejected promise, never a sync throw. */
function attempt<T>(body: () => T): Promise<T> {
  return new Promise((resolve) => {
    resolve(body());
  });
}

/** node:sqlite returns rows with a null prototype; copy them so deepEqual and JSON behave. */
function plain(row: Record<string, unknown>): Row {
  return { ...row };
}

function open(path: string): DatabaseSync {
  const sqlite = new DatabaseSync(path);
  sqlite.exec('PRAGMA foreign_keys = ON');
  if (path !== ':memory:') {
    sqlite.exec('PRAGMA journal_mode = WAL');
  }
  return sqlite;
}

/** Runs every statement in one transaction. node:sqlite is synchronous, so nothing can interleave. */
function runBatch(sqlite: DatabaseSync, statements: readonly Statement[]): void {
  sqlite.exec('BEGIN');
  try {
    for (const statement of statements) {
      sqlite.prepare(statement.sql).run(...(statement.params ?? []));
    }
    sqlite.exec('COMMIT');
  } catch (error) {
    // SQLite may already have ended the transaction on some errors (e.g. SQLITE_FULL).
    if (sqlite.isTransaction) {
      sqlite.exec('ROLLBACK');
    }
    throw error;
  }
}

export function createNodeSqliteDb(path: string): Db {
  const sqlite = open(path);

  return {
    run(sql: string, params: readonly SqlParam[] = []) {
      return attempt(() => ({ changes: Number(sqlite.prepare(sql).run(...params).changes) }));
    },
    all(sql: string, params: readonly SqlParam[] = []) {
      return attempt(() =>
        sqlite
          .prepare(sql)
          .all(...params)
          .map(plain),
      );
    },
    get(sql: string, params: readonly SqlParam[] = []) {
      return attempt(() => {
        const row = sqlite.prepare(sql).get(...params);
        return row === undefined ? undefined : plain(row);
      });
    },
    batch(statements: readonly Statement[]) {
      return attempt(() => {
        runBatch(sqlite, statements);
      });
    },
  };
}
