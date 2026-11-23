// The installed app: the production build on the Node server, with its service worker. Run by the
// `app` project only (playwright.config.ts); service workers are not used in Vite dev. The project
// has its own database, created empty for every run, so each test has its own fixed nickname.
import type { APIRequestContext, BrowserContext, Page } from '@playwright/test';
import { board, currentNickname, gameMessage, moves, openProfile, tile } from './support/app.ts';
import { AFTER_TILE_11, KNOWN_BOARD } from './support/boards.ts';
import { expect, test } from './support/harness.ts';
import { firstVisitLayoutShift } from './support/layout-shift.ts';
import { menu, menuButton } from './support/menu.ts';
import {
  controllerScript,
  fetchFromPage,
  isControlled,
  publishNewWorker,
  seedKnownGameHere,
  unwatchedPage,
  untilControlled,
  visit,
} from './support/installed.ts';

const OFFLINE_PLAYER = 'app-offline-player';
const KNOWN_PLAYER = 'app-known-player';

/** Opens the profile online and waits until the service worker controls the page. */
async function openInstalled(page: Page, nickname: string): Promise<void> {
  await openProfile(page, nickname);
  await untilControlled(page);
  await expect.poll(() => isControlled(page)).toBe(true);
}

async function expectWorkerHeaders(request: APIRequestContext): Promise<void> {
  const script = await request.get('/sliding-puzzle/sw.js');
  expect(script.headers()['service-worker-allowed']).toBe('/sliding-puzzle');
  expect(script.headers()['cache-control']).toBe('no-store');
}

async function expectManifestScope(request: APIRequestContext): Promise<void> {
  const manifest = await request.get('/sliding-puzzle/manifest.webmanifest');
  expect(await manifest.json()).toMatchObject({
    id: '/sliding-puzzle',
    start_url: '/sliding-puzzle',
    scope: '/sliding-puzzle',
  });
}

/** Offline with nothing waiting, a reload: the profile and its last confirmed game come back. */
async function reloadOffline(page: Page, context: BrowserContext): Promise<void> {
  await context.setOffline(true);
  await page.reload();
  await expect(board(page)).toHaveAttribute('data-board', KNOWN_BOARD);
  await expect(moves(page)).toHaveText('Moves: 0');
  expect(await currentNickname(page)).toBe(OFFLINE_PLAYER);
}

/** Back online: the queue is sent, and another browser sees the move. */
async function expectSentWhenOnline(
  page: Page,
  context: BrowserContext,
  other: Page,
): Promise<void> {
  await context.setOffline(false);
  await expect(gameMessage(page)).toHaveCount(0);
  await openProfile(other, OFFLINE_PLAYER);
  await expect(board(other)).toHaveAttribute('data-board', AFTER_TILE_11);
  await expect(moves(other)).toHaveText('Moves: 1');
}

test('the worker script, the manifest and the registration cover the app without a slash', async ({
  page,
  request,
}) => {
  await test.step('the worker script may control /sliding-puzzle and is never cached', () =>
    expectWorkerHeaders(request));
  await test.step('the manifest names /sliding-puzzle as its id, start and scope', () =>
    expectManifestScope(request));
  await test.step('the home page is controlled by a worker registered for /sliding-puzzle', async () => {
    await page.goto('/sliding-puzzle');
    expect(await untilControlled(page)).toMatch(/\/sliding-puzzle$/);
    await expect.poll(() => isControlled(page)).toBe(true);
  });
});

test('a profile played here opens offline, and a move made offline reaches the server', async ({
  page,
  context,
  otherBrowserPage,
  request,
}) => {
  await seedKnownGameHere(request, OFFLINE_PLAYER);
  await test.step('online, the profile and its game open', () =>
    openInstalled(page, OFFLINE_PLAYER));
  await test.step('offline with nothing waiting, a reload: the same profile and board come back', () =>
    reloadOffline(page, context));
  await test.step('still offline after the reload, a tap shows at once', async () => {
    await tile(page, 11).click();
    await expect(board(page)).toHaveAttribute('data-board', AFTER_TILE_11);
    await expect(moves(page)).toHaveText('Moves: 1');
  });
  await test.step('back online, another browser sees the move', () =>
    expectSentWhenOnline(page, context, otherBrowserPage));
});

test('a profile never opened on this device says offline that it cannot open', async ({
  page,
  context,
}) => {
  await test.step('online, one profile is played here', () => openInstalled(page, KNOWN_PLAYER));
  await test.step('offline, a new profile link explains and offers the known one', async () => {
    await context.setOffline(true);
    await page.goto('/sliding-puzzle/p/app-never-seen');
    await expect(page.getByTestId('profile-offline')).toContainText(
      'This profile cannot be opened offline',
    );
    await expect(page.getByTestId('offline-open-other')).toHaveText(
      'Play as app-known-player instead',
    );
  });
});

test('a path that only starts with the app name is not answered by the worker', async ({
  browser,
  baseURL,
}) => {
  // The expected 404 is logged by Chromium as a console error, so this page is not watched.
  const page = await unwatchedPage(browser, baseURL);
  await openInstalled(page, 'app-outside');
  expect(await visit(page, '/sliding-puzzle-x')).toEqual({ status: 404, fromServiceWorker: false });
  await page.context().close();
});

test('the api is always asked over the network, never from a cache', async ({ page }) => {
  await openInstalled(page, 'app-api');
  const first = await fetchFromPage(page, '/sliding-puzzle/api/health');
  const second = await fetchFromPage(page, '/sliding-puzzle/api/health');
  expect([first.fromServiceWorker(), second.fromServiceWorker()]).toEqual([false, false]);
});

test('a first visit on a slow phone moves nothing on screen while the game and the 3D board arrive', async ({
  page,
}) => {
  // Lighthouse fails above 0.1; the screen is one fixed grid (styles.ts), so almost nothing shifts.
  expect(await firstVisitLayoutShift(page)).toBeLessThanOrEqual(0.02);
});

test('a new version is offered, and Reload switches to it', async ({ page }) => {
  await openInstalled(page, 'app-update');
  await test.step('a new worker is published: the notice appears', async () => {
    await publishNewWorker(page);
    await expect(page.getByTestId('update-notice')).toContainText('A new version is ready.');
  });
  await test.step('Reload: the page reloads under the new worker', async () => {
    await Promise.all([page.waitForEvent('load'), page.getByTestId('update-reload').click()]);
    await expect(board(page)).toBeVisible();
    expect(await controllerScript(page)).toMatch(/\/sliding-puzzle\/sw\.js\?next$/);
  });
});

test('while a new version is offered, the corner buttons and the actions stay usable', async ({
  page,
}) => {
  await openInstalled(page, 'app-update-corners');
  await publishNewWorker(page);
  await expect(page.getByTestId('update-notice')).toContainText('A new version is ready.');

  await menuButton(page).click();

  await expect(menu(page)).toBeVisible();
});
