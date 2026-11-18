// The deploy rehearsal: the production build on `wrangler dev`, the Worker runtime with a local D1
// that every migration ran on, as Cloudflare runs it. Run by the `worker` project only
// (playwright.config.ts). No test-only routes: the Worker never mounts them.
import type { APIRequestContext } from '@playwright/test';
import {
  board,
  currentNickname,
  movableTiles,
  moves,
  openProfileUntilMoves,
} from './support/app.ts';
import { expect, test } from './support/harness.ts';

/** Where `from` redirects to, after checking that it is a permanent redirect. */
async function redirectTarget(request: APIRequestContext, from: string): Promise<string> {
  const res = await request.get(from, { maxRedirects: 0 });
  expect(res.status()).toBe(301);
  return String(res.headers().location);
}

async function expectShell(request: APIRequestContext, path: string) {
  const res = await request.get(path, { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('text/html');
  expect(await res.text()).toContain('<div id="root">');
}

async function expectNotFound(request: APIRequestContext, path: string) {
  const res = await request.get(path, { maxRedirects: 0 });
  expect(res.status()).toBe(404);
  expect(String(res.headers()['content-type'])).not.toContain('text/html');
  expect(String(res.headers()['cache-control'])).not.toContain('immutable');
}

test('the Worker answers the canonical paths: redirects keep the query, the rest is not the shell', async ({
  request,
}) => {
  await test.step('the slashed forms are 301s to the slash-less ones, with the query', async () => {
    expect(await redirectTarget(request, '/sliding-puzzle/?from=link')).toBe(
      '/sliding-puzzle?from=link',
    );
    expect(await redirectTarget(request, '/sliding-puzzle/p/ada/?x=1')).toBe(
      '/sliding-puzzle/p/ada?x=1',
    );
  });
  await test.step('the home page and a profile page are the shell', async () => {
    await expectShell(request, '/sliding-puzzle');
    await expectShell(request, '/sliding-puzzle/p/ada');
  });
  await test.step('a missing hashed file and a look-alike prefix are 404, never kept', async () => {
    await expectNotFound(request, '/sliding-puzzle/assets/missing-0000.js');
    await expectNotFound(request, '/sliding-puzzle-x');
  });
});

test('the Worker serves the service worker and the manifest for /sliding-puzzle', async ({
  request,
}) => {
  const script = await request.get('/sliding-puzzle/sw.js');
  expect(script.headers()['service-worker-allowed']).toBe('/sliding-puzzle');
  expect(script.headers()['cache-control']).toBe('no-store');
  const manifest = await request.get('/sliding-puzzle/manifest.webmanifest');
  expect(await manifest.json()).toMatchObject({
    id: '/sliding-puzzle',
    start_url: '/sliding-puzzle',
    scope: '/sliding-puzzle',
  });
});

test('without a token analytics is off and the proxy refuses a GET', async ({ request }) => {
  const config = await request.get('/sliding-puzzle/analytics-config');
  expect(config.headers()['cache-control']).toBe('no-store');
  expect(await config.json()).toEqual({ enabled: false });
  const proxy = await request.get('/sliding-puzzle/ph/e/');
  expect(proxy.status()).toBe(404);
});

test('a first visit on D1 gets a profile and a game, and its move is seen by another browser', async ({
  page,
  otherBrowserPage,
}) => {
  await test.step('the first visit generates a profile and shows its game', async () => {
    await page.goto('/sliding-puzzle');
    await expect(board(page)).toBeVisible();
    await expect(page).toHaveURL(/\/sliding-puzzle\/p\/[^/]+$/);
  });
  await test.step('a move is saved', async () => {
    await movableTiles(page).first().click();
    await expect(moves(page)).toHaveText('Moves: 1');
  });
  await test.step('another browser opening the profile sees the move', async () => {
    await openProfileUntilMoves(otherBrowserPage, await currentNickname(page), 'Moves: 1');
  });
});

test('the usage statistics switch in the footer is remembered by this browser', async ({
  page,
}) => {
  const usage = page.getByTestId('usage-toggle');
  await page.goto('/sliding-puzzle');
  await expect(usage).toHaveText('Usage statistics: on');
  await test.step('switching off is kept, and still off after a reload', async () => {
    await usage.click();
    await expect(usage).toHaveText('Usage statistics: off');
    await page.reload();
    await expect(usage).toHaveText('Usage statistics: off');
  });
  await test.step('switching on again is kept too', async () => {
    await usage.click();
    await page.reload();
    await expect(usage).toHaveText('Usage statistics: on');
  });
});
