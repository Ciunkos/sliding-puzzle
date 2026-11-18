// The games table over the Db port. Rows are never trusted: every read is validated.
import { z } from 'zod';
import type { Db } from '../db/index.ts';
import type { BestResult, SavedGame } from './index.ts';

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
  last_batch_id: z.string().nullable(),
});

const startedRows = z.tuple([z.object({ version: z.number().int().min(1) })]);

/** A saved game together with the id of the last batch of moves applied to it (null: none). */
export interface StoredGame<State> {
  game: SavedGame<State>;
  lastBatchId: string | null;
}

function parseRow<State>(raw: unknown, schema: z.ZodType<SavedGame<State>>): StoredGame<State> {
  const row = storedRow.parse(raw);
  const state: unknown = JSON.parse(row.state);
  const initial: unknown = JSON.parse(row.initial);
  const game = schema.parse({
    state,
    initial,
    moves: row.moves,
    finished: row.finished === 1,
    version: row.version,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  });
  return { game, lastBatchId: row.last_batch_id };
}

function selectRow(db: Db, key: GameKey) {
  return db.get(
    `SELECT state, initial, moves, finished, version, started_at, finished_at, last_batch_id
       FROM games WHERE profile_id = ? AND game_id = ?`,
    [key.profileId, key.gameId],
  );
}

/** The stored game with its last batch id, or undefined when the profile has none. */
export async function readStoredGame<State>(
  db: Db,
  key: GameKey,
  schema: z.ZodType<SavedGame<State>>,
): Promise<StoredGame<State> | undefined> {
  const row = await selectRow(db, key);
  return row === undefined ? undefined : parseRow(row, schema);
}

export async function readGame<State>(
  db: Db,
  key: GameKey,
  schema: z.ZodType<SavedGame<State>>,
): Promise<SavedGame<State> | undefined> {
  return (await readStoredGame(db, key, schema))?.game;
}

/** A game that must exist; a missing row fails the row schema like any other bad row. */
export async function readExistingGame<State>(
  db: Db,
  key: GameKey,
  schema: z.ZodType<SavedGame<State>>,
): Promise<SavedGame<State>> {
  return parseRow(await selectRow(db, key), schema).game;
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
         finished_at = excluded.finished_at, updated_at = excluded.updated_at, last_batch_id = NULL
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

/** The result row a finishing move writes (see migrations/0005_results.sql). */
export type ResultRow = Omit<BestResult, 'finishedAt'>;

/** What a compare-and-swap writes: the next game, the batch that made it, and its result if it finished. */
export interface Swap {
  expectedVersion: number;
  next: SavedGame<unknown>;
  updatedAt: string;
  /** Null for a write that cannot be replayed: a single move or a reset. */
  batchId: string | null;
  result?: ResultRow;
}

function updateStatement(key: GameKey, swap: Swap) {
  const { next } = swap;
  return {
    sql: `UPDATE games SET state = ?, initial = ?, moves = ?, finished = ?, version = ?,
         started_at = ?, finished_at = ?, updated_at = ?, last_batch_id = ?
       WHERE profile_id = ? AND game_id = ? AND version = ?`,
    params: [
      JSON.stringify(next.state),
      JSON.stringify(next.initial),
      next.moves,
      next.finished ? 1 : 0,
      next.version,
      next.startedAt,
      next.finishedAt,
      swap.updatedAt,
      swap.batchId,
      key.profileId,
      key.gameId,
      swap.expectedVersion,
    ],
  };
}

/**
 * The result insert, guarded by the same version condition as the update and run before it in one
 * batch: both apply, or neither does.
 */
function resultStatement(key: GameKey, swap: Swap, result: ResultRow) {
  return {
    sql: `INSERT OR IGNORE INTO results
         (profile_id, game_id, version, variant, moves, duration_ms, reported_ms, finished_at)
       SELECT profile_id, game_id, ?, ?, ?, ?, ?, ?
         FROM games WHERE profile_id = ? AND game_id = ? AND version = ?`,
    params: [
      swap.next.version,
      result.variant,
      result.moves,
      result.durationMs,
      result.reportedMs,
      swap.next.finishedAt,
      key.profileId,
      key.gameId,
      swap.expectedVersion,
    ],
  };
}

/**
 * Compare-and-swap: writes `swap.next` only if the stored version is still `expectedVersion`.
 * A finishing write also inserts its result, guarded by the same version, in one atomic batch;
 * the update's own change count says whether this write won.
 */
export async function saveIfVersion(db: Db, key: GameKey, swap: Swap): Promise<boolean> {
  const update = updateStatement(key, swap);
  const statements =
    swap.result === undefined ? [update] : [resultStatement(key, swap, swap.result), update];
  const changes = await db.batch(statements);
  return (changes.at(-1)?.changes ?? 0) > 0;
}

const resultRows = z.array(
  z.object({
    variant: z.string(),
    moves: z.number().int(),
    duration_ms: z.number().int(),
    reported_ms: z.number().int().nullable(),
    finished_at: z.string(),
  }),
);

/**
 * The best `limit` results of each variant: fewest moves, then the shortest time (the reported
 * active time when there is one, else the server-observed duration), then the earliest.
 */
export async function bestResults(db: Db, key: GameKey, limit: number): Promise<BestResult[]> {
  const rows = await db.all(
    `SELECT variant, moves, duration_ms, reported_ms, finished_at FROM (
       SELECT *, ROW_NUMBER() OVER (
           PARTITION BY variant
           ORDER BY moves, COALESCE(reported_ms, duration_ms), finished_at, version
         ) AS place
         FROM results WHERE profile_id = ? AND game_id = ?
     ) WHERE place <= ? ORDER BY variant, place`,
    [key.profileId, key.gameId, limit],
  );
  return resultRows.parse(rows).map((row) => ({
    variant: row.variant,
    moves: row.moves,
    durationMs: row.duration_ms,
    reportedMs: row.reported_ms,
    finishedAt: row.finished_at,
  }));
}
