// Steps and locators of the app under test. No expected values are decided here.
import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { expect } from './harness.ts';
import { openMenu } from './menu.ts';

/** The isolated API started by playwright.config.ts with ENABLE_TEST_ROUTES=1, under the app's prefix. */
const API_BASE = 'http://localhost:8788/sliding-puzzle/api';

export const board = (page: Page) => page.getByTestId('board');
export const moves = (page: Page) => page.getByTestId('moves');
export const tile = (page: Page, number: number) => page.getByTestId(`tile-${String(number)}`);
export const solvedBanner = (page: Page) => page.getByTestId('solved-banner');
export const profileNotice = (page: Page) => page.getByTestId('profile-notice');
export const invalidProfile = (page: Page) => page.getByTestId('invalid-profile');

/** Opens a profile by its URL, the way a shared link does, and waits until its game is on screen. */
export async function openProfile(page: Page, nickname: string): Promise<void> {
  await page.goto(`/sliding-puzzle/p/${nickname}`);
  await expect(board(page)).toBeVisible();
}

/** The nickname the screen says is playing. */
export async function currentNickname(page: Page): Promise<string> {
  return (await page.getByTestId('current-profile').textContent()) ?? '';
}

/**
 * Creates the profile (if new) and puts it into the known board through the test-only route: the
 * solved board with tile 15 slid once, so tiles 11, 14 and 15 are the movable ones.
 */
export async function seedKnownGame(request: APIRequestContext, nickname: string): Promise<void> {
  const created = await request.post(`${API_BASE}/profiles`, { data: { nickname } });
  expect(created).toBeOK();
  const seeded = await request.post(`${API_BASE}/test/profiles/${nickname}/game/near-solved`);
  expect(seeded).toBeOK();
}

/** Seeds the known board for the profile, then opens it by URL. */
export async function startKnownGame(
  page: Page,
  request: APIRequestContext,
  nickname: string,
): Promise<void> {
  await seedKnownGame(request, nickname);
  await openProfile(page, nickname);
}

/** Opens "Switch profile" and plays as the typed nickname, without waiting for the outcome. */
export async function switchTo(page: Page, nickname: string): Promise<void> {
  await openSwitcher(page);
  await page.getByTestId('nickname-input').fill(nickname);
  await page.getByTestId('profile-submit').click();
}

/** Opens the menu and its "Switch profile" disclosure (it stays open once opened). */
export async function openSwitcher(page: Page): Promise<void> {
  await openMenu(page);
  const switcher = page.getByTestId('switch-profile');
  if ((await switcher.getAttribute('open')) === null) {
    await switcher.locator('summary').click();
  }
}

/** Tile buttons that can slide now: tiles that cannot are aria-disabled (they stay focusable). */
export const movableTiles = (page: Page) =>
  page.locator('button[data-testid^="tile-"]:not([aria-disabled="true"])');
/** The button that starts a new game of `size` x `size`. */
export const sizeChoice = (page: Page, size: number) => page.getByTestId(`size-${String(size)}`);

/** The game's message line: an error, or a notice such as being offline. */
export const gameMessage = (page: Page) => page.getByTestId('game-error');

/**
 * Opens the profile in `page` until it shows `movesText`: the browser that played may still be
 * sending its moves, so a page that opened too early is opened again.
 */
export async function openProfileUntilMoves(
  page: Page,
  nickname: string,
  movesText: string,
): Promise<void> {
  await expect(async () => {
    await openProfile(page, nickname);
    await expect(moves(page)).toHaveText(movesText, { timeout: 1000 });
  }).toPass();
}

/** The play time next to the move count, e.g. "0:07". */
export const timer = (page: Page) => page.getByTestId('timer');
/** The line under the win banner: the play time, and "New best!" for a personal best. */
export const winResult = (page: Page) => page.getByTestId('result');
/** The best results on the current board size. */
export const bestList = (page: Page) => page.getByTestId('best-list');

/**
 * Clicks `target` (a tile) and waits until the move it makes is saved: the server answered its
 * POST of moves. For a step that then reads or replaces the game on the server.
 */
export async function clickAndSave(page: Page, target: Locator): Promise<void> {
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().endsWith('/moves') &&
        response.ok(),
    ),
    target.click(),
  ]);
}
