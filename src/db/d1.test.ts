import { DatabaseSync } from 'node:sqlite';
import { dbContract } from './contract.ts';
import { createD1Db } from './index.ts';
import type { D1Like, D1PreparedLike, SqlParam } from './index.ts';

/** Runs a synchronous body; anything it throws becomes a rejected promise, like a real binding. */
function attempt<T>(body: () => T): Promise<T> {
  return new Promise((resolve) => {
    resolve(body());
  });
}

/** Fake D1 binding backed by an in-memory node:sqlite database; batch() is transactional like D1. */
function fakeD1(sqlite: DatabaseSync): D1Like {
  function prepare(sql: string): D1PreparedLike {
    let bound: SqlParam[] = [];
    const stmt: D1PreparedLike = {
      bind(...values: SqlParam[]) {
        bound = values;
        return stmt;
      },
      run() {
        return attempt(() => {
          const result = sqlite.prepare(sql).run(...bound);
          return { meta: { changes: Number(result.changes) } };
        });
      },
      all() {
        return attempt(() => ({ results: sqlite.prepare(sql).all(...bound) }));
      },
      first() {
        return attempt(() => sqlite.prepare(sql).get(...bound) ?? null);
      },
    };
    return stmt;
  }

  return {
    prepare,
    async batch(stmts: D1PreparedLike[]) {
      sqlite.exec('BEGIN');
      try {
        const results: unknown[] = [];
        for (const stmt of stmts) {
          results.push(await stmt.run());
        }
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

dbContract('createD1Db (fake binding)', () => createD1Db(fakeD1(new DatabaseSync(':memory:'))));
