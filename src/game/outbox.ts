// Sends a batch of moves and says what its answer means for the queue (see sync.ts).
import { type GameApi, GameApiError, StaleGameError } from './api.ts';
import type { SavedGame } from './index.ts';
import type { MovesRequest, SyncEvent } from './sync.ts';

/**
 * The events a send can end in; `refused` is not a sync event: the server can never accept this
 * batch (it is malformed for it, or the game or profile is gone), so the queue must be dropped.
 */
export type SendOutcome<State, Move> =
  | Extract<SyncEvent<State, Move>, { type: 'acknowledged' | 'rejected' | 'network-failed' }>
  | { type: 'refused' };

/**
 * Answers that a later retry may turn into success: unreachable, timed out, busy, server errors,
 * and a 2xx that is not a game (a portal's login page, a proxy's): it says nothing about whether
 * the server took the batch.
 */
function retriable(failure: unknown): boolean {
  if (!(failure instanceof GameApiError)) return true;
  const { status } = failure;
  const unreadable = status >= 200 && status < 300;
  return status === 0 || unreadable || status === 408 || status === 429 || status >= 500;
}

/** The event for a failed send: the server's game wins, a retry later, or a refusal for good. */
function failed<State, Move>(failure: unknown): SendOutcome<State, Move> {
  if (retriable(failure)) return { type: 'network-failed' };
  if (!(failure instanceof StaleGameError)) return { type: 'refused' };
  // The API client parsed this game with the same definition's state schema.
  return { type: 'rejected', game: failure.game as SavedGame<State> };
}

/**
 * Sends `request` and answers with its event: acknowledged, rejected (stale or illegal: the
 * server's game wins), or network-failed (unreachable, or any other error answer: kept, retried).
 */
export async function sendBatch<State, Move, Options>(
  api: GameApi<State, Move, Options>,
  nickname: string,
  request: MovesRequest<Move>,
): Promise<SendOutcome<State, Move>> {
  try {
    return { type: 'acknowledged', game: await api.sendMoves(nickname, request) };
  } catch (failure) {
    return failed(failure);
  }
}

/** How long to wait before retry number `attempt` (1, 2, ...): doubling from 1 s, at most 30 s. */
export function backoffMs(attempt: number): number {
  return Math.min(30_000, 1000 * 2 ** Math.max(0, attempt - 1));
}
