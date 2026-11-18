import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { fixedNow, openTestDb } from '../test-support/db.ts';
import { testProfiles } from '../test-support/profiles.ts';
import { ALWAYS_LOW, tallyFeature } from '../test-support/tally-game.ts';
import { featureRoutes } from './server.ts';

/** The tally feature's routes, with its test routes enabled or not. */
async function routes(enableTestRoutes: boolean) {
  const db = await openTestDb();
  const profiles = testProfiles(db);
  return featureRoutes(tallyFeature, {
    db,
    profiles,
    random: ALWAYS_LOW,
    now: fixedNow,
    enableTestRoutes,
  });
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
});
