// The outside world of a browser game session, under a test's control: the network, storage,
// the device clock and timers, around the real tally game routes on the in-memory database.
import type { Hono } from 'hono';
import { createGameApi, type GameApi } from '../game/client.tsx';
import { featureRoutes } from '../game/server.ts';
import { openTestDb } from './db.ts';
import { createTestProfile, testProfiles } from './profiles.ts';
import {
  ALWAYS_LOW,
  type TallyMove,
  type TallyOptions,
  type TallyState,
  tallyGame,
} from './tally-game.ts';

/** Where Ada's tally game lives on the routes. */
export const ADA_TALLY = '/api/profiles/Ada/games/tally';

/** What a test changes while it runs. */
export interface World {
  /** False: every request fails, as when the network is down. */
  reachable: boolean;
  /** Requests to URLs ending so fail as well. */
  refused: string | undefined;
  /** What navigator.onLine would say. */
  online: boolean;
  serverNow: Date;
  /** The device's clock, in milliseconds. */
  deviceNow: number;
  storage: Map<string, string>;
  /** The delays of the timers asked for, in order. */
  delays: number[];
  timers: (() => void)[];
}

export interface Device {
  world: World;
  app: Hono;
  api: GameApi<TallyState, TallyMove, TallyOptions>;
  /** What the session driver gets from the browser, over `world`. */
  environment: ReturnType<typeof environmentOf>;
  /** The game as the server has stored it. */
  stored: () => Promise<unknown>;
  /** Runs every timer asked for so far, and waits until what they started has settled. */
  runTimers: () => Promise<void>;
}

function environmentOf(world: World) {
  return {
    storage: {
      getItem: (key: string) => world.storage.get(key) ?? null,
      setItem: (key: string, value: string) => void world.storage.set(key, value),
      removeItem: (key: string) => void world.storage.delete(key),
    },
    isOnline: () => world.online,
    isVisible: () => true,
    now: () => world.deviceNow,
    schedule: (run: () => void, ms: number) => {
      world.delays.push(ms);
      world.timers.push(run);
      return () => undefined;
    },
  };
}

function newWorld(): World {
  return {
    reachable: true,
    refused: undefined,
    online: true,
    serverNow: new Date('2026-01-01T00:00:00.000Z'),
    deviceNow: 0,
    storage: new Map(),
    delays: [],
    timers: [],
  };
}

/** A device where Ada (a profile on a fresh database) has a new tally game to `target`. */
export async function adaDevice(target: number): Promise<Device> {
  const db = await openTestDb();
  await createTestProfile(db, 'Ada');
  const world = newWorld();
  const profiles = testProfiles(db);
  const now = () => world.serverNow;
  const context = { db, profiles, random: ALWAYS_LOW, now, enableTestRoutes: false };
  const app = featureRoutes({ definition: tallyGame }, context);
  const api = createGameApi(tallyGame, '/api', async (url, init) => {
    const refused =
      world.refused !== undefined &&
      (url instanceof Request ? url.url : url.toString()).endsWith(world.refused);
    if (!world.reachable || refused) throw new TypeError('offline');
    return app.request(url, init);
  });
  await app.request(ADA_TALLY, { method: 'POST', body: JSON.stringify({ target }) });
  return {
    world,
    app,
    api,
    environment: environmentOf(world),
    stored: async () => {
      const body: unknown = await (await app.request(ADA_TALLY)).json();
      return body;
    },
    runTimers: async () => {
      for (const run of world.timers.splice(0)) run();
      // The routes run on in-memory SQLite: everything they start settles before the next macrotask.
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
}
