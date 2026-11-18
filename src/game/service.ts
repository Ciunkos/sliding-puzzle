// The generic game service: one saved game per profile per game id, over the Db port.
import type { z } from 'zod';
import type { Db } from '../db/index.ts';
import { type GameDefinition, type SavedGame, savedGameSchema } from './index.ts';
import {
  type GameKey,
  insertIfAbsent,
  readExistingGame,
  readGame,
  saveIfVersion,
  upsertGame,
} from './store.ts';

export type GameFailure = 'no-game' | 'illegal-move' | 'already-finished';

/**
 * `stale`: the request was made on another version than the stored one (a duplicate request, a
 * second tab, a game replaced meanwhile). Nothing changed; `game` is the stored game to adopt.
 */
export type GameResult<State> =
  | { ok: true; game: SavedGame<State> }
  | { ok: false; reason: GameFailure }
  | { ok: false; reason: 'stale'; game: SavedGame<State> };

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
  /** Applies `move` to the game at `baseVersion`, the version the caller made it on. */
  move(profileId: number, move: Move, baseVersion: number): Promise<GameResult<State>>;
  /** Resets the game at `baseVersion` back to its initial state. */
  reset(profileId: number, baseVersion: number): Promise<GameResult<State>>;
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

type Step<State> = (current: SavedGame<State>, now: string) => GameResult<State>;

/** The step of a move: apply it, count it, and record when it finishes the game. */
function moveStep<State, Move>(
  definition: GameDefinition<State, Move, unknown>,
  move: Move,
): Step<State> {
  return (current, now) => {
    if (current.finished) return { ok: false, reason: 'already-finished' };
    const state = definition.apply(current.state, move);
    if (state === undefined) return { ok: false, reason: 'illegal-move' };
    const finished = definition.isFinished(state);
    const game = {
      ...current,
      state,
      moves: current.moves + 1,
      finished,
      version: current.version + 1,
    };
    return { ok: true, game: { ...game, finishedAt: finished ? now : null } };
  };
}

/** The step of a reset: back to the initial state, no moves. */
function resetStep<State>(definition: GameDefinition<State, unknown, unknown>): Step<State> {
  return (current, now) => {
    const finished = definition.isFinished(current.initial);
    const game = {
      ...current,
      state: current.initial,
      moves: 0,
      finished,
      version: current.version + 1,
    };
    return { ok: true, game: { ...game, finishedAt: finished ? now : null } };
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

/**
 * Read, check the caller's version, compute, compare-and-swap. No retry: a request made on another
 * version is stale, and the caller decides what to do with the current game. When the swap loses to
 * another writer, running again reads the newer game and answers stale: versions only grow, so the
 * stored version can never be `baseVersion` again.
 */
async function mutate<State>(
  engine: Engine<State, unknown, unknown>,
  profileId: number,
  baseVersion: number,
  step: Step<State>,
): Promise<GameResult<State>> {
  const key = keyOf(engine, profileId);
  const current = await readGame(engine.db, key, engine.schema);
  if (current === undefined) return { ok: false, reason: 'no-game' };
  if (current.version !== baseVersion) return { ok: false, reason: 'stale', game: current };
  const now = engine.now().toISOString();
  const result = step(current, now);
  if (!result.ok) return result;
  if (await saveIfVersion(engine.db, key, baseVersion, result.game, now)) return result;
  // Another writer got in between the read and the write: answer with what is stored now.
  // One read, no retry and no recursion, so a request can never loop.
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
    move: (profileId, move, baseVersion) =>
      mutate(engine, profileId, baseVersion, moveStep(definition, move)),
    reset: (profileId, baseVersion) =>
      mutate(engine, profileId, baseVersion, resetStep(definition)),
  };
}
