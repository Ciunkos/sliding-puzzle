// The page layout: the game is the whole screen, nothing scrolls, and the board is whole on screen.
// Each test sets its own screen size, so it means the same in both projects.
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

test('on a 320 x 568 phone the whole game is on one screen that does not scroll', async ({
  page,
  request,
}) => {
  await page.setViewportSize(SMALL_PHONE);
  await startKnownGame(page, request, uniqueNickname());

  await expect(board(page)).toBeInViewport({ ratio: 1 });
  await expect(newGameButton(page)).toBeInViewport({ ratio: 1 });
  expect(await scrolls(page)).toEqual({ vertically: false, sideways: false });
});

test('on a 360 x 640 phone the whole game is on one screen that does not scroll', async ({
  page,
  request,
}) => {
  await page.setViewportSize(PHONE);
  await startKnownGame(page, request, uniqueNickname());

  await expect(board(page)).toBeInViewport({ ratio: 1 });
  expect(await scrolls(page)).toEqual({ vertically: false, sideways: false });
});

test('on a 390 x 844 phone the board, the menu and both actions are on the one screen', async ({
  page,
  request,
}) => {
  await page.setViewportSize(TALL_PHONE);
  await startKnownGame(page, request, uniqueNickname());

  await expect(board(page)).toBeInViewport({ ratio: 1 });
  await expect(menuButton(page)).toBeInViewport({ ratio: 1 });
  await expect(resetButton(page)).toBeInViewport({ ratio: 1 });
  await expect(newGameButton(page)).toBeInViewport({ ratio: 1 });
  expect(await scrolls(page)).toEqual({ vertically: false, sideways: false });
});

test('on an upright tablet the whole game is on one screen that does not scroll', async ({
  page,
  request,
}) => {
  await page.setViewportSize(TABLET);
  await startKnownGame(page, request, uniqueNickname());

  await expect(board(page)).toBeInViewport({ ratio: 1 });
  expect(await scrolls(page)).toEqual({ vertically: false, sideways: false });
});

test('on a desktop screen the whole game is on one screen that does not scroll', async ({
  page,
  request,
}) => {
  await page.setViewportSize(DESKTOP);
  await startKnownGame(page, request, uniqueNickname());

  await expect(board(page)).toBeInViewport({ ratio: 1 });
  await expect(newGameButton(page)).toBeInViewport({ ratio: 1 });
  expect(await scrolls(page)).toEqual({ vertically: false, sideways: false });
});

test('a short page such as an unusable profile name keeps the usage switch on screen', async ({
  page,
}) => {
  await page.setViewportSize(TALL_PHONE);
  await page.goto('/sliding-puzzle/p/a');
  await expect(invalidProfile(page)).toBeVisible();

  await expect(page.getByTestId('usage-statistics')).toBeInViewport({ ratio: 1 });
});

test('on a small phone the corner buttons and the sound switches are big enough to tap', async ({
  page,
  request,
}) => {
  await page.setViewportSize(SMALL_PHONE);
  // Without motion: the menu is measured at its size, not while it springs open.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startKnownGame(page, request, uniqueNickname());
  expect(await targetSize(menuButton(page))).toBeGreaterThanOrEqual(44);
  expect(await targetSize(page.getByTestId('sound-toggle'))).toBeGreaterThanOrEqual(44);
  await openMenu(page);

  expect(await targetSize(page.locator('.sp-sound-switch').first())).toBeGreaterThanOrEqual(44);
});

/** The known game solved with its one move, without motion so the win card is where it ends up. */
async function solveKnownGame(page: Page, request: APIRequestContext): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startKnownGame(page, request, uniqueNickname());
  await tile(page, 15).click();
  await expect(solvedBanner(page)).toBeVisible();
}

test('on a tall phone the win card leaves the whole solved picture in view', async ({
  page,
  request,
}) => {
  await page.setViewportSize(TALL_PHONE);
  await solveKnownGame(page, request);

  expect(await overlap(page.getByTestId('win'), board(page))).toBe(false);
  await expect(page.getByTestId('win')).toBeInViewport({ ratio: 1 });
});

test('on a desktop screen the win card leaves the whole solved picture in view', async ({
  page,
  request,
}) => {
  await page.setViewportSize(DESKTOP);
  await solveKnownGame(page, request);

  expect(await overlap(page.getByTestId('win'), board(page))).toBe(false);
  await expect(page.getByTestId('win')).toBeInViewport({ ratio: 1 });
});

test('on a small phone the solved game, its win card and New game fit on one screen', async ({
  page,
  request,
}) => {
  await page.setViewportSize(SMALL_PHONE);
  await solveKnownGame(page, request);

  await expect(page.getByTestId('win')).toBeInViewport({ ratio: 1 });
  await expect(newGameButton(page)).toBeInViewport({ ratio: 1 });
  expect(await overlap(page.getByTestId('win'), newGameButton(page))).toBe(false);
  expect(await scrolls(page)).toEqual({ vertically: false, sideways: false });
});

/** The win card is on screen, and over none of the board, New game and Reset. */
async function cardClear(page: Page) {
  const card = page.getByTestId('win');
  await expect(card).toBeInViewport({ ratio: 1 });
  return {
    board: await overlap(card, board(page)),
    newGame: await overlap(card, newGameButton(page)),
    reset: await overlap(card, resetButton(page)),
  };
}

test('on an upright tablet the win card is clear of the board and both actions', async ({
  page,
  request,
}) => {
  await page.setViewportSize(TABLET);
  await solveKnownGame(page, request);

  expect(await cardClear(page)).toEqual({ board: false, newGame: false, reset: false });
});

test('on a 1024 x 768 screen the win card is clear of the board and both actions', async ({
  page,
  request,
}) => {
  await page.setViewportSize(LANDSCAPE_TABLET);
  await solveKnownGame(page, request);

  expect(await cardClear(page)).toEqual({ board: false, newGame: false, reset: false });
});

test('in a nearly square window the win card is clear of the board and both actions', async ({
  page,
  request,
}) => {
  await page.setViewportSize(SQUARE_WINDOW);
  await solveKnownGame(page, request);

  expect(await cardClear(page)).toEqual({ board: false, newGame: false, reset: false });
});
