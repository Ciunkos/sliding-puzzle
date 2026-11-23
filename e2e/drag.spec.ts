// Direct manipulation: a held tile follows the finger and its move is made while the finger is
// still down, once it has gone 0.3 of a cell (input.ts COMMIT_SHARE). Each test drags on the known board, where
// tile 11 above the gap slides down and tile 14 left of it slides right.
import type { APIRequestContext, Page } from '@playwright/test';
import { board, moves, openProfile, startKnownGame, tile } from './support/app.ts';
import {
  AFTER_TILE_11,
  AFTER_TILE_11_THEN_12,
  AFTER_TILE_14,
  BOTTOM_ROW_PUSHED,
  KNOWN_BOARD,
} from './support/boards.ts';
import {
  boardEdge,
  pull,
  rendersOf,
  renders,
  resetRendered,
  commitBatches,
  countComponentRenders,
  countRenders,
  dragTo,
  flickDown,
  pressTile,
  tileCentre,
  watchCommits,
} from './support/drag.ts';
import { expect, test, uniqueNickname } from './support/harness.ts';

test('a slow drag past a third of a cell moves the tile before the finger lifts', async ({
  page,
  request,
}) => {
  await startKnownGame(page, request, uniqueNickname());
  const from = await pressTile(page, 11);
  await dragTo(page, from, 0, from.cell * 0.45);

  await expect(board(page)).toHaveAttribute('data-board', AFTER_TILE_11);
  await expect(moves(page)).toHaveText('Moves: 1');
  await page.mouse.up();
  await expect(moves(page)).toHaveText('Moves: 1');
});

test('a short slow drag springs back and moves nothing', async ({ page, request }) => {
  await startKnownGame(page, request, uniqueNickname());
  const from = await pressTile(page, 11);
  await dragTo(page, from, 0, from.cell * 0.15);
  await expect(tile(page, 11)).toHaveClass(/sp-held/);

  await page.mouse.up();

  await expect(tile(page, 11)).not.toHaveClass(/sp-held/);
  await expect(board(page)).toHaveAttribute('data-board', KNOWN_BOARD);
  await expect(moves(page)).toHaveText('Moves: 0');
});

test('pressing the far end of the bottom row and pushing moves the whole run', async ({
  page,
  request,
}) => {
  // 13 is two cells from the gap, with 14 between: a push of 13 moves both, 14 first.
  await startKnownGame(page, request, uniqueNickname());
  const from = await pressTile(page, 13);

  await dragTo(page, from, from.cell * 0.5, 0);
  await page.mouse.up();

  await expect(board(page)).toHaveAttribute('data-board', BOTTOM_ROW_PUSHED);
  await expect(moves(page)).toHaveText('Moves: 2');
});

test('pulling the tile next to the gap a cell and a half moves only that tile', async ({
  page,
  request,
}) => {
  await startKnownGame(page, request, uniqueNickname());
  const from = await pressTile(page, 14);

  await dragTo(page, from, from.cell * 1.5, 0);
  await page.mouse.up();

  await expect(board(page)).toHaveAttribute('data-board', AFTER_TILE_14);
  await expect(moves(page)).toHaveText('Moves: 1');
});

test('a tile pulled over 1.2 cells and pulled back moves once each way', async ({
  page,
  request,
}) => {
  await startKnownGame(page, request, uniqueNickname());
  await pull(page, 14, 1.2);
  await expect(moves(page)).toHaveText('Moves: 1');

  await pull(page, 14, -1.2);

  await expect(board(page)).toHaveAttribute('data-board', KNOWN_BOARD);
  await expect(moves(page)).toHaveText('Moves: 2');
});

test('a tap after a drag still slides the tapped tile', async ({ page, request }) => {
  await startKnownGame(page, request, uniqueNickname());
  const from = await pressTile(page, 11);
  await dragTo(page, from, 0, from.cell * 0.6);
  await page.mouse.up();

  await tile(page, 12).click();

  await expect(board(page)).toHaveAttribute('data-board', AFTER_TILE_11_THEN_12);
  await expect(moves(page)).toHaveText('Moves: 2');
});

