import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { memoryStorage, THROWING_STORAGE } from '../test-support/memory-storage.ts';
import { tallyGame } from '../test-support/tally-game.ts';
import {
  forgetQueues,
  loadClock,
  loadQueues,
  offlineQueue,
  queuePrefix,
  resumeQueues,
  saveClock,
  saveQueue,
} from './queue-storage.ts';

const PREFIX = 'game-queue:tally:ada:';
const V1 = {
  state: { count: 0, target: 5 },
  initial: { count: 0, target: 5 },
  moves: 0,
  finished: false,
  version: 1,
  startedAt: '2026-01-01T00:00:00.000Z',
  finishedAt: null,
};
const V2 = { ...V1, state: { count: 2, target: 5 }, moves: 1, version: 2 };
const ONE = { add: 1 };
const TWO = { add: 2 };
const QUEUE = { confirmed: V1, pending: [ONE, TWO] };
/** Both pending moves on the wire: as many as are pending, more than one. */
const ON_THE_WIRE = { ...QUEUE, inFlight: { batchId: 'batch-one', count: 2 } };
const OTHER_TAB = { confirmed: V1, pending: [{ add: 3 }] };
const STALE_TAB = { confirmed: V2, pending: [ONE] };
const STORED_CLOCK = {
  startedAt: '2026-01-01T00:00:00.000Z',
  clock: { banked: 5, since: 7, started: true, stopped: false, visible: true, lastAt: 9 },
};

/** Storage holding one record per queue, keyed in the order given. */
function storageWith(first: object, second?: object, third?: object) {
  return memoryStorage({
    [`${PREFIX}a`]: JSON.stringify(first),
    [`${PREFIX}b`]: JSON.stringify(second),
    [`${PREFIX}c`]: JSON.stringify(third),
  });
}

describe('the stored move queues', () => {
  test('the prefix names the game and the nickname in any casing, under a neutral name', () => {
    assert.equal(queuePrefix('tally', ' ADA '), PREFIX);
  });

  test('a saved queue is loaded again with the batch on the wire, without its notice', () => {
    const storage = memoryStorage({});

    saveQueue('tally', 'Ada', { ...ON_THE_WIRE, notice: 'offline' }, storage);

    assert.partialDeepStrictEqual(loadQueues(tallyGame, 'ADA', storage), [{ queue: ON_THE_WIRE }]);
  });

  test('a record is named after its own content, under the prefix', () => {
    const key = saveQueue('tally', 'Ada', QUEUE, memoryStorage({}));

    assert.match(String(key), /^game-queue:tally:ada:1-2-[0-9a-z]{11}$/);
  });

  test('saving a changed queue replaces the record it was saved under before', () => {
    const storage = memoryStorage({});
    const before = saveQueue('tally', 'Ada', OTHER_TAB, storage);

    saveQueue('tally', 'Ada', QUEUE, storage, before);

    assert.partialDeepStrictEqual(loadQueues(tallyGame, 'Ada', storage), [{ queue: QUEUE }]);
  });

  test('a queue with nothing pending is forgotten and gets no record', () => {
    const storage = memoryStorage({});
    const before = saveQueue('tally', 'Ada', QUEUE, storage);

    const key = saveQueue('tally', 'Ada', { confirmed: V2, pending: [] }, storage, before);

    assert.deepEqual([key, storage.length], [undefined, 0]);
  });

  test('two tabs keep their own records: one never overwrites the other', () => {
    const storage = storageWith(QUEUE, OTHER_TAB);

    assert.equal(loadQueues(tallyGame, 'Ada', storage).length, 2);
  });

  test('records of another profile or another game are not loaded', () => {
    const storage = storageWith(QUEUE);
    saveQueue('tally', 'Bob', OTHER_TAB, storage);
    saveQueue('other', 'Ada', OTHER_TAB, storage);

    assert.partialDeepStrictEqual(loadQueues(tallyGame, 'Ada', storage), [{ queue: QUEUE }]);
  });

  test('stored content that is not a valid queue is ignored and removed', () => {
    const storage = memoryStorage({
      [`${PREFIX}a`]: '{oops',
      [`${PREFIX}b`]: JSON.stringify({ ...QUEUE, pending: [{ add: 'one' }] }),
      [`${PREFIX}c`]: JSON.stringify({ ...QUEUE, inFlight: { batchId: 'batch-one', count: 3 } }),
      [`${PREFIX}d`]: JSON.stringify({ ...QUEUE, inFlight: { batchId: 'bad id!', count: 1 } }),
    });

    assert.deepEqual(loadQueues(tallyGame, 'Ada', storage), []);
    assert.equal(storage.length, 0);
  });

  test('forgotten records are removed', () => {
    const storage = storageWith(QUEUE, OTHER_TAB);

    forgetQueues(storage, loadQueues(tallyGame, 'Ada', storage));

    assert.equal(storage.length, 0);
  });

  test('storage that throws gives no queues and does not break a save', () => {
    assert.deepEqual(loadQueues(tallyGame, 'Ada', THROWING_STORAGE), []);
    assert.equal(saveQueue('tally', 'Ada', QUEUE, THROWING_STORAGE), undefined);
    assert.doesNotThrow(() => {
      forgetQueues(THROWING_STORAGE, [{ key: 'k' }]);
    });
  });
});

