// The session driver over the real API client, the real routes and the in-memory database.
// The stand-ins are the outside world only (src/test-support/device.ts): network, storage, clocks, timers.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { adaDevice, type Device, playAt } from '../test-support/device.ts';
import type { TallyState } from '../test-support/tally-game.ts';
import { NOTICES, SessionDriver, type SessionView } from './session-driver.ts';

/** A record of a queue kept by a tab that is gone. */
const QUEUE_KEY = 'game-queue:tally:ada:left-by-a-closed-tab';
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
/** Another device adds 3 on version 1. */
const MOVE_ON_V1 = '{"baseVersion":1,"batchId":"other-device","moves":[{"add":3}]}';

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

const ADA_MOVES = '/api/profiles/Ada/games/tally/moves';
/** Another tab adds 1 on version 2. */
const ADD_ONE_ON_V2 = '{"baseVersion":2,"batchId":"other-tab-2","moves":[{"add":1}]}';
const COULD_NOT_SAVE = 'These moves could not be saved.';

/** A device whose network is down: no answers, and the browser knows it. */
function goOffline(device: Device): void {
  device.world.reachable = false;
  device.world.online = false;
}

/** The network is back, and the browser knows it. */
function goOnline(device: Device): void {
  device.world.reachable = true;
  device.world.online = true;
}

/** Closes the tab of `driver` and opens the profile again in a new one on the same device. */
async function reload(device: Device, driver: SessionDriver<TallyState, unknown, unknown>) {
  driver.dispose();
  const reloaded = driverOn(device);
  await reloaded.load();
  return reloaded;
}

/** Like `loaded`, on a device that went offline after loading. */
async function loadedOffline(target: number) {
  const { device, driver } = await loaded(target);
  device.world.online = false;
  return { device, driver };
}

/** Another tab resets Ada's game on `version`, a second after midnight on the server. */
async function resetElsewhere(device: Device, version: number): Promise<void> {
  device.world.serverNow = new Date('2026-01-01T00:00:01.000Z');
  const body = JSON.stringify({ baseVersion: version });
  await device.app.request('/api/profiles/Ada/games/tally/reset', { method: 'POST', body });
}

function closeAll(first: { dispose: () => void }, second: { dispose: () => void }): void {
  first.dispose();
  second.dispose();
}

/** Ada's game to 50: offline, 1 tapped, the page reloaded (still offline), then 2 tapped. */
async function tappedAcrossAnOfflineReload() {
  const { device, driver } = await loaded(50);
  goOffline(device);
  await driver.move(ONE);
  const reloaded = await reload(device, driver);
  await reloaded.move(TWO);
  return { device, reloaded };
}

/** Ada's game to `target` loaded online with nothing waiting, then reloaded offline. */
async function reloadedOffline(target: number) {
  const { device, driver } = await loaded(target);
  goOffline(device);
  const reloaded = await reload(device, driver);
  return { device, reloaded };
}

/** Ada's game to 50 after two tabs, offline, tapped 3 and 1 and were closed. Still offline. */
async function closedOfflineTabs(): Promise<Device> {
  const { device, first, second } = await twoTabs(50);
  goOffline(device);
  await playAt(device, first, [1, { add: 3 }]);
  await playAt(device, second, [2, ONE]);
  closeAll(first, second);
  return device;
}

