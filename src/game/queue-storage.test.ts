import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { tallyGame } from '../test-support/tally-game.ts';
import { loadQueue, type QueueStorage, queueKey, resumeQueue, saveQueue } from './queue-storage.ts';

const KEY = 'sliding-puzzle:queue:tally:ada';
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
const QUEUE = { confirmed: V1, pending: [{ add: 1 }, { add: 2 }] };
/** Both pending moves on the wire: as many as are pending, more than one. */
const ON_THE_WIRE = { ...QUEUE, inFlight: { batchId: 'batch-one', count: 2 } };

/** A Storage-shaped stand-in for the browser's localStorage, kept in memory. */
function memoryStorage(entries: Record<string, string>): QueueStorage {
  // URLSearchParams already answers null for a missing key, like Storage.getItem.
  const values = new URLSearchParams(entries);
  return {
    getItem: (key) => values.get(key),
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

/** Storage as in a private window or with site data blocked: every access throws. */
const THROWING_STORAGE: QueueStorage = {
  getItem(): string | null {
    throw new Error('SecurityError: storage is disabled');
  },
  setItem(): void {
    throw new Error('QuotaExceededError');
  },
  removeItem(): void {
    throw new Error('SecurityError: storage is disabled');
  },
};

describe('the stored move queue', () => {
  test('the key names the game and the nickname in any casing', () => {
    assert.equal(queueKey('tally', ' ADA '), KEY);
  });

  test('a saved queue is restored with the batch on the wire, without its notice', () => {
    // Given a queue saved while offline
    const storage = memoryStorage({});
    saveQueue('tally', 'Ada', { ...ON_THE_WIRE, notice: 'offline' }, storage);

    // When it is loaded for Ada, then it is the same queue
    assert.deepEqual(loadQueue(tallyGame, 'ADA', storage), ON_THE_WIRE);
  });

  test('a queue with nothing pending is forgotten', () => {
    const storage = memoryStorage({ [KEY]: JSON.stringify(QUEUE) });

    saveQueue('tally', 'Ada', { confirmed: V2, pending: [] }, storage);

    assert.equal(storage.getItem(KEY), null);
  });

  test('stored content that is not a valid queue is ignored', () => {
    const notJson = memoryStorage({ [KEY]: '{oops' });
    const badMove = memoryStorage({
      [KEY]: JSON.stringify({ ...QUEUE, pending: [{ add: 'one' }] }),
    });
    const tooMany = { ...QUEUE, inFlight: { batchId: 'batch-one', count: 3 } };

    assert.equal(loadQueue(tallyGame, 'Ada', notJson), undefined);
    assert.equal(loadQueue(tallyGame, 'Ada', badMove), undefined);
    assert.equal(
      loadQueue(tallyGame, 'Ada', memoryStorage({ [KEY]: JSON.stringify(tooMany) })),
      undefined,
    );
  });

  test('nothing stored gives no queue', () => {
    assert.equal(loadQueue(tallyGame, 'Ada', memoryStorage({})), undefined);
  });

  test('storage that throws gives no queue and does not break a save', () => {
    assert.equal(loadQueue(tallyGame, 'Ada', THROWING_STORAGE), undefined);
    assert.doesNotThrow(() => {
      saveQueue('tally', 'Ada', QUEUE, THROWING_STORAGE);
    });
  });
});

describe('resuming with the stored queue', () => {
  test('a queue made on the server version is kept on the server game', () => {
    assert.deepEqual(resumeQueue(V1, QUEUE), QUEUE);
  });

  test('a queue made on another version is dropped, and the player is told', () => {
    assert.deepEqual(resumeQueue(V2, QUEUE), {
      confirmed: V2,
      pending: [],
      notice: 'server-newer',
    });
  });

  test('a queue with a batch on the wire is kept for the retry to decide', () => {
    assert.deepEqual(resumeQueue(V2, ON_THE_WIRE), ON_THE_WIRE);
  });

  test('without a stored queue the server game is resumed with nothing queued', () => {
    assert.deepEqual(resumeQueue(V2, undefined), { confirmed: V2, pending: [] });
  });
});
