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

/** Offline, tile 11 is tapped: the board, the count and the notice change at once. */
async function tapWhileOffline(page: Page, context: BrowserContext): Promise<void> {
  await context.setOffline(true);
  await tile(page, 11).click();
  await expect(board(page)).toHaveAttribute('data-board', AFTER_TILE_11);
  await expect(moves(page)).toHaveText('Moves: 1');
  await expect(gameMessage(page)).toHaveText(
    'You are offline. Your moves will be saved when you are back.',
  );
}

test('a tap while offline shows at once and is saved when the connection returns', async ({
  page,
  context,
  otherBrowserPage,
  request,
}) => {
  const nickname = uniqueNickname();
  await startKnownGame(page, request, nickname);
  await test.step('offline, the tap shows at once with the offline notice', () =>
    tapWhileOffline(page, context));
  await test.step('back online, the move is saved and the notice goes', async () => {
    await context.setOffline(false);
    await expect(gameMessage(page)).toHaveCount(0);
  });
  await test.step('another browser sees the saved move', async () => {
    await openProfile(otherBrowserPage, nickname);
    await expect(board(otherBrowserPage)).toHaveAttribute('data-board', AFTER_TILE_11);
    await expect(moves(otherBrowserPage)).toHaveText('Moves: 1');
  });
});

test('two quick taps both show and both are saved', async ({ page, otherBrowserPage, request }) => {
  const nickname = uniqueNickname();
  await startKnownGame(page, request, nickname);

  await tile(page, 11).click();
  await tile(page, 12).click();

  await expect(board(page)).toHaveAttribute('data-board', AFTER_TILE_11_THEN_12);
  await expect(moves(page)).toHaveText('Moves: 2');
  await openProfileUntilMoves(otherBrowserPage, nickname, 'Moves: 2');
});
