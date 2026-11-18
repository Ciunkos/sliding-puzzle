// A real local Cloudflare D1 (see d1.ts) behind the Db port, with every repo migration applied: the
// D1 counterpart of openTestDb(). Call closeTestD1() from node:test's after().
import { fileURLToPath } from 'node:url';
import type { Db } from '../db/server.ts';
import { createD1Db, migrate } from '../db/server.ts';
import { openTestD1Binding } from './d1.ts';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations/', import.meta.url));

/** A fresh D1 database with all migrations from migrations/ applied. */
export async function openMigratedTestD1(): Promise<Db> {
  const db = createD1Db(await openTestD1Binding());
  await migrate(db, MIGRATIONS_DIR);
  return db;
}
