// A network between the browser's sync queue and the real game routes that loses requests and
// answers or delivers twice, on command. For the model property of src/game/sync.test.ts.
import type { Hono } from 'hono';
import type { GameApi } from '../game/client.tsx';
import type { SavedGame } from '../game/index.ts';
import { sendBatch } from '../game/outbox.ts';
import { optimistic, reduce, startRound, type SyncState } from '../game/sync.ts';

/**
 * What happens to the next request: it arrives and is answered, it never arrives, it arrives but
 * its answer is lost, or it arrives twice and the browser gets the second answer.
 */
export type Delivery = 'delivered' | 'request-lost' | 'answer-lost' | 'delivered-twice';

export interface FlakyNetwork {
  next: Delivery;
  fetch: typeof fetch;
}

/** A fetch over `app`'s routes that does to each request what `next` says at that moment. */
export function flakyNetwork(app: Hono): FlakyNetwork {
  const network: FlakyNetwork = {
    next: 'delivered',
    fetch: async (input, init) => {
      const delivery = network.next;
      if (delivery === 'request-lost') throw new TypeError('the request was lost');
      const first = await app.request(input, init);
      if (delivery === 'answer-lost') throw new TypeError('the answer was lost');
      return delivery === 'delivered-twice' ? app.request(input, init) : first;
    },
  };
  return network;
}

/** One tap, then flushes that each go through the network as the delivery says. */
export interface TapThenFlushes<Move> {
  move: Move;
  flushes: readonly Delivery[];
}

interface Player<State, Move> {
  api: GameApi<State, Move, unknown>;
  network: FlakyNetwork;
  nickname: string;
}

/** One flush: the next batch, if any, sent over the network as `delivery` says. */
async function flush<State, Move>(
  player: Player<State, Move>,
  state: SyncState<State, Move>,
  delivery: Delivery,
): Promise<SyncState<State, Move>> {
  const round = startRound(player.api.definition, state, 0);
  if (round === undefined) return state;
  player.network.next = delivery;
  const event = await sendBatch(player.api, player.nickname, round.request);
  // The real routes never refuse a batch this script sends.
  if (event.type === 'refused') throw new Error('the batch was refused');
  return reduce(player.api.definition, round.state, event);
}

/**
 * Plays `script` from `start`, then flushes over a working network until nothing is pending.
 * Returns what the player saw after the last tap and the final state.
 */
export async function playOverFlakyNetwork<State, Move>(
  player: Player<State, Move>,
  start: SyncState<State, Move>,
  script: readonly TapThenFlushes<Move>[],
): Promise<{ shown: SavedGame<State>; settled: SyncState<State, Move> }> {
  let state = start;
  for (const step of script) {
    state = reduce(player.api.definition, state, { type: 'tap', move: step.move });
    for (const delivery of step.flushes) state = await flush(player, state, delivery);
  }
  const shown = optimistic(player.api.definition, state);
  // Each working flush acknowledges a batch; a retry plus the rest of the queue fit in a few.
  for (let round = 0; round < 4; round++) state = await flush(player, state, 'delivered');
  return { shown, settled: state };
}