test('with reduced motion a held tile stays put, and the move still comes at the threshold', async ({
  page,
  request,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startKnownGame(page, request, uniqueNickname());
  const from = await pressTile(page, 11);
  await dragTo(page, from, 0, from.cell * 0.15);
  await expect(tile(page, 11)).not.toHaveClass(/sp-held/);

  await dragTo(page, from, 0, from.cell * 0.45);

  await expect(board(page)).toHaveAttribute('data-board', AFTER_TILE_11);
  await page.mouse.up();
});

test('on a commit the held tile is let go in the same update that moves the board', async ({
  page,
  request,
}) => {
  // The 3D board is given the held tile: let go a frame early, its block would step back first.
  await startKnownGame(page, request, uniqueNickname());
  const from = await pressTile(page, 11);
  await dragTo(page, from, 0, from.cell * 0.15);
  await watchCommits(page);

  await dragTo(page, from, 0, from.cell * 0.45);
  await expect(board(page)).toHaveAttribute('data-board', AFTER_TILE_11);
  await page.mouse.up();

  // The first change after the threshold: the held tile goes with the move. (Later, the next
  // tile of the column is held at its cell, and let go on release: that changes no board.)
  expect((await commitBatches(page))[0]).toEqual({ released: true, moved: true });
});

test('let go before the threshold, the held tile is let go and the board stays as it is', async ({
  page,
  request,
}) => {
  await startKnownGame(page, request, uniqueNickname());
  const from = await pressTile(page, 11);
  await dragTo(page, from, 0, from.cell * 0.15);
  await watchCommits(page);

  await page.mouse.up();

  await expect(tile(page, 11)).not.toHaveClass(/sp-held/);
  expect(await commitBatches(page)).toEqual([{ released: true, moved: false }]);
});

test('a right-click on a tile starts no drag: moving the mouse after it moves nothing', async ({
  page,
  request,
}) => {
  await startKnownGame(page, request, uniqueNickname());
  const from = await tileCentre(page, 11);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down({ button: 'right' });

  await dragTo(page, from, 0, from.cell * 0.6);
  await page.mouse.up({ button: 'right' });

  await expect(moves(page)).toHaveText('Moves: 0');
  await expect(board(page)).toHaveAttribute('data-board', KNOWN_BOARD);
});

test('a press released just outside the board ends, and the next tap works', async ({
  page,
  request,
}) => {
  await startKnownGame(page, request, uniqueNickname());
  const edge = await boardEdge(page);
  await page.mouse.move(edge.x - 2, edge.y);
  await page.mouse.down();
  await page.mouse.move(edge.x + 6, edge.y, { steps: 2 });
  await page.mouse.up();

  await tile(page, 11).click();

  await expect(board(page)).toHaveAttribute('data-board', AFTER_TILE_11);
});

test('a quick short flick towards the gap moves the tile', async ({ page, request }) => {
  await startKnownGame(page, request, uniqueNickname());
  const from = await tileCentre(page, 11);

  // Just short of the 0.3-cell threshold, in 16 ms: only its speed can commit it.
  await flickDown(page, from, from.cell * 0.28);

  await expect(board(page)).toHaveAttribute('data-board', AFTER_TILE_11);
});

/** The known game opened again (no first-visit toast), the 3D board drawn, and tile 11 pressed. */
async function pressAfterToast(page: Page, request: APIRequestContext) {
  const nickname = uniqueNickname();
  await startKnownGame(page, request, nickname);
  await openProfile(page, nickname);
  await expect(page.getByTestId('welcome')).toHaveCount(0);
  await expect(page.getByTestId('scene')).toHaveAttribute('data-webgl', 'ready', {
    timeout: 30_000,
  });
  return pressTile(page, 11);
}

/** One move (tile 11 down), then tile 12 pressed and held a little towards the gap. */
async function holdTwelveAfterOneMove(page: Page, request: APIRequestContext) {
  await startKnownGame(page, request, uniqueNickname());
  await tile(page, 11).click();
  const from = await pressTile(page, 12);
  await dragTo(page, from, -from.cell * 0.15, 0);
  await expect(page.locator('[data-held="12"]')).toHaveCount(1);
  return from;
}

test('a reset while a tile is held lets go of it, and the drag moves nothing after', async ({
  page,
  request,
}) => {
  const from = await holdTwelveAfterOneMove(page, request);

  await page.getByTestId('reset').dispatchEvent('click');
  await expect(board(page)).toHaveAttribute('data-board', KNOWN_BOARD);
  await expect(page.locator('[data-held]')).toHaveCount(0);
  await dragTo(page, from, -from.cell * 0.6, 0);
  await page.mouse.up();

  await expect(board(page)).toHaveAttribute('data-board', KNOWN_BOARD);
});

test('a slow drag renders the page only when the tile is taken and let go, not per move', async ({
  page,
  request,
}) => {
  await countRenders(page);
  const from = await pressAfterToast(page, request);
  const before = await renders(page);

  await dragTo(page, from, 0, from.cell * 0.25);
  await expect(tile(page, 11)).toHaveClass(/sp-held/);
  const during = (await renders(page)) - before;
  await page.mouse.up();

  // Taking the tile (its held class and data-held) is one render; 12 moves add none.
  expect(during).toBeLessThanOrEqual(2);
});

/** The known game, one move made and the screen settled (the 3D board loaded): renders counted from here. */
async function countAfterOneMove(page: Page, request: APIRequestContext) {
  await countComponentRenders(page);
  await startKnownGame(page, request, uniqueNickname());
  await tile(page, 11).click();
  await expect(page.getByTestId('scene')).toHaveAttribute('data-webgl', 'ready', {
    timeout: 30_000,
  });
  await page.waitForTimeout(500);
  await resetRendered(page);
}

test('a running game renders only its clock each second: not the screen, stage or board', async ({
  page,
  request,
}) => {
  await countAfterOneMove(page, request);

  await page.waitForTimeout(3000);

  expect(
    await rendersOf(page, ['PuzzleScreen', 'StageDraw', 'BoardViewDraw', 'MenuPanelDraw']),
  ).toEqual([0, 0, 0, 0]);
});

test('a tap renders the stage and the board once, the closed menu never', async ({
  page,
  request,
}) => {
  await countAfterOneMove(page, request);

  await tile(page, 11).click();
  await page.waitForTimeout(800);

  // The board is back where it began (tile 11 up again), drawn once for it.
  await expect(board(page)).toHaveAttribute('data-board', KNOWN_BOARD);
  expect(await rendersOf(page, ['StageDraw', 'BoardViewDraw', 'MenuPanelDraw'])).toEqual([1, 1, 0]);
});
