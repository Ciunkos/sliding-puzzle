// Optimistic play: a tap applies at once on the device, and the moves wait in a queue until the
// server acknowledges them. Pure: the hook feeds events in and sends what nextBatch says.
import type { GameDefinition, SavedGame } from './index.ts';
import { MAX_BATCH } from './index.ts';

export interface SyncState<State, Move> {
  /** The last game the server acknowledged. */
  confirmed: SavedGame<State>;
  /** Applied on the device, not yet acknowledged, in order. */
  pending: readonly Move[];
  /** The first `count` pending moves are on the wire as batch `batchId`. */
  inFlight?: { batchId: string; count: number };
  notice?: 'server-newer' | 'offline';
}

export type SyncEvent<State, Move> =
  | { type: 'loaded'; game: SavedGame<State> }
  | { type: 'tap'; move: Move }
  | { type: 'flush-started'; batchId: string }
  | { type: 'acknowledged'; game: SavedGame<State> }
  /** Stale or illegal: the server's game wins. */
  | { type: 'rejected'; game: SavedGame<State> }
  | { type: 'network-failed' }
  /** A new game or a reset was answered. */
  | { type: 'replaced'; game: SavedGame<State> };

type Definition<State, Move> = GameDefinition<State, Move, unknown>;

/** `game` after `move`, or `game` itself when the move is illegal or the game is finished. */
function step<State, Move>(
  definition: Definition<State, Move>,
  game: SavedGame<State>,
  move: Move,
): SavedGame<State> {
  if (game.finished) return game;
  const state = definition.apply(game.state, move);
  if (state === undefined) return game;
  return { ...game, state, moves: game.moves + 1, finished: definition.isFinished(state) };
}

/**
 * `game` with `moves` replayed through definition.apply. The version stays: only the server makes
 * versions. Moves that do not apply are skipped; the server will refuse them and its game wins.
 */
export function replay<State, Move>(
  definition: Definition<State, Move>,
  game: SavedGame<State>,
  moves: readonly Move[],
): SavedGame<State> {
  return moves.reduce((current, move) => step(definition, current, move), game);
}

/** The game as the player sees it: the confirmed game with every pending move replayed. */
export function optimistic<State, Move>(
  definition: Definition<State, Move>,
  state: SyncState<State, Move>,
): SavedGame<State> {
  return replay(definition, state.confirmed, state.pending);
}

/** The batch to send: the one on the wire again (a retry), else up to `max` pending moves. */
export function nextBatch<State, Move>(
  state: SyncState<State, Move>,
  max: number,
): { baseVersion: number; moves: readonly Move[] } | undefined {
  const count = state.inFlight?.count ?? Math.min(max, state.pending.length);
  if (count === 0) return undefined;
  return { baseVersion: state.confirmed.version, moves: state.pending.slice(0, count) };
}

/** A fresh state on the server's `game`, with nothing queued. */
function adopt<State, Move>(
  game: SavedGame<State>,
  notice?: 'server-newer',
): SyncState<State, Move> {
  return notice === undefined
    ? { confirmed: game, pending: [] }
    : { confirmed: game, pending: [], notice };
}

function tapped<State, Move>(
  definition: Definition<State, Move>,
  state: SyncState<State, Move>,
  move: Move,
): SyncState<State, Move> {
  const shown = optimistic(definition, state);
  if (step(definition, shown, move) === shown) return state;
  return { ...state, pending: [...state.pending, move] };
}

function flushStarted<State, Move>(
  state: SyncState<State, Move>,
  batchId: string,
): SyncState<State, Move> {
  // A batch already on the wire keeps its id: a retry must be recognisable as the same batch.
  if (state.inFlight !== undefined || state.pending.length === 0) return state;
  return { ...state, inFlight: { batchId, count: Math.min(MAX_BATCH, state.pending.length) } };
}

/**
 * The batch on the wire was applied: its moves leave the queue, later taps stay. An answer that is
 * not the confirmed game moved on by exactly that batch cannot carry the later taps: it is
 * treated like a rejection.
 */
function acknowledged<State, Move>(
  state: SyncState<State, Move>,
  game: SavedGame<State>,
): SyncState<State, Move> {
  const count = state.inFlight?.count ?? 0;
  if (count === 0 || game.version !== state.confirmed.version + count) {
    return adopt(game, 'server-newer');
  }
  return { confirmed: game, pending: state.pending.slice(count) };
}

export function reduce<State, Move>(
  definition: Definition<State, Move>,
  state: SyncState<State, Move>,
  event: SyncEvent<State, Move>,
): SyncState<State, Move> {
  switch (event.type) {
    case 'loaded':
    case 'replaced':
      return adopt(event.game);
    case 'tap':
      return tapped(definition, state, event.move);
    case 'flush-started':
      return flushStarted(state, event.batchId);
    case 'acknowledged':
      return acknowledged(state, event.game);
    case 'rejected':
      return adopt(event.game, 'server-newer');
    case 'network-failed':
      return { ...state, notice: 'offline' };
  }
}

/** cyrb53: a small, well-mixed 53-bit string hash. Not cryptographic; it only has to spread. */
function hash53(text: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * The id of a batch, derived from what it is: its base version, its size and a hash of its moves.
 * No randomness is needed. The server treats a matching id as a replay only when its game's last
 * batch has that id, and every later write replaces the id (a reset or new game clears it), so a
 * match means the stored game is exactly `moves` applied on `baseVersion`. Versions only grow, so
 * that transition happens once per game. A second tab sending the same moves on the same version
 * wants that same game, so acknowledging it is right. Different moves get the same id only by a
 * 53-bit hash collision.
 */
export function batchIdFor(baseVersion: number, moves: readonly unknown[]): string {
  const digest = hash53(JSON.stringify(moves)).toString(36).padStart(11, '0');
  return `${String(baseVersion)}-${String(moves.length)}-${digest}`;
}

/** What the browser sends for a batch (the shape of GameApi.sendMoves). */
export interface MovesRequest<Move> {
  baseVersion: number;
  batchId: string;
  moves: readonly Move[];
  elapsedMs?: number;
}

/**
 * One round of sending: `state` with its next batch marked in flight (flush-started), and the
 * request to send for it; undefined when nothing waits. A batch already in flight is sent again
 * with its own id. `elapsedMs` goes along only when the batch finishes the game.
 */
export function startRound<State, Move>(
  definition: Definition<State, Move>,
  state: SyncState<State, Move>,
  elapsedMs: number,
): { state: SyncState<State, Move>; request: MovesRequest<Move> } | undefined {
  const batch = nextBatch(state, MAX_BATCH);
  if (batch === undefined) return undefined;
  const batchId = state.inFlight?.batchId ?? batchIdFor(batch.baseVersion, batch.moves);
  const sending = reduce(definition, state, { type: 'flush-started', batchId });
  const request = { ...batch, batchId };
  if (!replay(definition, state.confirmed, batch.moves).finished)
    return { state: sending, request };
  return { state: sending, request: { ...request, elapsedMs: Math.max(0, Math.round(elapsedMs)) } };
}
