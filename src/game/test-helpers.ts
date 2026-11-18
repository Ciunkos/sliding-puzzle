import { fileURLToPath } from 'node:url';
import { createNodeSqliteDb, migrate, type Db } from '../db/server.ts';
import { isSolved, type Board } from '../puzzle/index.ts';
import type { ProfileLookup } from './server.ts';

export const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations', import.meta.url));
export const SOLVED: Board = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0];
/** SOLVED with tile 15 slid into the blank once: exactly one legal move (tile 15) solves it. */
export const NEAR_SOLVED: Board = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 0, 15];
export const EPOCH = '2026-01-01T00:00:00.000Z';

export async function openDb(): Promise<Db> {
  const db = createNodeSqliteDb(':memory:');
  await migrate(db, MIGRATIONS_DIR);
  return db;
}

export async function addProfile(db: Db, nickname: string): Promise<number> {
  const key = nickname.toLowerCase();
  await db.run('INSERT INTO profiles (nickname, nickname_key, created_at) VALUES (?, ?, ?)', [
    nickname,
    key,
    EPOCH,
  ]);
  const row = await db.get('SELECT id FROM profiles WHERE nickname_key = ?', [key]);
  if (typeof row?.id !== 'number') throw new Error(`profile ${nickname} was not inserted`);
  return row.id;
}

/** Writes a games row directly, bypassing the service, so tests can set up exact states. */
export async function insertGame(
  db: Db,
  profileId: number,
  board: Board,
  options: { moves?: number; version?: number; initial?: Board } = {},
): Promise<void> {
  const initial = options.initial ?? board;
  await db.run(
    'INSERT INTO games (profile_id, board, initial, moves, solved, version, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      profileId,
      JSON.stringify(board),
      JSON.stringify(initial),
      options.moves ?? 0,
      isSolved(board) ? 1 : 0,
      options.version ?? 1,
      EPOCH,
    ],
  );
}

/** Case-insensitive lookup over a fixed set of nicknames, like the real profile module. */
export function lookupOf(entries: Record<string, number>): ProfileLookup {
  const byKey = new Map(Object.entries(entries).map(([nick, id]) => [nick.toLowerCase(), id]));
  return {
    find(nickname: string) {
      const id = byKey.get(nickname.toLowerCase());
      return Promise.resolve(id === undefined ? undefined : { id });
    },
  };
}

export const ALL_TILES = Array.from({ length: 15 }, (_, i) => i + 1);