/** Two tabs of Ada's profile on one device, both loaded. */
async function twoTabs(target: number) {
  const device = await adaDevice(target);
  const first = driverOn(device);
  const second = driverOn(device);
  await first.load();
  await second.load();
  return { device, first, second };
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
    assert.deepEqual(device.queued(), []);
  });

  test('a stored queue made on a version the game has moved past is dropped with a notice', async () => {
    const device = await adaDevice(5);
    await device.app.request('/api/profiles/Ada/games/tally/moves', {
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
    await device.app.request('/api/profiles/Ada/games/tally/moves', {
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

  test('a reload while offline shows the stored queue and keeps playing', async () => {
    // Given a tap made offline
    const { device, driver } = await loaded(50);
    goOffline(device);
    await driver.move(ONE);

    // When the page is reloaded, still offline, and another tap is made
    const reloaded = await reload(device, driver);
    await reloaded.move(TWO);

    // Then both taps show, and the player is told they wait for the connection
    assert.partialDeepStrictEqual(reloaded.shown(), {
      game: { state: { count: 3, target: 50 }, moves: 2 },
      message: NOTICES.offline,
      busy: false,
    });
  });

  test('after a reload while offline, every move is saved once the connection returns', async () => {
    const { device, reloaded } = await tappedAcrossAnOfflineReload();

    goOnline(device);
    await reloaded.online();

    assert.partialDeepStrictEqual(await device.stored(), {
      state: { count: 3, target: 50 },
      moves: 2,
    });
    assert.partialDeepStrictEqual(reloaded.shown(), { message: undefined, syncing: false });
  });

  test('a load that cannot reach the server is tried again until it answers', async () => {
    // Given a device that cannot reach the server, and nothing stored
    const device = await adaDevice(5);
    device.world.reachable = false;
    const driver = driverOn(device);
    await driver.load();

    // When the server is reachable again and the retry runs
    device.world.reachable = true;
    await device.runTimers();

    // Then the game is on screen
    assert.deepEqual(device.world.delays, [1000]);
    assert.partialDeepStrictEqual(driver.shown(), {
      game: { moves: 0 },
      message: undefined,
      busy: false,
    });
  });

  test(
    'a batch that never answers is given up, and a reset after it still resets',
    { timeout: 2000 },
    async () => {
      const { device, driver } = await loaded(5);
      device.world.hanging = '/moves';
      await driver.move(TWO);
      device.world.hanging = undefined;

      await driver.reset();

      assert.partialDeepStrictEqual(await device.stored(), { moves: 0 });
      assert.partialDeepStrictEqual(driver.shown(), { game: { moves: 0 }, busy: false });
    },
  );

  test('the play time survives a reload', async () => {
    // Given 60 s played up to the second move, then a reload at 70 s
    const { device, driver } = await loaded(5);
    await playAt(device, driver, [0, ONE], [60_000, ONE]);
    device.world.deviceNow = 70_000;
    const reloaded = await reload(device, driver);

    // When the game is finished 1 s after the reload, 10 min after it started on the server
    device.world.serverNow = new Date('2026-01-01T00:10:00.000Z');
    await playAt(device, reloaded, [70_500, ONE], [71_000, TWO]);

    // Then 61 s of play are reported
    assert.partialDeepStrictEqual(reloaded.shown(), {
      results: [{ moves: 4, reportedMs: 61_000 }],
    });
  });

  test('a finishing tap that the server rejects resumes the play time', async () => {
    // Given a game to 3: 1 tapped at 0 s, then 1 added in another tab
    const { device, driver } = await loaded(3);
    await playAt(device, driver, [0, ONE]);
    await device.app.request(ADA_MOVES, { method: 'POST', body: ADD_ONE_ON_V2 });

    // When the finishing tap at 2 s is rejected, and the game is finished at 5 s (5 min on the server)
    await playAt(device, driver, [2000, TWO]);
    device.world.serverNow = new Date('2026-01-01T00:05:00.000Z');
    await playAt(device, driver, [5000, ONE]);

    // Then the play time counted on after the rejection: 5 s
    assert.partialDeepStrictEqual(driver.shown(), { results: [{ moves: 3, reportedMs: 5000 }] });
  });

  test('a game reset in another tab restarts the play time', async () => {
    // Given 1 s played on a game to 3, then a reset in another tab, then a tap at 2 s
    const { device, driver } = await loaded(3);
    await playAt(device, driver, [0, ONE], [1000, ONE]);
    await resetElsewhere(device, 3);
    await playAt(device, driver, [2000, ONE]);

    // When the reset game is played from 10 s and finished at 300 s, 5 min on the server
    device.world.serverNow = new Date('2026-01-01T00:05:01.000Z');
    await playAt(device, driver, [10_000, ONE], [300_000, TWO]);

    // Then the play time counts from the first move of the reset game: 290 s
    assert.partialDeepStrictEqual(driver.shown(), { results: [{ reportedMs: 290_000 }] });
  });

  test('a batch the server can never accept is dropped, and the player is told', async () => {
    const { device, driver } = await loaded(5);
    device.world.broken = { suffix: '/moves', status: 400 };

    await driver.move(TWO);

    assert.partialDeepStrictEqual(driver.shown(), { game: { moves: 0 }, message: COULD_NOT_SAVE });
    assert.deepEqual([device.queued(), device.world.delays], [[], []]);
  });

  test('moves two tabs made offline are all saved when the profile is opened again', async () => {
    // Given two tabs, offline: 3 and 3 tapped in the first, 1 in the second, then both closed
    const { device, first, second } = await twoTabs(50);
    goOffline(device);
    await playAt(device, first, [1, { add: 3 }], [2, { add: 3 }]);
    await playAt(device, second, [3, ONE]);
    closeAll(first, second);

    // When the profile is opened again online
    goOnline(device);
    await driverOn(device).load();

    // Then every move of both tabs is saved
    assert.partialDeepStrictEqual(await device.stored(), {
      state: { count: 7, target: 50 },
      moves: 3,
    });
  });

  test('a reset after a batch whose answer was lost resets the game', async () => {
    const { device, driver } = await loaded(5);
    device.world.losingAnswers = '/moves';
    await driver.move(TWO);
    device.world.losingAnswers = undefined;

    await driver.reset();

    assert.partialDeepStrictEqual(await device.stored(), { moves: 0, version: 3 });
    assert.partialDeepStrictEqual(driver.shown(), { game: { moves: 0 }, message: undefined });
  });

  test('a reset after the game moved on elsewhere resets the newer game', async () => {
    const { device, driver } = await loaded(5);
    await device.app.request('/api/profiles/Ada/games/tally/moves', {
      method: 'POST',
      body: MOVE_ON_V1,
    });

    await driver.reset();

    assert.partialDeepStrictEqual(await device.stored(), { moves: 0, version: 3 });
    assert.partialDeepStrictEqual(driver.shown(), { game: { moves: 0 }, message: undefined });
  });

  test('a reset of a finished game sends nothing and keeps the finished game', async () => {
    const { device, driver } = await loaded(2);
    await driver.move(TWO);

    await driver.reset();

    assert.partialDeepStrictEqual(await device.stored(), { finished: true, version: 2 });
    assert.partialDeepStrictEqual(driver.shown(), { game: { finished: true }, message: undefined });
  });

  test('a load while the browser says it is offline sends nothing and shows the stored queue', async () => {
    // Given a tap made offline and kept in storage, and a browser that still says it is offline
    const { device, reloaded } = await tappedAcrossAnOfflineReload();
    device.world.requests = [];

    // When the page is loaded again
    const again = await reload(device, reloaded);

    // Then the stored queue is shown, and no request was made
    assert.partialDeepStrictEqual(again.shown(), { game: { moves: 2 }, message: NOTICES.offline });
    assert.deepEqual(device.world.requests, []);
  });

  test('a reset that cannot reach the server says so and keeps the game', async () => {
    const { device, driver } = await loaded(5);
    await driver.move(TWO);
    device.world.reachable = false;

    await driver.reset();

    assert.partialDeepStrictEqual(driver.shown(), {
      game: { moves: 1 },
      message: 'Could not reach the server',
      busy: false,
    });
  });

  test('a reset is busy until it is answered', async () => {
    const { driver } = await loaded(5);

    const resetting = driver.reset();
    const during = driver.shown();
    await resetting;

    assert.partialDeepStrictEqual([during, driver.shown()], [{ busy: true }, { busy: false }]);
  });

  test('a reset of a game finished in another tab shows that finished game', async () => {
    const { device, driver } = await loaded(3);
    await device.app.request(ADA_MOVES, { method: 'POST', body: MOVE_ON_V1 });

    await driver.reset();

    assert.partialDeepStrictEqual(driver.shown(), {
      game: { finished: true, version: 2 },
      notice: NOTICES['server-newer'],
    });
  });

  test('a reset after a batch that never arrived sends that batch first', async () => {
    const { device, driver } = await loaded(5);
    device.world.refused = '/moves';
    await driver.move(TWO);
    device.world.refused = undefined;

    await driver.reset();

    assert.partialDeepStrictEqual(await device.stored(), { moves: 0, version: 3 });
  });

  test('a tap during a reset is not sent: the reset replaces it', async () => {
    const { device, driver } = await loaded(5);

    const resetting = driver.reset();
    await driver.move(TWO);
    await resetting;

    assert.partialDeepStrictEqual(await device.stored(), { moves: 0, version: 2 });
  });

  test('two loads at once ask the server once', async () => {
    const device = await adaDevice(5);
    const driver = driverOn(device);
    device.world.requests = [];

    await Promise.all([driver.load(), driver.load()]);

    assert.deepEqual(device.world.requests, [
      '/api/profiles/Ada/games/tally',
      '/api/profiles/Ada/games/tally/results',
    ]);
  });

  test('a load whose answer arrives after the driver was disposed shows nothing', async () => {
    const driver = driverOn(await adaDevice(5));

    const loading = driver.load();
    driver.dispose();
    await loading;

    assert.equal(driver.views.length, 0);
  });

  test('the stored queue shown before the server answered is not sent until it is reconciled', async () => {
    const device = await adaDevice(5);
    device.world.storage.set(QUEUE_KEY, STORED_QUEUE);
    device.world.reachable = false;
    const driver = driverOn(device);
    await driver.load();

    device.world.reachable = true;
    await driver.flush();

    assert.partialDeepStrictEqual(await device.stored(), { moves: 0 });
  });

  test('the queues of two closed offline tabs, shown offline and then sent, are each sent once', async () => {
    // Given two tabs, offline: 3 tapped in the first, 1 in the second, both closed
    const device = await closedOfflineTabs();

    // When the profile is opened offline, then the connection returns
    const third = driverOn(device);
    await third.load();
    goOnline(device);
    await third.online();

    // Then both moves are saved once
    assert.partialDeepStrictEqual(await device.stored(), {
      state: { count: 4, target: 50 },
      moves: 2,
    });
  });

  test('a new game started after a load that failed is played online', async () => {
    const device = await adaDevice(5);
    device.world.reachable = false;
    const driver = driverOn(device);
    await driver.load();
    device.world.reachable = true;

    await driver.start();
    await driver.move(TWO);

    assert.partialDeepStrictEqual(await device.stored(), { moves: 1 });
  });

  test('a refused batch whose game cannot be reloaded says the moves could not be saved and retries', async () => {
    const { device, driver } = await loaded(5);
    device.world.broken = { suffix: '/moves', status: 400 };
    device.world.refused = '/tally';

    await driver.move(TWO);

    assert.partialDeepStrictEqual(driver.shown(), { message: COULD_NOT_SAVE });
    assert.deepEqual(device.world.delays, [1000]);
  });

  test('a reload while offline after everything was saved still shows the game', async () => {
    // Given a game to 50 loaded online with nothing waiting, reloaded after the network went down
    const { device, reloaded } = await reloadedOffline(50);

    // When 2 is tapped, and the connection returns
    const shown = reloaded.shown();
    await reloaded.move(TWO);
    goOnline(device);
    await reloaded.online();

    // Then the confirmed game was on screen, and the tap reached the server for every device
    assert.partialDeepStrictEqual(shown, {
      game: { state: { count: 0, target: 50 }, moves: 0, version: 1 },
      message: NOTICES.offline,
      busy: false,
    });
    assert.partialDeepStrictEqual(await device.stored(), {
      state: { count: 2, target: 50 },
      moves: 1,
    });
    assert.partialDeepStrictEqual(reloaded.shown(), { message: undefined, syncing: false });
  });

  test('a tap made offline on the confirmed game gives way to a game changed elsewhere', async () => {
    // Given a game to 50 reloaded offline with nothing waiting, and 2 tapped there
    const { device, reloaded } = await reloadedOffline(50);
    await reloaded.move(TWO);

    // When another device adds 3, then the connection returns
    await device.app.request(ADA_MOVES, { method: 'POST', body: MOVE_ON_V1 });
    goOnline(device);
    await reloaded.online();

    // Then the other device's game wins, and the player is told
    assert.partialDeepStrictEqual(reloaded.shown(), {
      game: { state: { count: 3, target: 50 }, moves: 1, version: 2 },
      message: NOTICES['server-newer'],
    });
  });

  test('the game confirmed on reconnecting replaces the older one shown offline', async () => {
    // Given a game reloaded offline, then changed by another device, then the connection returns
    const { device, reloaded: offline } = await reloadedOffline(50);
    await device.app.request(ADA_MOVES, { method: 'POST', body: MOVE_ON_V1 });
    goOnline(device);
    await offline.online();

    // When the page is reloaded offline again
    goOffline(device);
    const again = await reload(device, offline);

    // Then the game the server confirmed last is shown
    assert.partialDeepStrictEqual(again.shown(), {
      game: { state: { count: 3, target: 50 }, version: 2 },
    });
  });

  test('a new game is the game shown after a reload while offline', async () => {
    const { device, driver } = await loaded(5);
    await driver.move(TWO);
    await driver.start();
    goOffline(device);

    const reloaded = await reload(device, driver);

    assert.partialDeepStrictEqual(reloaded.shown(), { game: { moves: 0, version: 3 } });
  });

  test('a finished game reloaded offline is shown finished and takes no moves', async () => {
    const { device, driver } = await loaded(2);
    await driver.move(TWO);
    goOffline(device);

    const reloaded = await reload(device, driver);
    await reloaded.move(ONE);

    assert.partialDeepStrictEqual(reloaded.shown(), {
      game: { state: { count: 2, target: 2 }, finished: true, moves: 1 },
      syncing: false,
    });
    assert.deepEqual(device.queued(), []);
  });

  test('a queue shown offline does not replace the newer confirmed game kept for this profile', async () => {
    // Given a closed tab's queue on version 1, and a game confirmed later on version 2
    const { device, driver } = await loaded(50);
    await driver.move(TWO);
    device.world.storage.set(QUEUE_KEY, STORED_QUEUE);
    goOffline(device);

    // When the page is reloaded offline: the stored queue is shown
    const reloaded = await reload(device, driver);

    // Then the kept confirmed game is still version 2
    assert.partialDeepStrictEqual(reloaded.shown(), { game: { version: 1 } });
    const kept: unknown = JSON.parse(String(device.world.storage.get('game-confirmed:tally:ada')));
    assert.partialDeepStrictEqual(kept, { moves: 1, version: 2 });
  });

  test('a tab that has not heard of a newer game does not replace the one kept for this profile', async () => {
    // Given two tabs on version 1, and 2 tapped and saved in the first (version 2)
    const { device, first, second } = await twoTabs(50);
    await playAt(device, first, [1, TWO]);
    goOffline(device);

    // When 1 is tapped offline in the second tab, still on version 1
    await playAt(device, second, [2, ONE]);

    // Then the kept confirmed game is still version 2
    const kept: unknown = JSON.parse(String(device.world.storage.get('game-confirmed:tally:ada')));
    assert.partialDeepStrictEqual(kept, { moves: 1, version: 2 });
  });

  test('the play time of a tab hidden and shown again counts only while it is shown', async () => {
    const { device, driver } = await loaded(5);
    await playAt(device, driver, [0, ONE]);

    device.world.deviceNow = 2000;
    await driver.visibility(false);
    device.world.deviceNow = 5000;
    await driver.visibility(true);

    assert.equal(driver.elapsedMs(6000), 3000);
  });

  test('before the first load there is no play time, and visibility changes nothing', async () => {
    const driver = driverOn(await adaDevice(5));

    await driver.visibility(false);

    assert.equal(driver.elapsedMs(9000), 0);
  });
});
