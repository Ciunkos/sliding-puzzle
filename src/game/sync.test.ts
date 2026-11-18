// The sync queue: literal examples of the reducer, and one model property against the real
// service on the in-memory database, over a network that loses and repeats requests.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import fc from 'fast-check';
import { fixedNow, openTestDb } from '../test-support/db.ts';
import {
  type Delivery,
  flakyNetwork,
  playOverFlakyNetwork,
} from '../test-support/flaky-network.ts';
import { createTestProfile, testProfiles } from '../test-support/profiles.ts';
import { ALWAYS_LOW, tallyGame } from '../test-support/tally-game.ts';
import { createGameApi } from './client.tsx';
import { batchIdSchema } from './index.ts';
import { featureRoutes } from './server.ts';
import { batchIdFor, nextBatch, optimistic, reduce, startRound } from './sync.ts';

/** Version 1 of a new game to 5. */
const V1 = {
  state: { count: 0, target: 5 },
  initial: { count: 0, target: 5 },
  moves: 0,
  finished: false,
  version: 1,
  startedAt: '2026-01-01T00:00:00.000Z',
  finishedAt: null,
};
/** V1 after adding 1 and 2, as the server acknowledges it. */
const V3 = { ...V1, state: { count: 3, target: 5 }, moves: 2, version: 3 };
const ONE = { add: 1 };
const TWO = { add: 2 };
const THREE = { add: 3 };
const IN_FLIGHT = { batchId: 'batch-one', count: 2 };

describe('the sync queue', () => {
  test('a legal tap is queued and shows at once in the optimistic game', () => {
    // Given a confirmed new game with nothing queued
    const state = { confirmed: V1, pending: [] };

    // When 2 is tapped
    const next = reduce(tallyGame, state, { type: 'tap', move: TWO });

    // Then it waits in the queue and the player sees count 2 after one move
    assert.deepEqual(next, { confirmed: V1, pending: [TWO] });
    assert.deepEqual(optimistic(tallyGame, next), {
      state: { count: 2, target: 5 },
      initial: { count: 0, target: 5 },
      moves: 1,
      finished: false,
      version: 1,
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: null,
    });
  });

  test('an illegal tap is ignored', () => {
    const state = { confirmed: V1, pending: [ONE] };

    assert.deepEqual(reduce(tallyGame, state, { type: 'tap', move: { add: 4 } }), {
      confirmed: V1,
      pending: [ONE],
    });
  });

  test('a tap after the optimistic game finished is ignored', () => {
    // Given taps that already reach the target of 5
    const state = { confirmed: V1, pending: [THREE, TWO] };

    // When 1 more is tapped, then nothing changes
    assert.deepEqual(reduce(tallyGame, state, { type: 'tap', move: ONE }), {
      confirmed: V1,
      pending: [THREE, TWO],
    });
  });

  test('the optimistic game counts the moves and finishes, the version stays the confirmed one', () => {
    const state = { confirmed: V1, pending: [THREE, TWO] };

    assert.deepEqual(optimistic(tallyGame, state), {
      state: { count: 5, target: 5 },
      initial: { count: 0, target: 5 },
      moves: 2,
      finished: true,
      version: 1,
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: null,
    });
  });

  test('a started flush puts the pending moves on the wire under the batch id', () => {
    const state = { confirmed: V1, pending: [ONE, TWO] };

    const next = reduce(tallyGame, state, { type: 'flush-started', batchId: 'batch-one' });

    assert.deepEqual(next, { confirmed: V1, pending: [ONE, TWO], inFlight: IN_FLIGHT });
  });

  test('a flush with nothing pending changes nothing', () => {
    const state = { confirmed: V1, pending: [] };

    assert.deepEqual(reduce(tallyGame, state, { type: 'flush-started', batchId: 'batch-one' }), {
      confirmed: V1,
      pending: [],
    });
  });

  test('a flush puts at most 64 moves on the wire', () => {
    const state = { confirmed: V1, pending: Array<{ add: number }>(65).fill(ONE) };

    const next = reduce(tallyGame, state, { type: 'flush-started', batchId: 'batch-one' });

    assert.deepEqual(next.inFlight, { batchId: 'batch-one', count: 64 });
  });

  test('a batch on the wire keeps its id when a flush starts again', () => {
    const state = { confirmed: V1, pending: [ONE, TWO, THREE], inFlight: IN_FLIGHT };

    assert.deepEqual(reduce(tallyGame, state, { type: 'flush-started', batchId: 'other-one' }), {
      confirmed: V1,
      pending: [ONE, TWO, THREE],
      inFlight: IN_FLIGHT,
    });
  });

  test('an acknowledgement drops the acknowledged moves, keeps later taps and clears the notice', () => {
    // Given 1 and 2 on the wire, 3 tapped since, after an earlier failure
    const state = { confirmed: V1, pending: [ONE, TWO, THREE], inFlight: IN_FLIGHT };
    const offline = { ...state, notice: 'offline' as const };

    // When the server acknowledges the batch with version 3
    const next = reduce(tallyGame, offline, { type: 'acknowledged', game: V3 });

    // Then only the later tap waits
    assert.deepEqual(next, { confirmed: V3, pending: [THREE] });
  });

  test('an acknowledgement on another version than the batch made adopts it and drops the queue', () => {
    const state = {
      confirmed: V1,
      pending: [ONE, THREE],
      inFlight: { batchId: 'b-one-xx', count: 1 },
    };

    const next = reduce(tallyGame, state, { type: 'acknowledged', game: V3 });

    assert.deepEqual(next, { confirmed: V3, pending: [], notice: 'server-newer' });
  });

  test('an acknowledgement with nothing on the wire adopts the server game and drops the queue', () => {
    const state = { confirmed: V1, pending: [ONE] };

    const next = reduce(tallyGame, state, { type: 'acknowledged', game: V1 });

    assert.deepEqual(next, { confirmed: V1, pending: [], notice: 'server-newer' });
  });

  test('a rejection discards every pending move and adopts the server game with a notice', () => {
    const state = { confirmed: V1, pending: [ONE, TWO, THREE], inFlight: IN_FLIGHT };

    const next = reduce(tallyGame, state, { type: 'rejected', game: V3 });

    assert.deepEqual(next, { confirmed: V3, pending: [], notice: 'server-newer' });
  });

  test('a network failure keeps the queue and the batch on the wire, and says offline', () => {
    const state = { confirmed: V1, pending: [ONE, TWO], inFlight: IN_FLIGHT };

    const next = reduce(tallyGame, state, { type: 'network-failed' });

    assert.deepEqual(next, {
      confirmed: V1,
      pending: [ONE, TWO],
      inFlight: IN_FLIGHT,
      notice: 'offline',
    });
  });

  test('a replaced or loaded game is adopted with nothing queued and no notice', () => {
    const state = { confirmed: V1, pending: [ONE], notice: 'offline' as const };

    const replaced = reduce(tallyGame, state, { type: 'replaced', game: V3 });
    const loaded = reduce(tallyGame, state, { type: 'loaded', game: V3 });

    assert.deepEqual(
      [replaced, loaded],
      [
        { confirmed: V3, pending: [] },
        { confirmed: V3, pending: [] },
      ],
    );
  });

  test('the next batch is the one on the wire again, else up to max pending moves', () => {
    const retry = { confirmed: V1, pending: [ONE, TWO, THREE], inFlight: IN_FLIGHT };
    const fresh = { confirmed: V3, pending: [ONE, TWO, THREE] };

    assert.deepEqual(nextBatch(retry, 64), { baseVersion: 1, moves: [ONE, TWO] });
    assert.deepEqual(nextBatch(fresh, 1), { baseVersion: 3, moves: [ONE] });
    assert.equal(nextBatch({ confirmed: V1, pending: [] }, 64), undefined);
  });

  test('a batch id names the base version, the size and a hash of the moves', () => {
    const id = batchIdFor(7, [ONE, TWO]);

    // Pinned: a release that changed the hash would not recognise the ids of queues already stored.
    assert.equal(id, '7-2-29jn81wpavk');
    assert.equal(batchIdSchema.safeParse(id).success, true);
    assert.notEqual(batchIdFor(7, [TWO, ONE]), '7-2-29jn81wpavk');
  });

  test('a round marks the next batch in flight under its id and sends no time before the finish', () => {
    const round = startRound(tallyGame, { confirmed: V1, pending: [ONE, TWO] }, 5000);

    assert.deepEqual(round, {
      state: {
        confirmed: V1,
        pending: [ONE, TWO],
        inFlight: { batchId: '1-2-29jn81wpavk', count: 2 },
      },
      request: { baseVersion: 1, batchId: '1-2-29jn81wpavk', moves: [ONE, TWO] },
    });
  });

  test('a round that finishes the game sends the play time in whole milliseconds', () => {
    const state = { confirmed: V1, pending: [THREE, TWO], inFlight: IN_FLIGHT };

    const round = startRound(tallyGame, state, 1234.6);

    assert.ok(round);
    assert.deepEqual(round.request, {
      baseVersion: 1,
      batchId: 'batch-one',
      moves: [THREE, TWO],
      elapsedMs: 1235,
    });
  });

  test('there is no round when nothing waits', () => {
    assert.equal(startRound(tallyGame, { confirmed: V1, pending: [] }, 0), undefined);
  });
});

