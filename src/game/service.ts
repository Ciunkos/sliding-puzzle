// The generic game service: one saved game per profile per game id, over the Db port.
import type { z } from 'zod';
import type { Db } from '../db/index.ts';
import {
  type BestResult,
  type GameDefinition,
  type MoveContext,
  type SavedGame,
  savedGameSchema,
} from './index.ts';
import {
  bestResults,
  type GameKey,
  insertIfAbsent,
  readExistingGame,
  readGame,
  readStoredGame,
  type ResultRow,
  saveIfVersion,
  type StoredGame,
  upsertGame,
} from './store.ts';

/** Why a request that found a game changed nothing. */
export type GameFailure = 'stale' | 'illegal-move' | 'already-finished';

/**
 * The answer to a batch or a reset. `stale`: it was made on another version than the stored one (a
 * second tab, a game replaced meanwhile). Every failure but no-game carries the stored game: nothing
 * changed, and the server's game wins.
 */
export type GameResult<State> =
  | { ok: true; game: SavedGame<State> }
  | { ok: false; reason: 'no-game' }
  | { ok: false; reason: GameFailure; game: SavedGame<State> };

/** Moves the browser applied optimistically on the game at `baseVersion`, sent together. */
export interface MoveBatch<Move> {
  baseVersion: number;
  /** Made up by the browser; the same id again after the stored game moved on is a replay. */
  batchId: string;
  moves: readonly Move[];
  /** Active play time the browser measured; used only when the batch finishes the game. */
  elapsedMs?: number;
}

export interface Resumed<State> {
  game: SavedGame<State>;
  /** True when this call created the game, false when the profile already had one. */
  created: boolean;
}

export interface GameService<State, Move, Options> {
  get(profileId: number): Promise<SavedGame<State> | undefined>;
  /** The profile's game; atomically starts one from `options` if there is none. */
  resume(profileId: number, options: Options): Promise<Resumed<State>>;
  /** Starts a new game, replacing any existing one. */
  start(profileId: number, options: Options): Promise<SavedGame<State>>;
  /** Like start, but from a chosen state. Throws InvalidStartStateError unless the state matches
   * the state schema and the definition accepts it as a start. */
  startWith(profileId: number, state: State): Promise<SavedGame<State>>;
  /**
   * Applies all moves of `batch` atomically, or none. On another version than `baseVersion` it is
   * stale, unless the stored game's last batch is this very batch: then it is a replay of a batch
   * whose answer was lost, and the answer is the stored game.
   */
  applyMoves(profileId: number, batch: MoveBatch<Move>): Promise<GameResult<State>>;
  /** Resets the game at `baseVersion` back to its initial state, starting its clock again. */
  reset(profileId: number, baseVersion: number): Promise<GameResult<State>>;
  /** The profile's best results per variant: fewest moves, then shortest time; top 5 each. */
  results(profileId: number): Promise<BestResult[]>;
}

export interface GameServiceOptions {
  random: () => number;
  now: () => Date;
}

export class InvalidStartStateError extends Error {
  constructor(gameId: string) {
    super(`not an acceptable start state for game "${gameId}"`);
    this.name = 'InvalidStartStateError';
  }
}

/** How many best results of each variant are listed. */
const RESULTS_PER_VARIANT = 5;

type StepOutcome<State> =
  | { ok: true; game: SavedGame<State>; result?: ResultRow }
  | { ok: false; reason: 'illegal-move' | 'already-finished' };

type Step<State> = (current: SavedGame<State>, now: Date) => StepOutcome<State>;

/** `moves` applied in order; undefined when one is illegal or follows a move that finished the game. */
function applyAll<State, Move>(
  definition: GameDefinition<State, Move, unknown>,
  state: State,
  moves: readonly Move[],
  context: MoveContext,
): State | undefined {
  let current: State | undefined = state;
  for (const move of moves) {
    if (current === undefined || definition.isFinished(current)) return undefined;
    current = definition.apply(current, move, context);
  }
  return current;
}

/** The result of a game that `now` finished: the server's duration, the browser's clamped to it. */
function resultOf<State>(
  definition: GameDefinition<State, unknown, unknown>,
  game: SavedGame<State>,
  now: Date,
  elapsedMs: number | undefined,
): ResultRow {
  const durationMs = Math.max(0, now.getTime() - Date.parse(game.startedAt));
  return {
    variant: definition.variant?.(game.state) ?? 'default',
    moves: game.moves,
    durationMs,
    reportedMs: elapsedMs === undefined ? null : Math.min(elapsedMs, durationMs),
  };
}

/** The step of a batch: apply every move, count them, and record when the last one finishes the game. */
function batchStep<State, Move>(
  definition: GameDefinition<State, Move, unknown>,
  random: () => number,
  batch: Omit<MoveBatch<Move>, 'baseVersion' | 'batchId'>,
): Step<State> {
  return (current, now) => {
    if (current.finished) return { ok: false, reason: 'already-finished' };
    const state = applyAll(definition, current.state, batch.moves, { now, random });
    if (state === undefined) return { ok: false, reason: 'illegal-move' };
    const finished = definition.isFinished(state);
    const game = {
      ...current,
      state,
      moves: current.moves + batch.moves.length,
      finished,
      version: current.version + batch.moves.length,
      finishedAt: finished ? now.toISOString() : null,
    };
    if (!finished) return { ok: true, game };
    return { ok: true, game, result: resultOf(definition, game, now, batch.elapsedMs) };
  };
}

/**
 * The step of a reset: back to the initial state, no moves, and the clock starts again now. A
 * finished game is refused: replaying a known solution must not give a better result.
 */