describe('resuming with the stored queues', () => {
  test('a queue made on the server version is kept on the server game', () => {
    const records = loadQueues(tallyGame, 'Ada', storageWith(QUEUE));

    assert.deepEqual(resumeQueues(tallyGame, V1, records), QUEUE);
  });

  test('a queue made on another version is dropped, and the player is told', () => {
    const records = loadQueues(tallyGame, 'Ada', storageWith(QUEUE));

    assert.deepEqual(resumeQueues(tallyGame, V2, records), {
      confirmed: V2,
      pending: [],
      notice: 'server-newer',
    });
  });

  test('a queue with a batch on the wire is kept for the retry to decide', () => {
    const records = loadQueues(tallyGame, 'Ada', storageWith(ON_THE_WIRE));

    assert.deepEqual(resumeQueues(tallyGame, V2, records), ON_THE_WIRE);
  });

  test('without stored queues the server game is resumed with nothing queued', () => {
    assert.deepEqual(resumeQueues(tallyGame, V2, []), { confirmed: V2, pending: [] });
  });

  test('the queues of two tabs on the server version are both kept, one after the other', () => {
    const records = loadQueues(tallyGame, 'Ada', storageWith(QUEUE, OTHER_TAB));

    const resumed = resumeQueues(tallyGame, V1, records);

    assert.equal(resumed.pending.length, 3);
    assert.equal(resumed.notice, undefined);
  });

  test('beside a queue that is kept, one made on another version is dropped with a notice', () => {
    const records = loadQueues(tallyGame, 'Ada', storageWith(QUEUE, STALE_TAB));

    assert.deepEqual(resumeQueues(tallyGame, V1, records), {
      confirmed: V1,
      pending: [ONE, TWO],
      notice: 'server-newer',
    });
  });

  test('moves of another tab that no longer apply are dropped with a notice', () => {
    // Given two tabs that each queued 3 + 2 on a game to 5: together they would pass the target
    const full = { confirmed: V1, pending: [{ add: 3 }, TWO] };
    const records = loadQueues(tallyGame, 'Ada', storageWith(full, { ...full, pending: [TWO] }));

    // When they are resumed, then the second tab's move is dropped and the player is told
    assert.partialDeepStrictEqual(resumeQueues(tallyGame, V1, records), { notice: 'server-newer' });
  });
});

describe('the stored queues without the server', () => {
  test('without stored queues there is nothing to show', () => {
    assert.equal(offlineQueue(tallyGame, []), undefined);
  });

  test('the stored queue is shown, saying the device is offline', () => {
    const records = loadQueues(tallyGame, 'Ada', storageWith(QUEUE));

    const shown = offlineQueue(tallyGame, records);

    assert.ok(shown);
    assert.deepEqual(shown.state, { confirmed: V1, pending: [ONE, TWO], notice: 'offline' });
    assert.equal(shown.merged.length, 1);
  });

  test('the newest stored queue is shown, joined by other tabs on its version', () => {
    const third = { confirmed: V2, pending: [TWO] };
    const records = loadQueues(tallyGame, 'Ada', storageWith(QUEUE, STALE_TAB, third));

    const shown = offlineQueue(tallyGame, records);

    // Then the queues on version 2 are shown together, and the one on version 1 waits for the server
    assert.ok(shown);
    assert.deepEqual(shown.state, { confirmed: V2, pending: [ONE, TWO], notice: 'offline' });
    assert.equal(shown.merged.length, 2);
  });
});

describe('the stored play clock', () => {
  test('a saved clock is loaded again for its game', () => {
    const storage = memoryStorage({});

    saveClock('tally', 'Ada', STORED_CLOCK, storage);

    assert.deepEqual(loadClock('tally', 'ADA', storage), {
      startedAt: '2026-01-01T00:00:00.000Z',
      clock: { banked: 5, since: 7, started: true, stopped: false, visible: true, lastAt: 9 },
    });
  });

  test('a stored clock that is not a clock is ignored', () => {
    const storage = memoryStorage({ 'game-clock:tally:ada': '{"startedAt":1}' });

    assert.equal(loadClock('tally', 'Ada', storage), undefined);
  });

  test('storage that throws gives no clock and does not break a save', () => {
    assert.equal(loadClock('tally', 'Ada', THROWING_STORAGE), undefined);
    assert.doesNotThrow(() => {
      saveClock('tally', 'Ada', STORED_CLOCK, THROWING_STORAGE);
    });
  });
});