/** The tally game's real routes over a fresh database with Ada at a new game to 1000. */
async function adaOverFlakyNetwork() {
  const db = await openTestDb();
  const ada = await createTestProfile(db, 'Ada');
  const context = { db, profiles: testProfiles(db), random: ALWAYS_LOW, now: fixedNow };
  const app = featureRoutes({ definition: tallyGame }, { ...context, enableTestRoutes: false });
  const network = flakyNetwork(app);
  const api = createGameApi(tallyGame, '/api', network.fetch);
  const game = await api.resume('Ada', { target: 1000 });
  return { player: { api, network, nickname: 'Ada' }, game, id: ada.id, db };
}

const DELIVERY = fc.constantFrom<Delivery>(
  'delivered',
  'request-lost',
  'answer-lost',
  'delivered-twice',
);
const SCRIPT = fc.array(
  fc.record({
    move: fc.record({ add: fc.integer({ min: 1, max: 3 }) }),
    flushes: fc.array(DELIVERY, { maxLength: 3 }),
  }),
  { maxLength: 25 },
);

test('over a network that loses and repeats batches, every tap is stored exactly once', async () => {
  // At most 25 adds of at most 3 never reach the target of 1000, so every tap is legal.
  await fc.assert(
    fc.asyncProperty(SCRIPT, async (script) => {
      const { player, game } = await adaOverFlakyNetwork();
      const { shown, settled } = await playOverFlakyNetwork(
        player,
        { confirmed: game, pending: [] },
        script,
      );
      const stored = await player.api.resume('Ada', { target: 1000 });
      // Nothing is pending, the server stored what the player saw, and each tap counts once.
      assert.deepEqual(
        [settled.pending, optimistic(tallyGame, settled), stored, stored.moves],
        [[], stored, { ...shown, version: stored.version }, script.length],
      );
    }),
    { numRuns: 60 },
  );
});
