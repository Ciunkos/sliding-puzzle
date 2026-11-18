// Shows the app working: builds it, serves it with the Node server on a free port (a throwaway
// database, test routes on), and plays the critical flow in a real Chromium on a phone viewport with
// touch. One line per step, a screenshot per step in verify-out/, exit 1 at the first failure. It
// always stops the server it started (its own PID only). Usage: npm run verify
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, openSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium, devices, expect } from '@playwright/test';

const OUT = 'verify-out';
const DEVICE = devices['Pixel 7'];
/** The board the test route seeds: the solved board with tile 15 slid once (see e2e/support/boards.ts). */
const NEAR_SOLVED = '1,2,3,4,5,6,7,8,9,10,11,12,13,14,0,15';
const SCENE_TIMEOUT = 30_000;

/** A port nobody listens on right now. */
function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, () => {
      const address = server.address();
      server.close(() => {
        resolve(typeof address === 'object' && address !== null ? address.port : 0);
      });
    });
  });
}

async function waitForHealth(origin, server) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`the server exited with ${server.exitCode}`);
    try {
      if ((await globalThis.fetch(`${origin}/sliding-puzzle/api/health`)).ok) return;
    } catch {
      // Not listening yet.
    }
    await sleep(100);
  }
  throw new Error(`the server at ${origin} did not answer its health check`);
}

// ---- What the steps look at -------------------------------------------------------------------

const board = (page) => page.getByTestId('board');
const moves = (page) => page.getByTestId('moves');
const boardText = (page) => board(page).getAttribute('data-board');
const nickname = async (page) => (await page.getByTestId('current-profile').textContent()) ?? '';

/** A tile next to the blank, and the direction from it to the blank (one of dx, dy is 0). */
function slidable(boardValue) {
  const cells = boardValue.split(',').map(Number);
  const size = Math.round(Math.sqrt(cells.length));
  const blank = cells.indexOf(0);
  const [row, col] = [Math.floor(blank / size), blank % size];
  const near = [
    [row - 1, col],
    [row + 1, col],
    [row, col - 1],
    [row, col + 1],
  ].find(([r, c]) => r >= 0 && r < size && c >= 0 && c < size);
  return { tile: cells[near[0] * size + near[1]], dx: col - near[1], dy: row - near[0] };
}

/** A finger drag over `number` towards the blank, as real touch events (the board reads pointers). */
async function swipeTile(page, cdp, move) {
  const box = await page.getByTestId(`tile-${String(move.tile)}`).boundingBox();
  if (box === null) throw new Error(`tile ${String(move.tile)} is not on screen`);
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  const touch = (type, points) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  await touch('touchStart', [{ x, y }]);
  for (let step = 1; step <= 6; step++) {
    const f = (0.6 * step) / 6;
    await touch('touchMove', [{ x: x + move.dx * box.width * f, y: y + move.dy * box.height * f }]);
  }
  await touch('touchEnd', []);
}

async function untilControlled(page) {
  await page.waitForFunction('navigator.serviceWorker.controller !== null', null, {
    timeout: 15_000,
  });
}

// ---- The flow ---------------------------------------------------------------------------------