function resetStep<State>(definition: GameDefinition<State, unknown, unknown>): Step<State> {
  return (current, now) => {
    if (current.finished) return { ok: false, reason: 'already-finished' };
    const finished = definition.isFinished(current.initial);
    const at = now.toISOString();
    const game = {
      ...current,
      state: current.initial,
      moves: 0,
      finished,
      version: current.version + 1,
      startedAt: at,
    };
    return { ok: true, game: { ...game, finishedAt: finished ? at : null } };
  };
}

/** Everything the service functions share: the database, the game, its row schema and the clock. */
interface Engine<State, Move, Options> {
  db: Db;
  definition: GameDefinition<State, Move, Options>;
  schema: z.ZodType<SavedGame<State>>;
  now: () => Date;
}

function keyOf(engine: Engine<unknown, unknown, unknown>, profileId: number): GameKey {
  return { profileId, gameId: engine.definition.id };
}

/** A write on the game at `baseVersion`; `batchId` null when it can never be a replay. */
interface Write<State> {
  baseVersion: number;
  batchId: string | null;
  step: Step<State>;
}

/** The answer to a write made on another version: a replay of the last batch, or stale. */
function notCurrent<State>(stored: StoredGame<State>, batchId: string | null): GameResult<State> {
  if (batchId !== null && stored.lastBatchId === batchId) return { ok: true, game: stored.game };
  return { ok: false, reason: 'stale', game: stored.game };
}

/**
 * Read, check the caller's version, compute, compare-and-swap. No retry: a request made on another
 * version is stale (or a replay), and the caller decides what to do with the current game. When
 * the swap loses to another writer, one more read answers stale with what is stored now: no retry
 * and no recursion, so a request can never loop.
 */
async function mutate<State>(
  engine: Engine<State, unknown, unknown>,
  profileId: number,
  write: Write<State>,
): Promise<GameResult<State>> {
  const key = keyOf(engine, profileId);
  const stored = await readStoredGame(engine.db, key, engine.schema);
  if (stored === undefined) return { ok: false, reason: 'no-game' };
  const current = stored.game;
  if (current.version !== write.baseVersion) return notCurrent(stored, write.batchId);
  const now = engine.now();
  const outcome = write.step(current, now);
  if (!outcome.ok) return { ...outcome, game: current };
  const swap = {
    expectedVersion: write.baseVersion,
    next: outcome.game,
    updatedAt: now.toISOString(),
    batchId: write.batchId,
    result: outcome.result,
  };
  if (await saveIfVersion(engine.db, key, swap)) return { ok: true, game: outcome.game };
  const latest = await readExistingGame(engine.db, key, engine.schema);
  return { ok: false, reason: 'stale', game: latest };
}

/** A game that starts at `state` now: no moves, finished only if `state` already is. */
function freshGame<State>(
  engine: Engine<State, unknown, unknown>,
  state: State,
): Omit<SavedGame<State>, 'version'> {
  const now = engine.now().toISOString();
  const finished = engine.definition.isFinished(state);
  return {
    state,
    initial: state,
    moves: 0,
    finished,
    startedAt: now,
    finishedAt: finished ? now : null,
  };
}

/** Starts (or replaces) the profile's game with `state` as its initial state. */
async function startFrom<State>(
  engine: Engine<State, unknown, unknown>,
  profileId: number,
  state: State,
): Promise<SavedGame<State>> {
  const fresh = freshGame(engine, state);
  const version = await upsertGame(engine.db, keyOf(engine, profileId), fresh);
  return { ...fresh, version };
}

/** The profile's game, inserted from `state` in the same statement if it had none. */
async function resumeFrom<State>(
  engine: Engine<State, unknown, unknown>,
  profileId: number,
  state: State,
): Promise<Resumed<State>> {
  const key = keyOf(engine, profileId);
  const created = await insertIfAbsent(engine.db, key, freshGame(engine, state));
  // The row exists now: this call inserted it, or it was there already (games are never deleted).
  return { game: await readExistingGame(engine.db, key, engine.schema), created };
}

/** Whether `state` is a valid state of the game and an acceptable start (see startWith). */
function isAcceptableStart<State>(
  definition: GameDefinition<State, unknown, unknown>,
  state: State,
) {
  if (!definition.stateSchema.safeParse(state).success) return false;
  return definition.isValidStart?.(state) ?? !definition.isFinished(state);
}

export function createGameService<State, Move, Options>(
  db: Db,
  definition: GameDefinition<State, Move, Options>,
  options: GameServiceOptions,
): GameService<State, Move, Options> {
  const schema = savedGameSchema(definition.stateSchema);
  const engine: Engine<State, Move, Options> = { db, definition, schema, now: options.now };
  const movesStep = (batch: Omit<MoveBatch<Move>, 'baseVersion' | 'batchId'>) =>
    batchStep(definition, options.random, batch);

  return {
    get: (profileId) => readGame(db, keyOf(engine, profileId), schema),
    resume: (profileId, startOptions) =>
      resumeFrom(engine, profileId, definition.start(startOptions, options.random)),
    start: (profileId, startOptions) =>
      startFrom(engine, profileId, definition.start(startOptions, options.random)),
    async startWith(profileId, state) {
      if (!isAcceptableStart(definition, state)) throw new InvalidStartStateError(definition.id);
      return startFrom(engine, profileId, state);
    },
    applyMoves: (profileId, { baseVersion, batchId, ...batch }) =>
      mutate(engine, profileId, { baseVersion, batchId, step: movesStep(batch) }),
    reset: (profileId, baseVersion) =>
      mutate(engine, profileId, { baseVersion, batchId: null, step: resetStep(definition) }),
    results: (profileId) => bestResults(db, keyOf(engine, profileId), RESULTS_PER_VARIANT),
  };
}
