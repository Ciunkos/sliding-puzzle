import { expect, test } from '@playwright/test';
import {
  isSolvableBoard,
  makeMove,
  movableTiles,
  readBoard,
  signIn,
  uniqueNickname,
} from './helpers.ts';

const GOAL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0];

test('a fresh game shows a valid board with no moves', async ({ page }) => {
  await signIn(page, uniqueNickname('fresh'));

  const board = await readBoard(page);
  expect(new Set(board).size).toBe(16);
  expect(board.every((cell) => cell >= 0 && cell <= 15)).toBe(true);
  await expect(page.getByTestId('moves')).toHaveText('Moves: 0');

  const movable = await movableTiles(page);
  expect(movable.length).toBeGreaterThanOrEqual(2);
  expect(movable.length).toBeLessThanOrEqual(4);
});

test('a movable tile slides into the blank and the move counts', async ({ page }) => {
  await signIn(page, uniqueNickname('move'));
  const before = await readBoard(page);
  const blank = before.indexOf(0);

  const tile = await makeMove(page, 1);

  const after = await readBoard(page);
  const tileFrom = before.indexOf(tile);
  expect(after[blank]).toBe(tile);
  expect(after[tileFrom]).toBe(0);
  expect(after.filter((_, i) => i !== blank && i !== tileFrom)).toEqual(
    before.filter((_, i) => i !== blank && i !== tileFrom),
  );
});

test('tiles that are not next to the blank cannot be moved', async ({ page }) => {
  await signIn(page, uniqueNickname('illegal'));
  const movable = await movableTiles(page);
  const before = await readBoard(page);

  let disabledCount = 0;
  for (let tile = 1; tile <= 15; tile++) {
    if (movable.includes(tile)) continue;
    await expect(page.getByTestId(`tile-${String(tile)}`)).toBeDisabled();
    disabledCount++;
  }

  expect(movable.length + disabledCount).toBe(15);
  expect(await readBoard(page)).toEqual(before);
  await expect(page.getByTestId('moves')).toHaveText('Moves: 0');
});

test('reset after three moves restores the starting board', async ({ page }) => {
  await signIn(page, uniqueNickname('reset'));
  const start = await readBoard(page);

  await makeMove(page, 1);
  await makeMove(page, 2);
  await makeMove(page, 3);
  await expect(page.getByTestId('moves')).toHaveText('Moves: 3');

  await page.getByTestId('reset').click();

  await expect(page.getByTestId('moves')).toHaveText('Moves: 0');
  expect(await readBoard(page)).toEqual(start);
});

test('new game starts a fresh board with no moves and no solved banner', async ({ page }) => {
  await signIn(page, uniqueNickname('newgame'));
  await makeMove(page, 1);
  await makeMove(page, 2);

  await page.getByTestId('new-game').click();

  await expect(page.getByTestId('moves')).toHaveText('Moves: 0');
  await expect(page.getByTestId('solved-banner')).toHaveCount(0);
});

test('starting boards are solvable', async ({ page }) => {
  // Sanity check of the parity rule itself: the goal board must count as solvable.
  expect(isSolvableBoard(GOAL)).toBe(true);

  await signIn(page, uniqueNickname('parity'));
  expect(isSolvableBoard(await readBoard(page))).toBe(true);

  for (let game = 1; game <= 5; game++) {
    const previous = await readBoard(page);
    await page.getByTestId('new-game').click();
    // A new game shows a different board (two equal shuffles in a row are practically impossible).
    await expect(page.getByTestId('board')).not.toHaveAttribute('data-board', previous.join(','));
    expect(isSolvableBoard(await readBoard(page))).toBe(true);
    await expect(page.getByTestId('moves')).toHaveText('Moves: 0');
  }
});
