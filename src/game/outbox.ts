// Sends a batch of moves and says what its answer means for the queue (see sync.ts).
import { type GameApi, StaleGameError } from './api.ts';
import type { SavedGame } from './index.ts';
import type { MovesRequest, SyncEvent } from './sync.ts';

/** The events a send can end in. */
export type SendOutcome<State, Move> = Extract<
  SyncEvent<State, Move>,
  { type: 'acknowledged' | 'rejected' | 'network-failed' }
>;

/** The event for a failed send: the server's game wins, or the send is kept and retried later. */
function failed<State, Move>(failure: unknown): SendOutcome<State, Move> {
  if (!(failure instanceof StaleGameError)) return { type: 'network-failed' };
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
