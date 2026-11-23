// The move queues and the play clock of one profile's game, kept in this browser so moves made
// offline survive a reload and a closed tab. Storage can be missing or throw, and its content is
// never trusted: every read is parsed, and what does not parse is removed.
//
// One record per queue, named after its own content: two tabs never write the same record unless
// they hold the very same queue, so one tab can never overwrite the moves of another. A tab
// replaces its own record as its queue changes; a tab that loads adopts the records it can.
// Beside the queues, the last game the server confirmed is kept, so the game opens offline even
// when nothing waits.
import { z } from 'zod';
import { nicknameKey } from '../profile/index.ts';
import { type GameClock, type PlayClock } from './clock.ts';
import {
  batchIdSchema,
  type GameDefinition,
  MAX_BATCH,
  type SavedGame,
  savedGameSchema,
} from './index.ts';
import { batchIdFor, reduce, type SyncState } from './sync.ts';

export type QueueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

/** What is kept: the queue without its notice, which only describes the screen. */
export type StoredQueue<State, Move> = Omit<SyncState<State, Move>, 'notice'>;

/** A stored queue and the key it is stored under. */
export interface QueueRecord<State, Move> {
  key: string;
  queue: StoredQueue<State, Move>;
}

type Definition<State, Move> = GameDefinition<State, Move, unknown>;

/** Every queue record of one profile's game starts with this. The engine knows no app name. */
export function queuePrefix(gameId: string, nickname: string): string {
  return `game-queue:${gameId}:${nicknameKey(nickname)}:`;
}

function clockKey(gameId: string, nickname: string): string {
  return `game-clock:${gameId}:${nicknameKey(nickname)}`;
}

function storedQueueSchema<State, Move>(definition: Definition<State, Move>) {
  return z
    .object({
      confirmed: savedGameSchema(definition.stateSchema),
      pending: z.array(definition.moveSchema).min(1),
      inFlight: z
        .object({ batchId: batchIdSchema, count: z.number().int().min(1).max(MAX_BATCH) })
        .optional(),
    })
    .refine((queue) => (queue.inFlight?.count ?? 0) <= queue.pending.length);
}

/** The keys in `storage` that start with `prefix`. */
function keysWith(storage: QueueStorage, prefix: string): string[] {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key?.startsWith(prefix) === true) keys.push(key);
  }
  return keys.sort();
}

/** The JSON stored under `key`; null when there is none or it is not JSON. */
function readJson(storage: QueueStorage, key: string): unknown {
  try {
    // A missing key reads as the text "null", which nothing stored here matches.
    return JSON.parse(String(storage.getItem(key)));
  } catch {
    return null;
  }
}

/** Every valid queue record of the profile's game, by key; records that are not valid are removed. */
export function loadQueues<State, Move>(
  definition: Definition<State, Move>,
  nickname: string,
  storage: QueueStorage,
): QueueRecord<State, Move>[] {
  const schema = storedQueueSchema(definition);
  try {
    return keysWith(storage, queuePrefix(definition.id, nickname)).flatMap((key) => {
      const parsed = schema.safeParse(readJson(storage, key));
      if (parsed.success) return [{ key, queue: parsed.data }];
      storage.removeItem(key);
      return [];
    });
  } catch {
    return [];
  }
}

/**
 * Keeps the queue of `state` in its own record, replacing `previousKey` (the record this tab
 * saved before), or forgets it when nothing is pending. Returns the record's key, if any. The new
 * record is written before the old one goes: when storage is full, the old one is kept (and its
 * key returned) rather than both lost.
 */
export function saveQueue<State, Move>(
  gameId: string,
  nickname: string,
  state: SyncState<State, Move>,
  storage: QueueStorage,
  previousKey?: string,
): string | undefined {
  const { confirmed, pending, inFlight } = state;
  const key =
    pending.length === 0
      ? undefined
      : queuePrefix(gameId, nickname) + batchIdFor(confirmed.version, [pending, inFlight ?? null]);
  try {
    if (key !== undefined) storage.setItem(key, JSON.stringify({ confirmed, pending, inFlight }));
    if (previousKey !== undefined && previousKey !== key) storage.removeItem(previousKey);
    return key;
  } catch {
    // Storage is a convenience: a failed write must not break the game.
    return previousKey;
  }
}

/** Removes `records` from storage: their moves now live in this tab's queue, or were dropped. */
export function forgetQueues(storage: QueueStorage, records: readonly { key: string }[]): void {
  try {
    for (const { key } of records) storage.removeItem(key);
  } catch {
    // Nothing to do: the records are ignored when they are read again.
  }
}

/** `state` with the moves of `queue` tapped after its own; true when every one of them applied. */
function rebase<State, Move>(
  definition: Definition<State, Move>,
  state: SyncState<State, Move>,
  queue: StoredQueue<State, Move>,
): { state: SyncState<State, Move>; whole: boolean } {
  const next = queue.pending.reduce(
    (current, move) => reduce(definition, current, { type: 'tap', move }),
    state,
  );
  return {
    state: next,
    whole: next.pending.length === state.pending.length + queue.pending.length,
  };
}

