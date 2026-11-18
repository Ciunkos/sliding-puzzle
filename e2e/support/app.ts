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

/** Opens the picker and submits a nickname, without waiting for the outcome. */
export async function submitNickname(page: Page, nickname: string): Promise<void> {
  await page.goto('/sliding-puzzle');
  await page.getByTestId('nickname-input').fill(nickname);
  await page.getByTestId('profile-submit').click();
}

/** Selects (or creates) the profile and waits until its game is on screen. */
export async function signIn(page: Page, nickname: string): Promise<void> {
  await submitNickname(page, nickname);
  await expect(board(page)).toBeVisible();
}

/**
 * Signs in (creating the profile), then puts it into the known board through the test-only route:
 * the solved board with tile 15 slid once, so tiles 11, 14 and 15 are the movable ones. Ends signed in.
 */
export async function startKnownGame(
  page: Page,
  request: APIRequestContext,
  nickname: string,
): Promise<void> {
  await signIn(page, nickname);
  const seeded = await request.post(`${API_BASE}/test/profiles/${nickname}/game/near-solved`);
  expect(seeded).toBeOK();
  await signIn(page, nickname);
}
