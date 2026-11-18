import { Hono } from 'hono';
import { z } from 'zod';
import type { Db } from '../db/index.ts';
import { applyMove, isSolved, shuffle, type Rng } from '../puzzle/index.ts';
import { gameStateSchema, moveRequestSchema, type GameState } from './index.ts';

export * from './index.ts';

/** What this module needs from the profile module: resolve a nickname to an id. */
export interface ProfileLookup {
  find(nickname: string): Promise<{ id: number } | undefined>;
}

export type GameResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: 'no-game' | 'illegal-move' | 'already-solved' };

type FailureReason = Extract<GameResult, { ok: false }>['reason'];

export interface GameService {
  get(profileId: number): Promise<GameState | undefined>;
  /** Creates a new shuffled game, replacing any existing one. */
  start(profileId: number): Promise<GameState>;
  move(profileId: number, tile: number): Promise<GameResult>;
  reset(profileId: number): Promise<GameResult>;
}

export interface GameServiceOptions {
  random?: Rng;
  now?: () => Date;
}

const MAX_ATTEMPTS = 3;

const SELECT_GAME = 'SELECT board, initial, moves, solved, version FROM games WHERE profile_id = ?';

/** Raw row shape. The JSON columns and the 0/1 flag are decoded and validated in parseStoredGame. */
const storedRow = z.object({
  board: z.string(),
  initial: z.string(),
  moves: z.number().int(),
  solved: z.union([z.literal(0), z.literal(1)]),
  version: z.number().int(),
});

/** Never trust a stored row: decode it and validate it with the same schema as the API. */
function parseStoredGame(raw: unknown): GameState {
  const row = storedRow.parse(raw);
  const board: unknown = JSON.parse(row.board);
  const initial: unknown = JSON.parse(row.initial);
  return gameStateSchema.parse({
    board,
    initial,
    moves: row.moves,
    solved: row.solved === 1,
    version: row.version,
  });
}

const startedRow = z.object({ version: z.number().int().min(1) });

async function readGame(db: Db, profileId: number): Promise<GameState | undefined> {
  const row = await db.get(SELECT_GAME, [profileId]);
  return row === undefined ? undefined : parseStoredGame(row);
}

/** Compare-and-swap: writes only if the stored version is still the one we read. */
async function saveIfVersion(
  db: Db,
  profileId: number,
  expectedVersion: number,
  next: GameState,
  updatedAt: string,
): Promise<boolean> {
  const { changes } = await db.run(
    `UPDATE games SET board = ?, initial = ?, moves = ?, solved = ?, version = ?, updated_at = ?
     WHERE profile_id = ? AND version = ?`,
    [
      JSON.stringify(next.board),
      JSON.stringify(next.initial),
      next.moves,
      next.solved ? 1 : 0,
      next.version,
      updatedAt,
      profileId,
      expectedVersion,
    ],
  );
  return changes > 0;
}

export function createGameService(db: Db, options: GameServiceOptions = {}): GameService {
  const random = options.random ?? Math.random;
  const now = options.now ?? (() => new Date());

  /** Read, compute, compare-and-swap; re-read and retry if another writer got in first. */
  async function mutate(
    profileId: number,
    step: (current: GameState) => GameResult,
  ): Promise<GameResult> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const current = await readGame(db, profileId);
      if (current === undefined) return { ok: false, reason: 'no-game' };
      const result = step(current);
      if (!result.ok) return result;
      if (await saveIfVersion(db, profileId, current.version, result.state, now().toISOString())) {
        return result;
      }
    }
    throw new Error(
      `game of profile ${String(profileId)} kept changing; gave up after ${String(MAX_ATTEMPTS)} attempts`,
    );
  }

  return {
    async get(profileId) {
      return readGame(db, profileId);
    },

    async start(profileId) {
      const board = shuffle(random);
      // Version keeps growing across replacements, so a move that read the old game can never
      // pass its compare-and-swap against the new one. RETURNING gives the stored version.
      const rows = await db.all(
        `INSERT INTO games (profile_id, board, initial, moves, solved, version, updated_at)
         VALUES (?, ?, ?, 0, 0, 1, ?)
         ON CONFLICT(profile_id) DO UPDATE SET
           board = excluded.board, initial = excluded.initial, moves = 0, solved = 0,
           version = games.version + 1, updated_at = excluded.updated_at
         RETURNING version`,
        [profileId, JSON.stringify(board), JSON.stringify(board), now().toISOString()],
      );
      const [row] = z.tuple([startedRow]).parse(rows);
      return { board, initial: board, moves: 0, solved: false, version: row.version };
    },

    async move(profileId, tile) {
      return mutate(profileId, (current) => {
        if (current.solved) return { ok: false, reason: 'already-solved' };
        const board = applyMove(current.board, tile);
        if (board === undefined) return { ok: false, reason: 'illegal-move' };
        return {
          ok: true,
          state: {
            board,
            initial: current.initial,
            moves: current.moves + 1,
            solved: isSolved(board),
            version: current.version + 1,
          },
        };
      });
    },

    async reset(profileId) {
      return mutate(profileId, (current) => ({
        ok: true,
        state: {
          board: current.initial,
          initial: current.initial,
          moves: 0,
          solved: isSolved(current.initial),
          version: current.version + 1,
        },
      }));
    },
  };
}

function failureResponse(reason: FailureReason): { status: 404 | 409; error: string } {
  switch (reason) {
    case 'no-game':
      return { status: 404, error: 'no active game' };
    case 'illegal-move':
      return { status: 409, error: 'illegal move' };
    case 'already-solved':
      return { status: 409, error: 'game already solved' };
  }
}

const BASE = '/api/profiles/:nickname/game';

export function gameRoutes(service: GameService, profiles: ProfileLookup): Hono {
  const app = new Hono();

  async function profileIdOf(nickname: string): Promise<number | undefined> {
    return (await profiles.find(nickname))?.id;
  }

  app.get(BASE, async (c) => {
    const profileId = await profileIdOf(c.req.param('nickname'));
    if (profileId === undefined) return c.json({ error: 'profile not found' }, 404);
    const state = await service.get(profileId);
    if (state === undefined) return c.json({ error: 'no active game' }, 404);
    return c.json(state, 200);
  });

  app.post(BASE, async (c) => {
    const profileId = await profileIdOf(c.req.param('nickname'));
    if (profileId === undefined) return c.json({ error: 'profile not found' }, 404);
    return c.json(await service.start(profileId), 201);
  });

  app.post(`${BASE}/move`, async (c) => {
    const profileId = await profileIdOf(c.req.param('nickname'));
    if (profileId === undefined) return c.json({ error: 'profile not found' }, 404);

    const raw: unknown = await c.req.json<unknown>().catch(() => undefined);
    const body = moveRequestSchema.safeParse(raw);
    if (!body.success) return c.json({ error: 'invalid move request' }, 400);

    const result = await service.move(profileId, body.data.tile);
    if (result.ok) return c.json(result.state, 200);
    const failure = failureResponse(result.reason);
    return c.json({ error: failure.error }, failure.status);
  });

  app.post(`${BASE}/reset`, async (c) => {
    const profileId = await profileIdOf(c.req.param('nickname'));
    if (profileId === undefined) return c.json({ error: 'profile not found' }, 404);
    const result = await service.reset(profileId);
    if (result.ok) return c.json(result.state, 200);
    const failure = failureResponse(result.reason);
    return c.json({ error: failure.error }, failure.status);
  });

  return app;
}
