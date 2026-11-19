// The page layout: the game is the whole screen, nothing scrolls, and the board is whole on screen.
// Each test sets its own screen size, so it means the same in both projects.
import { board, invalidProfile, startKnownGame } from './support/app.ts';
import { expect, test, uniqueNickname } from './support/harness.ts';
import {
  DESKTOP,
  newGameButton,
  PHONE,
  resetButton,
  scrolls,
  SMALL_PHONE,
  TABLET,
  TALL_PHONE,
} from './support/layout.ts';
import { menuButton } from './support/menu.ts';

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
