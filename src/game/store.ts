// The games table over the Db port. Rows are never trusted: every read is validated.
import { z } from 'zod';
import type { Db } from '../db/index.ts';
import type { SavedGame } from './index.ts';

/** Which saved game: one per profile per game id. */
export interface GameKey {
  profileId: number;
  gameId: string;
}

/** Raw row shape. The JSON columns and the 0/1 flag are decoded in parseRow. */
const storedRow = z.object({
  state: z.string(),
  initial: z.string(),
  moves: z.number().int(),
  finished: z.union([z.literal(0), z.literal(1)]),
  version: z.number().int(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
});

const startedRows = z.tuple([z.object({ version: z.number().int().min(1) })]);

function parseRow<State>(raw: unknown, schema: z.ZodType<SavedGame<State>>): SavedGame<State> {
  const row = storedRow.parse(raw);
  const state: unknown = JSON.parse(row.state);
  const initial: unknown = JSON.parse(row.initial);
  return schema.parse({
    state,
    initial,
    moves: row.moves,
    finished: row.finished === 1,
    version: row.version,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  });
}

function selectRow(db: Db, key: GameKey) {
  return db.get(
    `SELECT state, initial, moves, finished, version, started_at, finished_at
       FROM games WHERE profile_id = ? AND game_id = ?`,
    [key.profileId, key.gameId],
  );
}

export async function readGame<State>(
  db: Db,
  key: GameKey,
  schema: z.ZodType<SavedGame<State>>,
): Promise<SavedGame<State> | undefined> {
  const row = await selectRow(db, key);
  return row === undefined ? undefined : parseRow(row, schema);
}

/** A game that must exist; a missing row fails the row schema like any other bad row. */
export async function readExistingGame<State>(
  db: Db,
  key: GameKey,
  schema: z.ZodType<SavedGame<State>>,
): Promise<SavedGame<State>> {
  return parseRow(await selectRow(db, key), schema);
}

type FreshGame = Omit<SavedGame<unknown>, 'version'>;

const INSERT_COLUMNS = `INSERT INTO games (profile_id, game_id, state, initial, moves, finished, version, started_at, finished_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`;

function insertParams(key: GameKey, game: FreshGame) {
  return [
    key.profileId,
    key.gameId,
    JSON.stringify(game.state),
    JSON.stringify(game.initial),
    game.moves,
    game.finished ? 1 : 0,
    game.startedAt,
    game.finishedAt,
    game.startedAt,
  ];
}

/**
 * Inserts the game or replaces the existing one. The version keeps growing across replacements, so
 * a move that read the old game can never pass its compare-and-swap against the new one.
 * Returns the stored version.
 */
export async function upsertGame(db: Db, key: GameKey, game: FreshGame): Promise<number> {
  const rows = await db.all(
    `${INSERT_COLUMNS}
       ON CONFLICT(profile_id, game_id) DO UPDATE SET
         state = excluded.state, initial = excluded.initial, moves = excluded.moves,
         finished = excluded.finished, version = games.version + 1, started_at = excluded.started_at,
         finished_at = excluded.finished_at, updated_at = excluded.updated_at
       RETURNING version`,
    insertParams(key, game),
  );
  return startedRows.parse(rows)[0].version;
}

/** Inserts the game at version 1 unless the profile already has one. True when it was inserted. */
export async function insertIfAbsent(db: Db, key: GameKey, game: FreshGame): Promise<boolean> {
  const { changes } = await db.run(
    `${INSERT_COLUMNS}
       ON CONFLICT(profile_id, game_id) DO NOTHING`,
    insertParams(key, game),
  );
  return changes > 0;
}

/** Compare-and-swap: writes `next` only if the stored version is still `expectedVersion`. */
export async function saveIfVersion(
  db: Db,
  key: GameKey,
  expectedVersion: number,
  next: SavedGame<unknown>,
  updatedAt: string,
): Promise<boolean> {
  const { changes } = await db.run(
    `UPDATE games SET state = ?, initial = ?, moves = ?, finished = ?, version = ?,
         started_at = ?, finished_at = ?, updated_at = ?
       WHERE profile_id = ? AND game_id = ? AND version = ?`,
    [
      JSON.stringify(next.state),
      JSON.stringify(next.initial),
      next.moves,
      next.finished ? 1 : 0,
      next.version,
      next.startedAt,
      next.finishedAt,
      updatedAt,
      key.profileId,
      key.gameId,
      expectedVersion,
    ],
  );
  return changes > 0;
}
