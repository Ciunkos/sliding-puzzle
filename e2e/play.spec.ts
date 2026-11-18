import type { Page } from '@playwright/test';
import {
  bestList,
  board,
  movableTiles,
  moves,
  sizeChoice,
  solvedBanner,
  startKnownGame,
  swipeFromTile,
  tile,
  timer,
  winResult,
} from './support/app.ts';
import {
  AFTER_TILE_11,
  AFTER_TILE_11_THEN_12,
  KNOWN_BOARD,
  SOLVED_BOARD,
} from './support/boards.ts';
import { expect, test, uniqueNickname } from './support/harness.ts';

test('only the tiles next to the blank can be moved', async ({ page, request }) => {
  await startKnownGame(page, request, uniqueNickname());
  await test.step('only tiles 11, 14 and 15 next to the blank are enabled', async () => {
    // Tiles that cannot move are aria-disabled, not disabled, so they keep focus: count those
    await expect(movableTiles(page)).toHaveCount(3);
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

/** The known board solved by tile 15: the banner with the moves, a locked board, the announcement. */
async function solveInOneMove(page: Page): Promise<void> {
  await tile(page, 15).click();
  await expect(solvedBanner(page)).toHaveText('Solved in 1 move!');
  await expect(moves(page)).toHaveText('Moves: 1');
  await expect(board(page)).toHaveAttribute('data-board', SOLVED_BOARD);
  // aria-disabled, not disabled (see the first test): no tile is left that can move
  await expect(movableTiles(page)).toHaveCount(0);
  await expect(page.getByTestId('announcer')).toHaveText('Solved in 1 move!');
}

/** After the first win: a new best, listed under Best for 4x4; a finished game cannot be reset. */
async function firstWinResult(page: Page): Promise<void> {
  await expect(winResult(page)).toContainText('New best!');
  await expect(bestList(page)).toContainText('1 move');
  // A finished game cannot be reset (the engine refuses it); it stays focusable and says why
  await expect(page.getByTestId('reset')).toBeDisabled();
  await expect(page.getByTestId('reset')).toHaveAccessibleDescription(
    'Start a new game to play again.',
  );
}

test('solving the puzzle shows the banner and the result until a new game starts', async ({
  page,
  request,
}) => {
  await startKnownGame(page, request, uniqueNickname());
  await test.step('the timer shows no play time before the first move', async () => {
    await expect(timer(page)).toHaveText('0:00');
  });
  await test.step('the solving move shows the banner and locks the board', () =>
    solveInOneMove(page));
  await test.step('the first win is a new best, listed under Best; Reset is unavailable', () =>
    firstWinResult(page));
  await test.step('a new game removes the banner', async () => {
    await page.getByTestId('new-game').click();
    await expect(solvedBanner(page)).toHaveCount(0);
    await expect(moves(page)).toHaveText('Moves: 0');
  });
});

/** From AFTER_TILE_11 with focus on tile 11: left slides 12, then D slides it back, focus following it. */
async function leftThenD(page: Page): Promise<void> {
  await page.keyboard.press('ArrowLeft');
  await expect(board(page)).toHaveAttribute('data-board', AFTER_TILE_11_THEN_12);
  await expect(page.getByTestId('announcer')).toHaveText('Moved tile 12. 2 moves.');
  await page.keyboard.press('d');
  await expect(board(page)).toHaveAttribute('data-board', AFTER_TILE_11);
  await expect(moves(page)).toHaveText('Moves: 3');
  await expect(tile(page, 12)).toBeFocused();
}

/** With focus on tile 12 of AFTER_TILE_11, Control+S (a browser shortcut) leaves the board as it is. */
async function shortcutMovesNothing(page: Page): Promise<void> {
  await page.keyboard.press('Control+s');
  await expect(moves(page)).toHaveText('Moves: 3');
  await expect(board(page)).toHaveAttribute('data-board', AFTER_TILE_11);
  await expect(tile(page, 12)).toBeFocused();
}

test('arrow keys and WASD slide the tile on the other side of the blank, and focus stays on it', async ({
  page,
  request,
}) => {
  await startKnownGame(page, request, uniqueNickname());
  await tile(page, 15).focus();
  await test.step('down slides 11, above the blank, down into it, and focus moves to it', async () => {
    await page.keyboard.press('ArrowDown');
    await expect(board(page)).toHaveAttribute('data-board', AFTER_TILE_11);
    await expect(tile(page, 11)).toBeFocused();
  });
  await test.step('left slides 12 left into the blank, D slides it back', () => leftThenD(page));
  await test.step('Ctrl+S is a shortcut, not a move', () => shortcutMovesNothing(page));
  await test.step('the board is one tab stop: Tab goes on to New game', async () => {
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('new-game')).toBeFocused();
  });
});

test('a swipe on the board slides a tile, and a tap after it still works', async ({
  page,
  request,
}) => {
  await startKnownGame(page, request, uniqueNickname());
  await test.step('swiping down from tile 11 slides it down into the blank', async () => {
    await swipeFromTile(page, 11, 0, 60);
    await expect(board(page)).toHaveAttribute('data-board', AFTER_TILE_11);
    await expect(moves(page)).toHaveText('Moves: 1');
  });
  await test.step('a tap on tile 12 slides it once', async () => {
    await tile(page, 12).click();
    await expect(board(page)).toHaveAttribute('data-board', AFTER_TILE_11_THEN_12);
    await expect(moves(page)).toHaveText('Moves: 2');
  });
});

/** With reduced motion: 3x3 starts a game of 9 cells whose tiles do not animate but still move. */
async function threeByThreeWithoutMotion(page: Page): Promise<void> {
  await sizeChoice(page, 3).click();
  await expect(board(page)).toHaveAttribute('data-board', /^\d+(,\d+){8}$/);
  await expect(sizeChoice(page, 3)).toHaveAttribute('aria-pressed', 'true');
  await expect(tile(page, 1)).toHaveCSS('transition-duration', '0s');
  await movableTiles(page).first().click();
  await expect(moves(page)).toHaveText('Moves: 1');
}

test('choosing a size starts a new game of that size, with or without motion', async ({
  page,
  request,
}) => {
  await startKnownGame(page, request, uniqueNickname());
  await test.step('tiles slide with a short transition', async () => {
    await expect(tile(page, 1)).toHaveCSS('transition-duration', '0.14s');
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await test.step('3x3 starts a game of 9 cells, and a tile still moves without motion', () =>
    threeByThreeWithoutMotion(page));
  await test.step('5x5 starts a game of 25 cells', async () => {
    await sizeChoice(page, 5).click();
    await expect(board(page)).toHaveAttribute('data-board', /^\d+(,\d+){24}$/);
    await expect(moves(page)).toHaveText('Moves: 0');
  });
});
