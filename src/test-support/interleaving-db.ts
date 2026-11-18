// The real database with a concurrent writer: `then` runs right after the next batch commits, before
// the caller sees the batch's answer. This is the one interleaving a Worker can meet between a
// compare-and-swap batch and whatever the caller does next.
import type { Db } from '../db/index.ts';

export interface InterleavingDb extends Db {
  /** Runs `write` once, right after the next batch commits. */
  afterNextBatch(write: () => Promise<unknown>): void;
}

export function interleavingDb(db: Db): InterleavingDb {
  let pending: (() => Promise<unknown>) | undefined;
  return {
    run: (sql, params) => db.run(sql, params),
    all: (sql, params) => db.all(sql, params),
    get: (sql, params) => db.get(sql, params),
    async batch(statements) {
      const changes = await db.batch(statements);
      const write = pending;
      pending = undefined;
      await write?.();
      return changes;
    },
    afterNextBatch(write) {
      pending = write;
    },
  };
}
