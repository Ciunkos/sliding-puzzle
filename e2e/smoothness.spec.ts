// Smoothness: what React renders while the game runs, counted through the DevTools hook. A render
// that lands in a slide is a dropped frame on a phone, so the clock, a tap and a drag each render
// only what they change.
import type { APIRequestContext, Page } from '@playwright/test';
import { board, startKnownGame, tile } from './support/app.ts';
import { KNOWN_BOARD } from './support/boards.ts';
import {
  countComponentRenders,
  dragTo,
  pressTile,
  renders,
  rendersOf,
  resetRendered,
} from './support/drag.ts';
import { expect, test, uniqueNickname } from './support/harness.ts';

/** The known game, one move made (the toast gone) and the screen settled with the 3D board. */
async function settledAfterOneMove(page: Page, request: APIRequestContext): Promise<void> {
  await countComponentRenders(page);
  await startKnownGame(page, request, uniqueNickname());
  await tile(page, 11).click();
  await expect(page.getByTestId('scene')).toHaveAttribute('data-webgl', 'ready', {
    timeout: 30_000,
  });
  await page.waitForTimeout(500);
  await resetRendered(page);
}

/** A tap on tile 11 (back up): the stage and the board render once, the closed menu never. */
async function tapRenders(page: Page): Promise<number[]> {
  await resetRendered(page);
  await tile(page, 11).click();
  await page.waitForTimeout(800);
  await expect(board(page)).toHaveAttribute('data-board', KNOWN_BOARD);
  return rendersOf(page, ['StageDraw', 'BoardViewDraw', 'MenuPanelDraw']);
}

/** Commits while tile 11 is held and dragged in 12 small moves short of the threshold. */
async function dragCommits(page: Page): Promise<number> {
  const from = await pressTile(page, 11);
  const before = await renders(page);
  await dragTo(page, from, 0, from.cell * 0.25);
  await expect(tile(page, 11)).toHaveClass(/sp-held/);
  const during = (await renders(page)) - before;
  await page.mouse.up();
  return during;
}

test('the clock, a tap and a drag each render only what they change', async ({ page, request }) => {
  await settledAfterOneMove(page, request);
  await test.step('three seconds of the clock render only the clock', async () => {
    await page.waitForTimeout(3000);
    expect(
      await rendersOf(page, ['PuzzleScreen', 'StageDraw', 'BoardViewDraw', 'MenuPanelDraw']),
    ).toEqual([0, 0, 0, 0]);
  });
  await test.step('a tap renders the stage and the board once', async () => {
    expect(await tapRenders(page)).toEqual([1, 1, 0]);
  });
  await test.step('a slow drag renders when the tile is taken, not per move', async () => {
    // Taking the tile (its held class and data-held) is one render; 12 moves add none.
    expect(await dragCommits(page)).toBeLessThanOrEqual(2);
  });
});