/** `base` joined by every record in `others` made on `version` with nothing on the wire. */
function join<State, Move>(
  definition: Definition<State, Move>,
  base: SyncState<State, Move>,
  others: readonly QueueRecord<State, Move>[],
  version: number,
): { state: SyncState<State, Move>; lost: boolean; joined: QueueRecord<State, Move>[] } {
  const joins = (record: QueueRecord<State, Move>) =>
    record.queue.inFlight === undefined && record.queue.confirmed.version === version;
  const joined = others.filter(joins);
  let state = base;
  let lost = joined.length < others.length;
  for (const record of joined) {
    const rebased = rebase(definition, state, record.queue);
    state = rebased.state;
    lost ||= !rebased.whole;
  }
  return { state, lost, joined };
}

/**
 * The state to resume with, given the server's game and the stored queues (all of them are
 * forgotten by the caller afterwards). A queue with a batch on the wire is kept as it is: the
 * retry tells whether the server already applied it (a replay is acknowledged) or the game moved on
 * (stale). Queues made on the server's version join it, in key order, as long as their moves still
 * apply. Any other queue was made on a game that changed elsewhere: it is dropped, and the player is
 * told.
 */
export function resumeQueues<State, Move>(
  definition: Definition<State, Move>,
  server: SavedGame<State>,
  records: readonly QueueRecord<State, Move>[],
): SyncState<State, Move> {
  const flight = records.find((record) => record.queue.inFlight !== undefined);
  const base = flight?.queue ?? { confirmed: server, pending: [] };
  const others = records.filter((record) => record !== flight);
  const { state, lost } = join(definition, base, others, server.version);
  return lost ? { ...state, notice: 'server-newer' } : state;
}

/**
 * What to show when the server cannot be reached on load: the newest stored queue (one with a
 * batch on the wire first), joined by the queues of other tabs on its version. `merged` are the
 * records now in the shown queue; the others wait in storage for the server.
 */
export function offlineQueue<State, Move>(
  definition: Definition<State, Move>,
  records: readonly QueueRecord<State, Move>[],
): { state: SyncState<State, Move>; merged: QueueRecord<State, Move>[] } | undefined {
  const newest = [...records].sort(
    (a, b) =>
      Number(b.queue.inFlight !== undefined) - Number(a.queue.inFlight !== undefined) ||
      b.queue.confirmed.version - a.queue.confirmed.version,
  )[0];
  if (newest === undefined) return undefined;
  const others = records.filter((record) => record !== newest);
  const version = newest.queue.confirmed.version;
  const { state, joined } = join(definition, newest.queue, others, version);
  return { state: { ...state, notice: 'offline' }, merged: [newest, ...joined] };
}

/**
 * The last game the server confirmed to a tab of this profile, so a reload without the server shows
 * it even when no move waits. One record per profile and game, unlike the queues: it holds no
 * moves, only a copy of the server's game, so a tab that writes it over another's loses nothing.
 * Tabs write it only with an answer they just got from the server.
 */
function confirmedKey(gameId: string, nickname: string): string {
  return `game-confirmed:${gameId}:${nicknameKey(nickname)}`;
}

export function saveConfirmed<State>(
  gameId: string,
  nickname: string,
  game: SavedGame<State>,
  storage: QueueStorage,
): void {
  try {
    storage.setItem(confirmedKey(gameId, nickname), JSON.stringify(game));
  } catch {
    // Storage is a convenience: a failed write must not break the game.
  }
}

/** The stored confirmed game, or undefined when there is none or it is not a game of `definition`. */
export function loadConfirmed<State, Move>(
  definition: Definition<State, Move>,
  nickname: string,
  storage: QueueStorage,
): SavedGame<State> | undefined {
  const stored = readJson(storage, confirmedKey(definition.id, nickname));
  const parsed = savedGameSchema(definition.stateSchema).safeParse(stored);
  return parsed.success ? parsed.data : undefined;
}

/** What to show without the server when no queue is stored: the confirmed game, nothing pending. */
export function offlineConfirmed<State, Move>(
  definition: Definition<State, Move>,
  nickname: string,
  storage: QueueStorage,
): { state: SyncState<State, Move>; merged: QueueRecord<State, Move>[] } | undefined {
  const confirmed = loadConfirmed(definition, nickname, storage);
  if (confirmed === undefined) return undefined;
  return { state: { confirmed, pending: [], notice: 'offline' }, merged: [] };
}

const clockSchema = z.object({
  startedAt: z.string(),
  clock: z.object({
    banked: z.number().min(0),
    // JSON leaves out an undefined `since`.
    since: z.number().optional(),
    started: z.boolean(),
    stopped: z.boolean(),
    visible: z.boolean(),
    lastAt: z.number(),
  }),
});

/** The stored play clock of the profile's game, or undefined when there is none or it is not valid. */
export function loadClock(
  gameId: string,
  nickname: string,
  storage: QueueStorage,
): GameClock | undefined {
  const parsed = clockSchema.safeParse(readJson(storage, clockKey(gameId, nickname)));
  if (!parsed.success) return undefined;
  const { startedAt, clock } = parsed.data;
  const restored: PlayClock = { ...clock, since: clock.since };
  return { startedAt, clock: restored };
}

export function saveClock(
  gameId: string,
  nickname: string,
  clock: GameClock,
  storage: QueueStorage,
): void {
  try {
    storage.setItem(clockKey(gameId, nickname), JSON.stringify(clock));
  } catch {
    // Storage is a convenience: a failed write must not break the game.
  }
}
