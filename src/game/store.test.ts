// The store on a real Cloudflare D1 (Miniflare): every repo migration applies there, and a finishing
// batch writes its result, score included, so the best results read it back.
import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { closeTestD1 } from '../test-support/d1.ts';
import { openMigratedTestD1 } from '../test-support/d1-db.ts';
import { createTestProfile } from '../test-support/profiles.ts';
import { bestResults, saveIfVersion, upsertGame } from './store.ts';

after(closeTestD1);

const MIDNIGHT = '2026-01-01T00:00:00.000Z';
const AT_FIVE = '2026-01-01T00:05:00.000Z';
const STARTED = { points: 0, turns: 0 };
/** The score game after three turns worth 12 points, finished five minutes in. */
const FINISHED_GAME = {
  state: { points: 12, turns: 3 },
  initial: STARTED,
  moves: 3,
  finished: true,
  version: 4,
  startedAt: MIDNIGHT,
  finishedAt: AT_FIVE,
};

/** The finished game's result as the best results list it. */
const BEST = [
  {
    variant: 'default',
    moves: 3,
    durationMs: 300_000,
    reportedMs: 1000,
    score: 12,
    finishedAt: AT_FIVE,
  },
];

/** A migrated D1 database where Ada's score game was started at midnight (version 1). */
async function scoreGameOnD1() {
  const db = await openMigratedTestD1();
  const ada = await createTestProfile(db, 'Ada');
  const key = { profileId: ada.id, gameId: 'score' };
  const fresh = { state: STARTED, initial: STARTED, moves: 0, finished: false };
  await upsertGame(db, key, { ...fresh, startedAt: MIDNIGHT, finishedAt: null });
  return { db, key };
}

describe('the store on D1', () => {
  test('a finishing batch stores its result with its score, read back as a best result', async () => {
    // Given a D1 database with every migration and Ada's score game at version 1
    const { db, key } = await scoreGameOnD1();
    const result = {
      variant: 'default',
      moves: 3,
      durationMs: 300_000,
      reportedMs: 1000,
      score: 12,
    };

    // When a batch finishes it with 12 points
    const swap = { expectedVersion: 1, next: FINISHED_GAME, updatedAt: AT_FIVE, result };
    const saved = await saveIfVersion(db, key, { ...swap, batchId: 'batch-one' });

    // Then it won, and its result is the best result, score included
    assert.deepEqual([saved, await bestResults(db, key, 5, 'highest-score')], [true, BEST]);
  });
});
