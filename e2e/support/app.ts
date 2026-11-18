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
