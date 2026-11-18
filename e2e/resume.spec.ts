import type { Page } from '@playwright/test';
import { board, moves, openProfile, startKnownGame, tile } from './support/app.ts';
import { AFTER_TILE_11, AFTER_TILE_11_THEN_12 } from './support/boards.ts';
import { expect, test, uniqueNickname } from './support/harness.ts';

/** A move in the other browser, then the first browser reloads and sees it. */
async function moveThereSeeHere(there: Page, here: Page): Promise<void> {
  await tile(there, 12).click();
  await expect(moves(there)).toHaveText('Moves: 2');
  await here.reload();
  await expect(board(here)).toHaveAttribute('data-board', AFTER_TILE_11_THEN_12);
  await expect(moves(here)).toHaveText('Moves: 2');
}

test('a shared link resumes the game in another browser', async ({
  page,
  otherBrowserPage,
  request,
}) => {
  const nickname = uniqueNickname();
  await startKnownGame(page, request, nickname);
  await tile(page, 11).click();
  await expect(moves(page)).toHaveText('Moves: 1');
  await test.step('the link in other casing resumes and shows the canonical URL', async () => {
    await openProfile(otherBrowserPage, nickname.toUpperCase());
    await expect(board(otherBrowserPage)).toHaveAttribute('data-board', AFTER_TILE_11);
    await expect(moves(otherBrowserPage)).toHaveText('Moves: 1');
    await expect(otherBrowserPage).toHaveURL(/\/sliding-puzzle\/p\/(phone|desktop)-resu\d+$/);
  });
  await test.step('a move in the other browser is seen in the first after a reload', () =>
    moveThereSeeHere(otherBrowserPage, page));
});
