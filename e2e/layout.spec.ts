// The page layout: the game is the whole screen, nothing scrolls, and the board is whole on screen.
// Each flow resizes one page through the screen sizes it is made for, so it means the same in
// both projects.
import type { APIRequestContext, Page } from '@playwright/test';
import { board, invalidProfile, solvedBanner, startKnownGame, tile } from './support/app.ts';
import { expect, test, uniqueNickname } from './support/harness.ts';
import {
  DESKTOP,
  newGameButton,
  PHONE,
  resetButton,
  scrolls,
  SMALL_PHONE,
  SQUARE_WINDOW,
  LANDSCAPE_TABLET,
  TABLET,
  TALL_PHONE,
  overlap,
  targetSize,
} from './support/layout.ts';
import { menuButton, openMenu } from './support/menu.ts';

/** At `size`, the board and New game are whole on the one screen, and nothing scrolls. */
async function oneScreen(page: Page, size: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(size);
  await expect(board(page)).toBeInViewport({ ratio: 1 });
  await expect(newGameButton(page)).toBeInViewport({ ratio: 1 });
  expect(await scrolls(page)).toEqual({ vertically: false, sideways: false });
}

/** On a small phone, without motion (the menu measured at its size): every corner target is big. */
async function bigTargets(page: Page): Promise<void> {
  await page.setViewportSize(SMALL_PHONE);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await targetSize(menuButton(page))).toBeGreaterThanOrEqual(44);
  expect(await targetSize(page.getByTestId('sound-toggle'))).toBeGreaterThanOrEqual(44);
  await openMenu(page);
  expect(await targetSize(page.locator('.sp-sound-switch').first())).toBeGreaterThanOrEqual(44);
}

test('from a small phone to a desktop the whole game is one screen that does not scroll', async ({
  page,
  request,
}) => {
  await startKnownGame(page, request, uniqueNickname());
  await test.step('320 x 568, a small phone', () => oneScreen(page, SMALL_PHONE));
  await test.step('360 x 640, a common Android phone', () => oneScreen(page, PHONE));
  await test.step('768 x 1024, an upright tablet', () => oneScreen(page, TABLET));
  await test.step('1440 x 900, a laptop', () => oneScreen(page, DESKTOP));
  await test.step('390 x 844, an iPhone: the menu and Reset too', async () => {
    await oneScreen(page, TALL_PHONE);
    await expect(menuButton(page)).toBeInViewport({ ratio: 1 });
    await expect(resetButton(page)).toBeInViewport({ ratio: 1 });
  });
  await test.step('on a small phone every corner button and switch is big enough to tap', () =>
    bigTargets(page));
});

test('a short page such as an unusable profile name keeps the usage switch on screen', async ({
  page,
}) => {
  await page.setViewportSize(TALL_PHONE);
  await page.goto('/sliding-puzzle/p/a');
  await expect(invalidProfile(page)).toBeVisible();

  await expect(page.getByTestId('usage-statistics')).toBeInViewport({ ratio: 1 });
});

/** The win card at `size`: on screen, and over none of the board, New game and Reset. */
async function cardClear(page: Page, size: { width: number; height: number }) {
  await page.setViewportSize(size);
  const card = page.getByTestId('win');
  await expect(card).toBeInViewport({ ratio: 1 });
  return {
    board: await overlap(card, board(page)),
    newGame: await overlap(card, newGameButton(page)),
    reset: await overlap(card, resetButton(page)),
  };
}

/** On a small phone the card, New game and the solved game fit one screen, apart. */
async function smallPhoneWin(page: Page): Promise<void> {
  await page.setViewportSize(SMALL_PHONE);
  await expect(page.getByTestId('win')).toBeInViewport({ ratio: 1 });
  await expect(newGameButton(page)).toBeInViewport({ ratio: 1 });
  expect(await overlap(page.getByTestId('win'), newGameButton(page))).toBe(false);
  expect(await scrolls(page)).toEqual({ vertically: false, sideways: false });
}

/** The known game solved with its one move, without motion so the win card is where it ends up. */
async function solveKnownGame(page: Page, request: APIRequestContext): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startKnownGame(page, request, uniqueNickname());
  await tile(page, 15).click();
  await expect(solvedBanner(page)).toBeVisible();
}

const CLEAR = { board: false, newGame: false, reset: false };

test('at every size the win card leaves the solved picture and both actions in view', async ({
  page,
  request,
}) => {
  await solveKnownGame(page, request);
  await test.step('390 x 844, an iPhone', async () => {
    expect((await cardClear(page, TALL_PHONE)).board).toBe(false);
  });
  await test.step('1440 x 900, a laptop', async () => {
    expect((await cardClear(page, DESKTOP)).board).toBe(false);
  });
  await test.step('768 x 1024, 1024 x 768 and 1000 x 850: clear of all three', async () => {
    expect(await cardClear(page, TABLET)).toEqual(CLEAR);
    expect(await cardClear(page, LANDSCAPE_TABLET)).toEqual(CLEAR);
    expect(await cardClear(page, SQUARE_WINDOW)).toEqual(CLEAR);
  });
  await test.step('320 x 568, a small phone', () => smallPhoneWin(page));
});