/** Each step does one thing a player does, checks what they would see, and leaves a screenshot. */
function steps(origin, browser) {
  const state = {};
  return [
    [
      'first visit gets a generated profile and a game',
      'first-visit',
      async ({ page }) => {
        await page.goto(`${origin}/sliding-puzzle`);
        await expect(board(page)).toBeVisible();
        await expect(page).toHaveURL(/\/sliding-puzzle\/p\/[^/]+$/);
        state.nickname = await nickname(page);
        await expect(moves(page)).toHaveText('Moves: 0');
      },
    ],
    [
      'a tap on a tile next to the blank moves it',
      'tap',
      async ({ page }) => {
        const before = await boardText(page);
        await page.getByTestId(`tile-${String(slidable(before).tile)}`).tap();
        await expect(moves(page)).toHaveText('Moves: 1');
        await expect(board(page)).not.toHaveAttribute('data-board', before);
      },
    ],
    [
      'a swipe on a tile moves it',
      'swipe',
      async ({ page, cdp }) => {
        await swipeTile(page, cdp, slidable(await boardText(page)));
        await expect(moves(page)).toHaveText('Moves: 2');
        state.board = await boardText(page);
      },
    ],
    [
      'after a refresh the same game is back',
      'refresh',
      async ({ page }) => {
        await page.reload();
        await expect(board(page)).toHaveAttribute('data-board', state.board);
        await expect(moves(page)).toHaveText('Moves: 2');
      },
    ],
    [
      'the share URL opens the same game in another browser',
      'share-url',
      async ({ page }) => {
        const other = await browser.newContext({ ...DEVICE });
        const otherPage = await other.newPage();
        await otherPage.goto(page.url());
        await expect(board(otherPage)).toHaveAttribute('data-board', state.board);
        await expect(moves(otherPage)).toHaveText('Moves: 2');
        await otherPage.screenshot({
          path: join(OUT, '05b-share-url-other-browser.png'),
          animations: 'disabled',
        });
        await other.close();
      },
    ],
    [
      'the near-solved board (test route) is solved with a tap, and the win shows',
      'win',
      async ({ page }) => {
        const seeded = await page.request.post(
          `${origin}/sliding-puzzle/api/test/profiles/${state.nickname}/game/near-solved`,
        );
        if (!seeded.ok()) throw new Error(`the test route answered ${String(seeded.status())}`);
        await page.reload();
        await expect(board(page)).toHaveAttribute('data-board', NEAR_SOLVED);
        await page.getByTestId('tile-15').tap();
        await expect(page.getByTestId('solved-banner')).toBeVisible();
      },
    ],
    [
      'a picture skin replaces the numbers',
      'picture-skin',
      async ({ page }) => {
        await page.getByTestId('skin-picker').locator('summary').tap();
        await page.getByTestId('skin-rocket').tap();
        await expect(board(page)).toHaveAttribute('data-skin', 'rocket');
      },
    ],
    [
      '3D on draws the 3D board',
      '3d-on',
      async ({ page }) => {
        const toggle = page.getByTestId('toggle-3d');
        if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.tap();
        await expect(page.getByTestId('scene')).toHaveAttribute('data-webgl', 'ready', {
          timeout: SCENE_TIMEOUT,
        });
      },
    ],
    [
      '3D off leaves the flat board',
      '3d-off',
      async ({ page }) => {
        await page.getByTestId('toggle-3d').tap();
        await expect(page.getByTestId('toggle-3d')).toHaveAttribute('aria-pressed', 'false');
        await expect(page.getByTestId('scene')).toHaveCount(0);
        await expect(board(page)).toBeVisible();
      },
    ],
    [
      'offline: a reload still opens the game, and a move shows at once',
      'offline',
      async ({ page, context }) => {
        await page.getByTestId('new-game').tap();
        await expect(moves(page)).toHaveText('Moves: 0');
        await untilControlled(page);
        await context.setOffline(true);
        await page.reload();
        await expect(board(page)).toBeVisible();
        await page.getByTestId(`tile-${String(slidable(await boardText(page)).tile)}`).tap();
        await expect(moves(page)).toHaveText('Moves: 1');
        await expect(page.getByTestId('game-notice')).toBeVisible();
      },
    ],
    [
      'back online: the offline move is saved',
      'online',
      async ({ page, context }) => {
        await context.setOffline(false);
        await expect(page.getByTestId('game-notice')).toHaveCount(0, { timeout: 15_000 });
        await page.reload();
        await expect(moves(page)).toHaveText('Moves: 1');
      },
    ],
  ];
}

/** Runs the steps in order; returns the screenshot paths, or throws at the first failure. */
async function play(origin, browser) {
  const context = await browser.newContext({ ...DEVICE });
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (error) => problems.push(error.message));
  const cdp = await context.newCDPSession(page);
  const shots = [];
  for (const [index, [name, slug, run]] of steps(origin, browser).entries()) {
    const shot = join(OUT, `${String(index + 1).padStart(2, '0')}-${slug}.png`);
    try {
      await run({ page, context, cdp });
      if (problems.length > 0) throw new Error(`the page threw: ${problems.join('; ')}`);
    } catch (error) {
      await page.screenshot({ path: shot, animations: 'disabled' }).catch(() => undefined);
      console.log(
        `  FAIL  ${name}\n        ${String(error.message).split('\n')[0]}\n        ${shot}`,
      );
      throw new Error(`step ${String(index + 1)} failed`, { cause: error });
    }
    await page.screenshot({ path: shot, animations: 'disabled' });
    shots.push(shot);
    console.log(`  pass  ${name}`);
  }
  return shots;
}

async function main() {
  console.log('verify: building');
  // The build's own warnings are not this script's news; its output is shown only when it fails.
  try {
    execFileSync('npm', ['run', 'build', '--silent'], { stdio: 'pipe' });
  } catch (error) {
    console.error(`verify: the build failed\n${String(error.stdout)}${String(error.stderr)}`);
    process.exit(1);
  }
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const dir = mkdtempSync(join(tmpdir(), 'verify-'));
  const port = await freePort();
  const origin = `http://localhost:${String(port)}`;
  const log = openSync(join(OUT, 'server.log'), 'w');
  const server = spawn('node', ['src/server/node.ts'], {
    stdio: ['ignore', log, log],
    env: {
      ...process.env,
      PORT: String(port),
      DB_PATH: join(dir, 'verify.db'),
      ENABLE_TEST_ROUTES: '1',
    },
  });
  const stop = () => server.exitCode === null && server.kill('SIGTERM');
  process.on('SIGINT', () => {
    stop();
    process.exit(130);
  });
  let browser;
  try {
    await waitForHealth(origin, server);
    console.log(
      `verify: server ${origin} (pid ${String(server.pid)}), ${DEVICE.viewport.width}x${DEVICE.viewport.height} touch`,
    );
    browser = await chromium.launch({ channel: 'chromium' });
    const shots = await play(origin, browser);
    console.log(`verify: all ${String(shots.length)} steps passed. Screenshots:`);
    for (const shot of [...shots, join(OUT, '05b-share-url-other-browser.png')].sort())
      console.log(`  ${shot}`);
  } catch (error) {
    console.error(`verify: FAILED (${error.message}). Server log: ${join(OUT, 'server.log')}`);
    process.exitCode = 1;
  } finally {
    await browser?.close();
    stop();
    rmSync(dir, { recursive: true, force: true });
  }
}

await main();
