// The move queue of one profile's game, kept in this browser so moves made offline survive a
// reload. Storage can be missing or throw, and its content is never trusted: every read is parsed.
import { z } from 'zod';
import { nicknameKey } from '../profile/index.ts';
import { type GameDefinition, MAX_BATCH, type SavedGame, savedGameSchema } from './index.ts';
import type { SyncState } from './sync.ts';

export type QueueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** What is kept: the queue without its notice, which only describes the screen. */
export type StoredQueue<State, Move> = Omit<SyncState<State, Move>, 'notice'>;

export function queueKey(gameId: string, nickname: string): string {
  return `sliding-puzzle:queue:${gameId}:${nicknameKey(nickname)}`;
}

function storedQueueSchema<State, Move>(definition: GameDefinition<State, Move, unknown>) {
  return z
    .object({
      confirmed: savedGameSchema(definition.stateSchema),
      pending: z.array(definition.moveSchema).min(1),
      inFlight: z
        .object({ batchId: z.string(), count: z.number().int().min(1).max(MAX_BATCH) })
        .optional(),
    })
    .refine((queue) => (queue.inFlight?.count ?? 0) <= queue.pending.length);
}

/** The stored queue, or undefined when there is none, it is not valid, or storage fails. */
export function loadQueue<State, Move>(
  definition: GameDefinition<State, Move, unknown>,
  nickname: string,
  storage: QueueStorage,
): StoredQueue<State, Move> | undefined {
  const parsed = storedQueueSchema(definition).safeParse(
    readJson(storage, queueKey(definition.id, nickname)),
  );
  return parsed.success ? parsed.data : undefined;
}

/** The JSON stored under `key`; null when there is none, it is not JSON, or storage throws. */
function readJson(storage: QueueStorage, key: string): unknown {
  try {
    // A missing key reads as the text "null", which no queue matches.
    return JSON.parse(String(storage.getItem(key)));
  } catch {
    return null;
  }
}

/** Keeps the queue of `state`, or forgets it when nothing is pending. */
export function saveQueue<State, Move>(
  gameId: string,
  nickname: string,
  state: SyncState<State, Move>,
  storage: QueueStorage,
): void {
  const key = queueKey(gameId, nickname);
  const { confirmed, pending, inFlight } = state;
  try {
    if (pending.length === 0) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify({ confirmed, pending, inFlight }));
  } catch {
    // Storage is a convenience: a failed write must not break the game.
  }
}

/**
 * The state to resume with, given the server's game and the stored queue. The queue is kept when
 * it was made on the server's version, or when a batch was on the wire: the retry tells whether
 * the server already applied it (a replay is acknowledged) or the game moved on (stale). Otherwise
 * the game changed elsewhere: the queue is dropped, and the player is told if moves were lost.
 */
export function resumeQueue<State, Move>(
  server: SavedGame<State>,
  stored: StoredQueue<State, Move> | undefined,
): SyncState<State, Move> {
  if (stored === undefined) return { confirmed: server, pending: [] };
  if (stored.inFlight !== undefined) return stored;
  if (stored.confirmed.version === server.version) return { ...stored, confirmed: server };
  return { confirmed: server, pending: [], notice: 'server-newer' };
}
