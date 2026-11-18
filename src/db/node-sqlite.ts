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

export function createNodeSqliteDb(path: string): Db {
  const sqlite = new DatabaseSync(path);
  sqlite.exec('PRAGMA foreign_keys = ON');
  if (path !== ':memory:') {
    sqlite.exec('PRAGMA journal_mode = WAL');
  }

  function bindAll(statement: Statement): void {
    sqlite.prepare(statement.sql).run(...(statement.params ?? []));
  }

  return {
    run(sql: string, params: readonly SqlParam[] = []) {
      return attempt(() => {
        const result = sqlite.prepare(sql).run(...params);
        return { changes: Number(result.changes) };
      });
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
      // node:sqlite is synchronous, so nothing else can interleave with this transaction.
      return attempt(() => {
        sqlite.exec('BEGIN');
        try {
          for (const statement of statements) {
            bindAll(statement);
          }
          sqlite.exec('COMMIT');
        } catch (error) {
          // SQLite may already have ended the transaction on some errors (e.g. SQLITE_FULL).
          if (sqlite.isTransaction) {
            sqlite.exec('ROLLBACK');
          }
          throw error;
        }
      });
    },
  };
}
