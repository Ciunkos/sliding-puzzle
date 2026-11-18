import { board, enabledTiles, moves, solvedBanner, startKnownGame, tile } from './support/app.ts';
import { AFTER_TILE_11, KNOWN_BOARD, SOLVED_BOARD } from './support/boards.ts';
import { expect, test, uniqueNickname } from './support/harness.ts';

test('only the tiles next to the blank can be moved', async ({ page, request }) => {
  await startKnownGame(page, request, uniqueNickname());
  await test.step('only tiles 11, 14 and 15 next to the blank are enabled', async () => {
    await expect(enabledTiles(page)).toHaveCount(3);
    await expect(tile(page, 11)).toBeEnabled();
    await expect(tile(page, 14)).toBeEnabled();
    await expect(tile(page, 15)).toBeEnabled();
    await expect(tile(page, 1)).toBeDisabled();
  });

  await tile(page, 11).click();

  await expect(board(page)).toHaveAttribute('data-board', AFTER_TILE_11);
  await expect(moves(page)).toHaveText('Moves: 1');
});

test('reset after two moves returns to the starting board', async ({ page, request }) => {
  await startKnownGame(page, request, uniqueNickname());
  await tile(page, 11).click();
  await tile(page, 12).click();
  await expect(moves(page)).toHaveText('Moves: 2');

  await page.getByTestId('reset').click();

  await expect(board(page)).toHaveAttribute('data-board', KNOWN_BOARD);
  await expect(moves(page)).toHaveText('Moves: 0');
});

test('solving the puzzle shows the banner until a new game starts', async ({ page, request }) => {
  await startKnownGame(page, request, uniqueNickname());
  await test.step('the solving move shows the banner and locks the board', async () => {
    await tile(page, 15).click();
    await expect(solvedBanner(page)).toHaveText('Solved in 1 move!');
    await expect(moves(page)).toHaveText('Moves: 1');
    await expect(board(page)).toHaveAttribute('data-board', SOLVED_BOARD);
    await expect(enabledTiles(page)).toHaveCount(0);
  });
  await test.step('a new game removes the banner', async () => {
    await page.getByTestId('new-game').click();
    await expect(solvedBanner(page)).toHaveCount(0);
    await expect(moves(page)).toHaveText('Moves: 0');
  });
});
