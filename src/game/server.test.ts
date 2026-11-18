import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { fixedNow, openTestDb } from '../test-support/db.ts';
import { testProfiles } from '../test-support/profiles.ts';
import { ALWAYS_LOW, tallyFeature, tallyGame } from '../test-support/tally-game.ts';
import { featureRoutes } from './server.ts';

/** The context the server gives every feature, over a fresh database. */
async function context(enableTestRoutes: boolean) {
  const db = await openTestDb();
  return { db, profiles: testProfiles(db), random: ALWAYS_LOW, now: fixedNow, enableTestRoutes };
}

/** The tally feature's routes, with its test routes enabled or not. */
async function routes(enableTestRoutes: boolean) {
  return featureRoutes(tallyFeature, await context(enableTestRoutes));
}

describe('featureRoutes', () => {
  test('a feature with test routes enabled serves them', async () => {
    const app = await routes(true);

    const res = await app.request('/api/test/tally');

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { mounted: true });
  });

  test('a feature with test routes disabled does not serve them', async () => {
    const app = await routes(false);

    const res = await app.request('/api/test/tally');

    assert.equal(res.status, 404);
  });

  test('a game id that is not lowercase letters, digits and dashes is refused', async () => {
    // Given a game whose id would turn into a path parameter
    const feature = { definition: { ...tallyGame, id: 'tally:x' } };
    const shared = await context(false);

    // When its routes are built, then building fails and names the id
    assert.throws(() => featureRoutes(feature, shared), /"tally:x"/);
  });
});
