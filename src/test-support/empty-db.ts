// A real database with no tables: in-memory SQLite without migrations. Every query on it fails,
// which is how a test causes a genuine internal error without faking any of our modules.
import type { Db } from '../db/server.ts';
import { createNodeSqliteDb } from '../db/server.ts';

/** A fresh in-memory database on which no migration was applied. */
export function openEmptyDb(): Db {
  return createNodeSqliteDb(':memory:');
}
