// The real database for tests: in-memory SQLite with every repo migration applied. No fakes.
import { fileURLToPath } from 'node:url';
import type { Db } from '../db/server.ts';
import { createNodeSqliteDb, migrate } from '../db/server.ts';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations/', import.meta.url));

/** A fresh, independent in-memory database with all migrations from migrations/ applied. */
export async function openTestDb(): Promise<Db> {
  const db = createNodeSqliteDb(':memory:');
  await migrate(db, MIGRATIONS_DIR);
  return db;
}

/** A fixed instant for deterministic clocks. */
export const FIXED_NOW = new Date('2026-01-01T00:00:00.000Z');

/** A clock that always returns FIXED_NOW. */
export const fixedNow = (): Date => FIXED_NOW;
