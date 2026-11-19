// A real finger: touch events through the Chrome DevTools protocol, on a screen with touch.
import { board, moves, startKnownGame, tile } from './support/app.ts';
import { AFTER_TILE_11, AFTER_TILE_11_THEN_12 } from './support/boards.ts';
import { scrolled, tileCentre, touchDrag } from './support/drag.ts';
import { expect, test, uniqueNickname } from './support/harness.ts';
import { SMALL_PHONE } from './support/layout.ts';

test.use({ hasTouch: true });

test('a touch drag on a small phone moves the tile under the finger, and the page never scrolls', async ({
  page,
  request,
}) => {
  await page.setViewportSize(SMALL_PHONE);
  await startKnownGame(page, request, uniqueNickname());
  const from = await tileCentre(page, 11);

  await touchDrag(page, from, { dx: 0, dy: from.cell * 0.6 }, async () => {
    await expect(board(page)).toHaveAttribute('data-board', AFTER_TILE_11);
  });

  await expect(moves(page)).toHaveText('Moves: 1');
  expect(await scrolled(page)).toEqual({ x: 0, y: 0 });
});

test('after a touch drag, the next keyboard activation of a tile still slides it', async ({
  page,
  request,
}) => {
  await startKnownGame(page, request, uniqueNickname());
  const from = await tileCentre(page, 11);
  await touchDrag(page, from, { dx: 0, dy: from.cell * 0.6 }, async () => {
    await expect(board(page)).toHaveAttribute('data-board', AFTER_TILE_11);
  });

  await tile(page, 12).focus();
  await page.keyboard.press('Enter');

  await expect(board(page)).toHaveAttribute('data-board', AFTER_TILE_11_THEN_12);
});
