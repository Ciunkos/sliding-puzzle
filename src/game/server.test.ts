import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { fixedNow, openTestDb } from '../test-support/db.ts';
import { createTestProfile, testProfiles } from '../test-support/profiles.ts';
import { ALWAYS_LOW, tallyFeature, tallyGame } from '../test-support/tally-game.ts';
import { featureRoutes } from './server.ts';

const ALMOST_DONE = '/api/test/profiles/Ada/tally/almost-done';

/** The context the server gives every feature, over a fresh database with one profile, Ada. */
async function context(enableTestRoutes: boolean) {
  const db = await openTestDb();
  await createTestProfile(db, 'Ada');
  return { db, profiles: testProfiles(db), random: ALWAYS_LOW, now: fixedNow, enableTestRoutes };
}

/** The tally feature's routes, with its test routes enabled or not. */
async function routes(enableTestRoutes: boolean) {
  return featureRoutes(tallyFeature, await context(enableTestRoutes));
}

describe('featureRoutes', () => {
  test('enabled test routes are served with the game service and the profile lookup', async () => {
    const app = await routes(true);

    const res = await app.request(ALMOST_DONE, { method: 'POST' });

    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), {
      state: { count: 4, target: 5 },
      initial: { count: 4, target: 5 },
      moves: 0,
      finished: false,
      version: 1,
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: null,
    });
  });

  test('a feature with test routes disabled does not serve them', async () => {
    const app = await routes(false);

    const res = await app.request(ALMOST_DONE, { method: 'POST' });

    assert.equal(res.status, 404);
  });

  test('a game id that is not lowercase letters, digits and dashes is refused', async () => {
    // Given a game whose id would turn into a path parameter
    const feature = { definition: { ...tallyGame, id: 'tally:x' } };
    const shared = await context(false);

    // When its routes are built, then building fails and names the id
    assert.throws(() => featureRoutes(feature, shared), /"tally:x"/);
  });

  test('a game ranked by highest score without a score function is refused', async () => {
    // Given a game that asks to be ranked by score but cannot score
    const feature = { definition: { ...tallyGame, ranking: 'highest-score' as const } };
    const shared = await context(false);

    // When its routes are built, then building fails and says what is missing
    assert.throws(
      () => featureRoutes(feature, shared),
      /game "tally" is ranked by highest score but has no score function/,
    );
  });
});
