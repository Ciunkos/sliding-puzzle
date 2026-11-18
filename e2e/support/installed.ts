// Steps of the installed app: the production build on the Node server (the `app` project in
// playwright.config.ts), where the service worker runs. No expected values are decided here.
import type { APIRequestContext, Browser, Page, Response } from '@playwright/test';

/** Creates the profile and puts it on the known board through the test-only route. */
export async function seedKnownGameHere(
  request: APIRequestContext,
  nickname: string,
): Promise<void> {
  const created = await request.post('/sliding-puzzle/api/profiles', { data: { nickname } });
  const seeded = await request.post(
    `/sliding-puzzle/api/test/profiles/${nickname}/game/near-solved`,
  );
  if (!created.ok() || !seeded.ok())
    throw new Error(`could not seed the known game of ${nickname}`);
}

/** The scope of the page's service worker registration, once one is active. */
function readyScope(page: Page): Promise<string> {
  return page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
}

/** Whether a service worker controls the page. */
export function isControlled(page: Page): Promise<boolean> {
  return page.evaluate(() => navigator.serviceWorker.controller !== null);
}

/**
 * Waits until the service worker is active, then reloads once if it does not control the page yet
 * (it claims the page that installed it, so this is a safety net). Returns the registration scope.
 */
export async function untilControlled(page: Page): Promise<string> {
  const scope = await readyScope(page);
  if (!(await isControlled(page))) await page.reload();
  return scope;
}

/** Fetches `path` from inside the page and returns the response the browser saw. */
export async function fetchFromPage(page: Page, path: string): Promise<Response> {
  const [response] = await Promise.all([
    page.waitForResponse((candidate) => new URL(candidate.url()).pathname === path),
    page.evaluate(async (url) => (await fetch(url)).status, path),
  ]);
  return response;
}

/**
 * Publishes a "new version" of the service worker: the same script under another URL is, for the
 * browser, a new worker for the same scope, so it installs and then waits. (Playwright cannot
 * intercept the browser's own fetch of a worker script, so the file itself is not changed.)
 */
export async function publishNewWorker(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sliding-puzzle/sw.js?next', {
      scope: '/sliding-puzzle',
      updateViaCache: 'none',
    });
  });
}

/** The script URL of the worker that controls the page ('' when none does). */
export function controllerScript(page: Page): Promise<string> {
  return page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? '');
}

/**
 * A page in a new context of the same browser whose console is not watched: only for a request that
 * is expected to fail, such as a 404, which Chromium logs as a console error. Closed with its context.
 */
export async function unwatchedPage(browser: Browser, baseURL: string | undefined): Promise<Page> {
  const context = await browser.newContext({ baseURL });
  return context.newPage();
}

/** Opens `path` and returns its status and whether the service worker answered it. */
export async function visit(
  page: Page,
  path: string,
): Promise<{ status: number; fromServiceWorker: boolean }> {
  const response = await page.goto(path);
  if (response === null) throw new Error(`no response for ${path}`);
  return { status: response.status(), fromServiceWorker: response.fromServiceWorker() };
}
