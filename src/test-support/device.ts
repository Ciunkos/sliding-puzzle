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
  /** Requests to URLs ending so reach the server, but their answers are lost. */
  losingAnswers: string | undefined;
  /** Requests to URLs ending so never answer (until the client gives up on them). */
  hanging: string | undefined;
  /** Requests to URLs ending so are answered with this HTTP status by a broken server. */
  broken: { suffix: string; status: number } | undefined;
  /** Requests by this method to URLs ending so reach the server, but their answers wait for releaseHeld. */
  holding: { method: string; suffix: string } | undefined;
  /** The answers held back so far, released in order by releaseHeld. */
  held: (() => void)[];
  /** What navigator.onLine would say. */
  online: boolean;
  serverNow: Date;
  /** The device's clock, in milliseconds. */
  deviceNow: number;
  storage: Map<string, string>;
  /** The delays of the timers asked for, in order. */
  delays: number[];
  /** The URL of every request the device made, in order. */
  requests: string[];
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
  /** The keys of the move queues kept in storage. */
  queued: () => string[];
  /** Lets every held answer through, and waits until what they started has settled. */
  releaseHeld: () => Promise<void>;
}

function environmentOf(world: World) {
  return {
    storage: {
      getItem: (key: string) => world.storage.get(key) ?? null,
      setItem: (key: string, value: string) => void world.storage.set(key, value),
      removeItem: (key: string) => void world.storage.delete(key),
      key: (index: number) => [...world.storage.keys()][index] ?? null,
      get length() {
        return world.storage.size;
      },
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

/** How long the device's API client waits for an answer: short, so a hanging request ends fast. */
const API_TIMEOUT_MS = 20;

const endsWith = (url: string, suffix: string | undefined) =>
  suffix !== undefined && url.endsWith(suffix);

/** A request that answers only by failing when its signal aborts. */
function hang(signal: AbortSignal | null | undefined): Promise<Response> {
  return new Promise((_resolve, reject) => {
    signal?.addEventListener('abort', () => {
      reject(new TypeError('aborted'));
    });
  });
}

/** A fetch that never answers: the request only ends when the client aborts it. */
export const neverAnswering: typeof fetch = (_input, init) => hang(init?.signal);

/** The answer of a broken server to `url`, if it is broken there. */
function brokenAnswer(world: World, url: string): Response | undefined {
  if (world.broken === undefined || !url.endsWith(world.broken.suffix)) return undefined;
  return Response.json({ error: 'broken' }, { status: world.broken.status });
}

/** Whether the answer to this request is held back (world.holding). */
function isHeld(world: World, url: string, init: RequestInit | undefined): boolean {
  const holding = world.holding;
  return holding !== undefined && init?.method === holding.method && url.endsWith(holding.suffix);
}

/** The server's answer to a request that reached it: lost or held back as `world` says. */
async function serverAnswer(world: World, app: Hono, url: string, init: RequestInit | undefined) {
  const answer = await app.request(url, init);
  if (endsWith(url, world.losingAnswers)) throw new TypeError('the answer was lost');
  if (isHeld(world, url, init)) await new Promise<void>((resolve) => world.held.push(resolve));
  return answer;
}

/** The network between the device and `app`, doing to each request what `world` says. */
function networkOver(world: World, app: Hono): typeof fetch {
  return async (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    world.requests.push(url);
    if (!world.reachable || endsWith(url, world.refused)) throw new TypeError('offline');
    if (endsWith(url, world.hanging)) return hang(init?.signal);
    const broken = brokenAnswer(world, url);
    if (broken !== undefined) return broken;
    return serverAnswer(world, app, url, init);
  };
}

function newWorld(): World {
  return {
    reachable: true,
    refused: undefined,
    losingAnswers: undefined,
    hanging: undefined,
    broken: undefined,
    holding: undefined,
    held: [],
    online: true,
    serverNow: new Date('2026-01-01T00:00:00.000Z'),
    deviceNow: 0,
    storage: new Map(),
    delays: [],
    requests: [],
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
  const api = createGameApi(tallyGame, '/api', networkOver(world, app), API_TIMEOUT_MS);
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
    queued: () => [...world.storage.keys()].filter((key) => key.startsWith('game-queue:')),
    releaseHeld: async () => {
      for (const release of world.held.splice(0)) release();
      await new Promise((resolve) => setImmediate(resolve));
    },
    runTimers: async () => {
      for (const run of world.timers.splice(0)) run();
      // The routes run on in-memory SQLite: everything they start settles before the next macrotask.
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
}

/** Taps each move at its device time, in order, waiting for each tap's sending to settle. */
export async function playAt<Move>(
  device: Device,
  driver: { move: (move: Move) => Promise<void> },
  ...taps: [number, Move][]
): Promise<void> {
  for (const [at, move] of taps) {
    device.world.deviceNow = at;
    await driver.move(move);
  }
}
