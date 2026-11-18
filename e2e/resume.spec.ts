import { board, moves, signIn, startKnownGame, tile } from './support/app.ts';
import { AFTER_TILE_11, AFTER_TILE_11_THEN_12 } from './support/boards.ts';
import { expect, test, uniqueNickname } from './support/harness.ts';

test('a saved game resumes in another browser', async ({ page, otherBrowserPage, request }) => {
  const nickname = uniqueNickname();
  await startKnownGame(page, request, nickname);
  await tile(page, 11).click();
  await expect(moves(page)).toHaveText('Moves: 1');
  await test.step('another browser signs in in other casing and resumes', async () => {
    await signIn(otherBrowserPage, nickname.toUpperCase());
    await expect(board(otherBrowserPage)).toHaveAttribute('data-board', AFTER_TILE_11);
    await expect(moves(otherBrowserPage)).toHaveText('Moves: 1');
  });
  await test.step('a move in the other browser is seen in the first after a reload', async () => {
    await tile(otherBrowserPage, 12).click();
    await expect(moves(otherBrowserPage)).toHaveText('Moves: 2');
    await page.reload();
    await signIn(page, nickname);
    await expect(board(page)).toHaveAttribute('data-board', AFTER_TILE_11_THEN_12);
    await expect(moves(page)).toHaveText('Moves: 2');
  });
});
