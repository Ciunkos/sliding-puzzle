// Steps and locators of the app under test. No expected values are decided here.
import type { APIRequestContext, Page } from '@playwright/test';
import { expect } from './harness.ts';

/** The isolated API started by playwright.config.ts with ENABLE_TEST_ROUTES=1, under the app's prefix. */
const API_BASE = 'http://localhost:8788/sliding-puzzle/api';

export const board = (page: Page) => page.getByTestId('board');
export const moves = (page: Page) => page.getByTestId('moves');
export const tile = (page: Page, number: number) => page.getByTestId(`tile-${String(number)}`);
export const enabledTiles = (page: Page) => page.locator('button[data-testid^="tile-"]:enabled');
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

/** Opens the "Switch profile" disclosure (it stays open once opened). */
export async function openSwitcher(page: Page): Promise<void> {
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

/**
 * Drags the pointer from the middle of tile `number` by (dx, dy) pixels in small steps: a swipe.
 * Uses the mouse, which both projects support; the board reads pointer events, whatever the device.
 */
export async function swipeFromTile(
  page: Page,
  number: number,
  dx: number,
  dy: number,
): Promise<void> {
  const box = await tile(page, number).boundingBox();
  expect(box, `tile ${String(number)} is on screen`).not.toBeNull();
  const x = (box?.x ?? 0) + (box?.width ?? 0) / 2;
  const y = (box?.y ?? 0) + (box?.height ?? 0) / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 6 });
  await page.mouse.up();
}

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
