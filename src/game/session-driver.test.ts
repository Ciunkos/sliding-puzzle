// The session driver over the real API client, the real routes and the in-memory database.
// The stand-ins are the outside world only (src/test-support/device.ts): network, storage, clocks, timers.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { adaDevice, type Device } from '../test-support/device.ts';
import type { TallyState } from '../test-support/tally-game.ts';
import { NOTICES, SessionDriver, type SessionView } from './session-driver.ts';

const QUEUE_KEY = 'sliding-puzzle:queue:tally:ada';
const ONE = { add: 1 };
const TWO = { add: 2 };
/** A queue kept in storage: 2 tapped on version 1 of a new game to 5, not yet sent. */
const STORED_QUEUE = JSON.stringify({
  confirmed: {
    state: { count: 0, target: 5 },
    initial: { count: 0, target: 5 },
    moves: 0,
    finished: false,
    version: 1,
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: null,
  },
  pending: [{ add: 2 }],
});
const MOVE_ON_V1 = '{"baseVersion":1,"move":{"add":3}}';

/** A driver for Ada's game on `device`; `shown()` is the last view it handed to the screen. */
function driverOn(device: Device) {
  const views: SessionView<TallyState>[] = [];
  const driver = new SessionDriver(device.api, 'Ada', { target: 5 }, device.environment, (view) =>
    views.push(view),
  );
  return Object.assign(driver, { shown: () => views.at(-1), views });
}

/** Ada's device with a game to `target`, and a driver that has loaded it. */
async function loaded(target: number) {
  const device = await adaDevice(target);
  const driver = driverOn(device);
  await driver.load();
  return { device, driver };
}

/** Like `loaded`, on a device that went offline after loading. */
async function loadedOffline(target: number) {
  const { device, driver } = await loaded(target);
  device.world.online = false;
  return { device, driver };
}

