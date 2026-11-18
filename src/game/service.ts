// The generic game service: one saved game per profile per game id, over the Db port.
import type { z } from 'zod';
import type { Db } from '../db/index.ts';
import { type GameDefinition, type SavedGame, savedGameSchema } from './index.ts';
import { type GameKey, readGame, saveIfVersion, upsertGame } from './store.ts';

export type GameFailure = 'no-game' | 'illegal-move' | 'already-finished';

export type GameResult<State> =
  { ok: true; game: SavedGame<State> } | { ok: false; reason: GameFailure };

export interface GameService<State, Move, Options> {
  get(profileId: number): Promise<SavedGame<State> | undefined>;
  /** Starts a new game, replacing any existing one. */
  start(profileId: number, options: Options): Promise<SavedGame<State>>;
  /** Like start, but from a chosen state. Throws InvalidStartStateError unless the definition accepts it. */
  startWith(profileId: number, state: State): Promise<SavedGame<State>>;
  move(profileId: number, move: Move): Promise<GameResult<State>>;
  reset(profileId: number): Promise<GameResult<State>>;
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

const MAX_ATTEMPTS = 3;

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

/** Read, compute, compare-and-swap; re-read and retry if another writer got in first. */
async function mutate<State>(
  engine: Engine<State, unknown, unknown>,
  profileId: number,
  step: Step<State>,
): Promise<GameResult<State>> {
  const key = keyOf(engine, profileId);
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const current = await readGame(engine.db, key, engine.schema);
    if (current === undefined) return { ok: false, reason: 'no-game' };
    const now = engine.now().toISOString();
    const result = step(current, now);
    if (!result.ok) return result;
    if (await saveIfVersion(engine.db, key, current.version, result.game, now)) return result;
  }
  throw new Error(
    `game "${key.gameId}" of profile ${String(profileId)} kept changing; gave up after ${String(MAX_ATTEMPTS)} attempts`,
  );
}

/** Starts (or replaces) the profile's game with `state` as its initial state. */
async function startFrom<State>(
  engine: Engine<State, unknown, unknown>,
  profileId: number,
  state: State,
): Promise<SavedGame<State>> {
  const now = engine.now().toISOString();
  const finished = engine.definition.isFinished(state);
  const fresh = {
    state,
    initial: state,
    moves: 0,
    finished,
    startedAt: now,
    finishedAt: finished ? now : null,
  };
  const version = await upsertGame(engine.db, keyOf(engine, profileId), fresh);
  return { ...fresh, version };
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
    start: (profileId, startOptions) =>
      startFrom(engine, profileId, definition.start(startOptions, options.random)),
    async startWith(profileId, state) {
      const valid = definition.isValidStart?.(state) ?? !definition.isFinished(state);
      if (!valid) throw new InvalidStartStateError(definition.id);
      return startFrom(engine, profileId, state);
    },
    move: (profileId, move) => mutate(engine, profileId, moveStep(definition, move)),
    reset: (profileId) => mutate(engine, profileId, resetStep(definition)),
  };
}
