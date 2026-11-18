import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { openTestDb } from '../test-support/db.ts';
import { featureApp } from '../test-support/feature-app.ts';
import { grid } from '../test-support/grid.ts';
import { createTestProfile } from '../test-support/profiles.ts';
import { puzzle } from './server.ts';

const NEAR_SOLVED = '/api/test/profiles/Ada/game/near-solved';

describe('the near-solved test route', () => {
  test('it starts a game one move from solved', async () => {
    // Given Ada and the puzzle with its test routes enabled
    const db = await openTestDb();
    await createTestProfile(db, 'Ada');
    const app = featureApp(puzzle, db, { enableTestRoutes: true });

    // When the near-solved game is requested
    const res = await app.request(NEAR_SOLVED, { method: 'POST' });

    // Then a fresh game starts with tile 15 one slide away from home
    assert.equal(res.status, 201);
    assert.partialDeepStrictEqual(await res.json(), {
      moves: 0,
      state: {
        board: grid`
           1  2  3  4
           5  6  7  8
           9 10 11 12
          13 14  _ 15
        `,
      },
    });
  });

  test('an unknown profile is 404 profile not found', async () => {
    const app = featureApp(puzzle, await openTestDb(), { enableTestRoutes: true });

    const res = await app.request(NEAR_SOLVED, { method: 'POST' });

    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: 'profile not found' });
  });
});
