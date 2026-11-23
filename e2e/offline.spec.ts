// Saving moves, in depth: quick taps in a row and a move made offline in a tab that is then closed
// all reach the server. (A move offline in an open tab is part of the journey.)
import type { BrowserContext, Page } from '@playwright/test';
import {
  board,
  gameMessage,
  moves,
  openProfile,
  openProfileUntilMoves,
  startKnownGame,
  tile,
} from './support/app.ts';
import { AFTER_TILE_11, AFTER_TILE_11_THEN_12 } from './support/boards.ts';
import { expect, test, uniqueNickname } from './support/harness.ts';
import { scene } from './support/look.ts';

/** Offline, tile 12 slides back: the board, the count and the notice change at once; the tab closes. */
async function tapWhileOffline(page: Page, context: BrowserContext): Promise<void> {
  // The page has finished loading (the 3D board's modules come last) before the network goes.
  await expect(scene(page)).toHaveAttribute('data-webgl', 'ready', { timeout: 30_000 });
  await context.setOffline(true);
  await tile(page, 12).click();
  await expect(board(page)).toHaveAttribute('data-board', AFTER_TILE_11);
  await expect(moves(page)).toHaveText('Moves: 3');
  await expect(gameMessage(page)).toHaveText(
    'You are offline. Your moves will be saved when you are back.',
  );
  await page.close();
}

/** Back online, the profile opens in a new tab of the same browser and sends the stored move. */
async function reopenOnline(context: BrowserContext, nickname: string): Promise<void> {
  await context.setOffline(false);
  const again = await context.newPage();
  await openProfile(again, nickname);
  await expect(board(again)).toHaveAttribute('data-board', AFTER_TILE_11);
  await expect(moves(again)).toHaveText('Moves: 3');
}

test('quick taps, and a move made offline in a tab that was then closed, are all saved', async ({
  page,
  context,
  otherBrowserPage,
  request,
}) => {
  const nickname = uniqueNickname();
  await startKnownGame(page, request, nickname);
  await test.step('two quick taps both show and both are saved', async () => {
    await tile(page, 11).click();
    await tile(page, 12).click();
    await expect(board(page)).toHaveAttribute('data-board', AFTER_TILE_11_THEN_12);
    await openProfileUntilMoves(otherBrowserPage, nickname, 'Moves: 2');
  });
  await test.step('offline, a tap shows at once, then the tab is closed', () =>
    tapWhileOffline(page, context));
  await test.step('back online, a new tab of the profile sends the stored move', () =>
    reopenOnline(context, nickname));

  await openProfileUntilMoves(otherBrowserPage, nickname, 'Moves: 3');
});
