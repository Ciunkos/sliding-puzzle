// One game feature mounted on the real engine (real service, real profiles, real database).
import type { Hono } from 'hono';
import type { Db } from '../db/index.ts';
import { featureRoutes, type ServerFeature } from '../game/server.ts';
import { fixedNow } from './db.ts';
import { testProfiles } from './profiles.ts';

/** A random source for routes that must not need randomness: calling it is a test failure. */
function noRandom(): number {
  throw new Error('featureApp: this route used randomness; pass a scriptedRng if it should');
}

/** The routes of `feature` over `db`, with a fixed clock and, by default, no randomness. */
export function featureApp<State, Move, Options>(
  feature: ServerFeature<State, Move, Options>,
  db: Db,
  options: { enableTestRoutes: boolean; random?: () => number },
): Hono {
  return featureRoutes(feature, {
    db,
    profiles: testProfiles(db),
    random: options.random ?? noRandom,
    now: fixedNow,
    enableTestRoutes: options.enableTestRoutes,
  });
}