describe('the session driver', () => {
  test('loading resumes the game from the server and shows it, no longer busy', async () => {
    const { driver } = await loaded(5);

    assert.deepEqual(driver.shown(), {
      game: {
        state: { count: 0, target: 5 },
        initial: { count: 0, target: 5 },
        moves: 0,
        finished: false,
        version: 1,
        startedAt: '2026-01-01T00:00:00.000Z',
        finishedAt: null,
      },
      message: undefined,
      notice: undefined,
      busy: false,
      syncing: false,
      results: [],
    });
  });

  test('a load that cannot reach the server shows why and no game', async () => {
    const device = await adaDevice(5);
    device.world.reachable = false;
    const driver = driverOn(device);

    await driver.load();

    assert.partialDeepStrictEqual(driver.shown(), {
      game: undefined,
      message: 'Could not reach the server',
      busy: false,
    });
  });

  test('a tap shows at once, without busy, and is stored once the batch is answered', async () => {
    const { device, driver } = await loaded(5);

    // When 2 is tapped, before the server has answered
    const sending = driver.move(TWO);
    const shown = driver.shown();
    await sending;

    // Then the count showed at once, not busy but syncing; then the server has it, and it is synced
    const SHOWN = {
      game: { state: { count: 2, target: 5 }, moves: 1 },
      busy: false,
      syncing: true,
    };
    assert.partialDeepStrictEqual(shown, SHOWN);
    assert.partialDeepStrictEqual(await device.stored(), {
      state: { count: 2, target: 5 },
      moves: 1,
    });
    assert.partialDeepStrictEqual(driver.shown(), { syncing: false });
  });

  test('an illegal tap changes nothing and sends nothing', async () => {
    const { device, driver } = await loaded(5);

    await driver.move({ add: 4 });

    assert.partialDeepStrictEqual(driver.shown(), { game: { moves: 0 }, syncing: false });
    assert.partialDeepStrictEqual(await device.stored(), { moves: 0 });
    assert.equal(driver.elapsedMs(9000), 0);
  });

  test('offline, a tap is shown and kept with a notice, and sent when the connection returns', async () => {
    // Given a loaded game on a device that went offline
    const { device, driver } = await loadedOffline(5);

    // When 2 is tapped, then the connection returns
    await driver.move(TWO);
    const offline = driver.shown();
    device.world.online = true;
    await driver.online();

    // Then the player was told, and the server has the move
    assert.partialDeepStrictEqual(offline, { game: { moves: 1 }, message: NOTICES.offline });
    assert.partialDeepStrictEqual(await device.stored(), { moves: 1 });
    assert.partialDeepStrictEqual(driver.shown(), { message: undefined });
  });

  test('a failed send is retried after a backoff, and the retry stores it once', async () => {
    // Given a loaded game and a network that fails
    const { device, driver } = await loaded(5);
    device.world.reachable = false;

    // When 2 is tapped, then the network recovers and the scheduled retry runs
    await driver.move(TWO);
    device.world.reachable = true;
    await device.runTimers();

    // Then the retry waited 1 s, and the server has the move once
    assert.deepEqual(device.world.delays, [1000]);
    assert.partialDeepStrictEqual(await device.stored(), { moves: 1 });
  });

  test('each failure in a row doubles the wait before the next retry', async () => {
    const { device, driver } = await loaded(5);
    device.world.reachable = false;

    await driver.move(TWO);
    await device.runTimers();

    assert.deepEqual(device.world.delays, [1000, 2000]);
  });

  test('the connection coming back sends at once and starts the backoff over', async () => {
    const { device, driver } = await loaded(5);
    device.world.reachable = false;
    await driver.move(TWO);
    device.world.reachable = true;

    await driver.online();
    device.world.reachable = false;
    await driver.move(ONE);

    assert.deepEqual(device.world.delays, [1000, 1000]);
  });

  test('a queue stored before a reload is restored and sent', async () => {
    // Given a queue kept in storage, made on the version the server still has
    const device = await adaDevice(5);
    device.world.storage.set(QUEUE_KEY, STORED_QUEUE);

    // When the game loads
    await driverOn(device).load();

    // Then the move reached the server and the queue is forgotten
    assert.partialDeepStrictEqual(await device.stored(), {
      state: { count: 2, target: 5 },
      moves: 1,
    });
    assert.equal(device.world.storage.has(QUEUE_KEY), false);
  });

  test('a stored queue made on a version the game has moved past is dropped with a notice', async () => {
    const device = await adaDevice(5);
    await device.app.request('/api/profiles/Ada/games/tally/move', {
      method: 'POST',
      body: MOVE_ON_V1,
    });
    device.world.storage.set(QUEUE_KEY, STORED_QUEUE);
    const driver = driverOn(device);

    await driver.load();

    assert.partialDeepStrictEqual(driver.shown(), {
      game: { state: { count: 3, target: 5 } },
      message: NOTICES['server-newer'],
    });
  });

  test('a tap on a game that changed elsewhere shows the server game and says so', async () => {
    // Given a loaded game, then a move from another device
    const { device, driver } = await loaded(5);
    await device.app.request('/api/profiles/Ada/games/tally/move', {
      method: 'POST',
      body: MOVE_ON_V1,
    });

    // When 2 is tapped here
    await driver.move(TWO);

    // Then the other device's game wins
    assert.partialDeepStrictEqual(driver.shown(), {
      game: { state: { count: 3, target: 5 }, moves: 1 },
      notice: NOTICES['server-newer'],
      syncing: false,
    });
  });

  test('the finishing batch reports the play time, and the results are refreshed', async () => {
    // Given a game to 2: the first move at 1 s on the device, the finish at 4 s, 5 min on the server
    const { device, driver } = await loaded(2);
    device.world.deviceNow = 1000;
    await driver.move(ONE);
    device.world.deviceNow = 4000;
    device.world.serverNow = new Date('2026-01-01T00:05:00.000Z');

    // When the finishing move is made
    await driver.move(ONE);

    // Then the result has 3 s of play and the 5 min the server saw
    assert.partialDeepStrictEqual(driver.shown(), {
      results: [
        {
          variant: 'to 2',
          moves: 2,
          durationMs: 300_000,
          reportedMs: 3000,
          finishedAt: '2026-01-01T00:05:00.000Z',
        },
      ],
    });
    // and the clock stopped at the finish
    assert.equal(driver.elapsedMs(99_000), 3000);
  });

  test('the play time counts from the first move, and a reset starts it over', async () => {
    const { device, driver } = await loaded(5);
    device.world.deviceNow = 1000;
    await driver.move(ONE);
    const playing = driver.elapsedMs(4000);

    await driver.reset();

    assert.deepEqual([playing, driver.elapsedMs(9000)], [3000, 0]);
  });

  test('a reset right after a tap waits for its batch and resets the acknowledged version', async () => {
    const { device, driver } = await loaded(5);

    const tapped = driver.move(TWO);
    await driver.reset();
    await tapped;

    assert.partialDeepStrictEqual(await device.stored(), { moves: 0, version: 3 });
    assert.partialDeepStrictEqual(driver.shown(), {
      game: { moves: 0, version: 3 },
      message: undefined,
    });
  });

  test('a new game replaces the game, also on the server', async () => {
    const { device, driver } = await loaded(5);
    await driver.move(TWO);

    await driver.start();

    assert.partialDeepStrictEqual(await device.stored(), { moves: 0, version: 3 });
    assert.partialDeepStrictEqual(driver.shown(), { game: { moves: 0, version: 3 }, busy: false });
  });

  test('a shown tab sends what waits', async () => {
    const { device, driver } = await loaded(5);
    device.world.online = false;
    await driver.move(TWO);
    device.world.online = true;

    await driver.visibility(true);

    assert.partialDeepStrictEqual(await device.stored(), { moves: 1 });
  });

  test('a hidden tab stops the play time', async () => {
    const { device, driver } = await loaded(5);
    await driver.move(ONE);
    device.world.deviceNow = 2000;

    await driver.visibility(false);

    assert.equal(driver.elapsedMs(9000), 2000);
  });

  test('a disposed driver sends nothing more and shows nothing more', async () => {
    const { device, driver } = await loaded(5);
    const before = driver.views.length;

    driver.dispose();
    await driver.move(TWO);

    assert.partialDeepStrictEqual(await device.stored(), { moves: 0 });
    assert.equal(driver.views.length - before, 0);
  });

  test('an answer that arrives after the driver was disposed is ignored', async () => {
    const { driver } = await loaded(5);

    const sending = driver.move(TWO);
    driver.dispose();
    await sending;

    assert.partialDeepStrictEqual(driver.view(), { syncing: true });
  });

  test('before the first load, the driver is busy with no game, and a tap does nothing', async () => {
    const driver = driverOn(await adaDevice(5));

    await driver.move(TWO);

    assert.deepEqual(driver.view(), {
      game: undefined,
      message: undefined,
      notice: undefined,
      busy: true,
      syncing: false,
      results: [],
    });
  });

  test('a reset before the first load does nothing', async () => {
    const device = await adaDevice(5);
    const driver = driverOn(device);

    await driver.reset();

    assert.partialDeepStrictEqual(await device.stored(), { version: 1 });
    assert.equal(driver.views.length, 0);
  });

  test('a second reset while one runs is ignored', async () => {
    const { device, driver } = await loaded(5);

    await Promise.all([driver.reset(), driver.reset()]);

    assert.partialDeepStrictEqual(await device.stored(), { version: 2 });
  });

  test('a tap made while a batch is on the wire is sent after it', async () => {
    const { device, driver } = await loaded(5);

    await Promise.all([driver.move(ONE), driver.move(TWO)]);

    assert.partialDeepStrictEqual(await device.stored(), {
      state: { count: 3, target: 5 },
      moves: 2,
    });
  });

  test('offline with nothing waiting, there is no notice', async () => {
    const { driver } = await loadedOffline(5);

    await driver.flush();

    assert.partialDeepStrictEqual(driver.view(), { message: undefined });
  });

  test('a hidden tab sends nothing', async () => {
    const { device, driver } = await loadedOffline(5);
    await driver.move(TWO);
    device.world.online = true;

    await driver.visibility(false);

    assert.partialDeepStrictEqual(await device.stored(), { moves: 0 });
  });

  test('results that cannot be loaded leave the results empty without an error', async () => {
    const device = await adaDevice(5);
    device.world.refused = '/results';
    const driver = driverOn(device);

    await driver.load();

    assert.partialDeepStrictEqual(driver.shown(), { results: [], message: undefined, busy: false });
  });
});
