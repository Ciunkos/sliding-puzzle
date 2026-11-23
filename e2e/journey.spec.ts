// The core scenario: one player's whole visit, from the first open to the win, coming back from
// another tab and another browser, the menu, offline and the usage statistics. Each step starts
// where the last one left the player.
import type { APIRequestContext, Page } from '@playwright/test';
import {
  bestList,
  board,
  currentNickname,
  gameMessage,
  movableTiles,
  moves,
  openProfile,
  openProfileUntilMoves,
  seedKnownGame,
  solvedBanner,
  tile,
  winResult,
} from './support/app.ts';
import {
  AFTER_TILE_11,
  AFTER_TILE_11_THEN_12,
  KNOWN_BOARD,
  SOLVED_BOARD,
} from './support/boards.ts';
import { dragTile } from './support/drag.ts';
import { expect, test } from './support/harness.ts';
import { pickSkin, scene, toggle3d } from './support/look.ts';
import { menu, openMenu, switch3d, welcome } from './support/menu.ts';

const GENERATED_PROFILE_URL = /\/sliding-puzzle\/p\/[a-z]+-[a-z]+-\d{3}$/;
const BUNDLED_PICTURE = /^(rocket|cat|balloon|fish|castle)$/;
const SCENE_TIMEOUT = { timeout: 30_000 };

/** A first visit: a generated profile, its game on a bundled picture in 3D, and the toast. */
async function arrives(page: Page): Promise<void> {
  await page.goto('/sliding-puzzle');
  await expect(page).toHaveURL(GENERATED_PROFILE_URL);
  await expect(moves(page)).toHaveText('Moves: 0');
  await expect(board(page)).toHaveAttribute('data-skin', BUNDLED_PICTURE);
  await expect(scene(page)).toHaveAttribute('data-webgl', 'ready', SCENE_TIMEOUT);
  await expect(welcome(page)).toContainText('Anyone with this link can play this profile.');
}

/** The first tap moves a tile and the toast goes; then the known board is dealt (test route). */
async function firstTapThenKnownBoard(page: Page, request: APIRequestContext): Promise<void> {
  await movableTiles(page).first().click();
  await expect(moves(page)).toHaveText('Moves: 1');
  await expect(welcome(page)).toHaveCount(0);
  await seedKnownGame(request, await currentNickname(page));
  await page.reload();
  await expect(board(page)).toHaveAttribute('data-board', KNOWN_BOARD);
}

/** A tap on 11, a drag of 12 (finger or mouse) that moves before it lifts, an arrow back. */
async function tapDragAndKeys(page: Page): Promise<void> {
  await tile(page, 11).click();
  await expect(board(page)).toHaveAttribute('data-board', AFTER_TILE_11);
  await dragTile(page, 12, { dx: -0.6, dy: 0 }, async () => {
    await expect(board(page)).toHaveAttribute('data-board', AFTER_TILE_11_THEN_12);
  });
  await tile(page, 12).focus();
  await page.keyboard.press('ArrowRight');
  await expect(board(page)).toHaveAttribute('data-board', AFTER_TILE_11);
  await expect(tile(page, 12)).toBeFocused();
}

/** A refresh, the home page in a new tab and the link in another browser all resume the game. */
async function comesBack(page: Page, other: Page): Promise<void> {
  await page.reload();
  await expect(moves(page)).toHaveText('Moves: 3');
  await sameGameInNewTab(page);
  await openProfile(other, await currentNickname(page));
  await expect(board(other)).toHaveAttribute('data-board', AFTER_TILE_11);
}

/** The home page in a new tab of the same browser lands on this profile and its game. */
async function sameGameInNewTab(page: Page): Promise<void> {
  const tab = await page.context().newPage();
  await tab.goto('/sliding-puzzle');
  await expect(tab).toHaveURL(GENERATED_PROFILE_URL);
  await expect(board(tab)).toHaveAttribute('data-board', AFTER_TILE_11);
  await tab.close();
}

/** Tile 11 up and tile 15 left solve it: shown, announced, a new best, no tile left to move. */
async function wins(page: Page): Promise<void> {
  await tile(page, 11).click();
  await tile(page, 15).click();
  await expect(board(page)).toHaveAttribute('data-board', SOLVED_BOARD);
  await expect(solvedBanner(page)).toHaveText('Solved in 5 moves!');
  await expect(page.getByTestId('announcer')).toHaveText('Solved in 5 moves!');
  await expect(winResult(page)).toContainText('New best!');
  await expect(bestList(page)).toContainText('5 moves');
  await expect(movableTiles(page)).toHaveCount(0);
}

/** A new game, the rocket, 3D off and on again from the menu; a reload keeps the choices. */
async function makesItTheirs(page: Page): Promise<void> {
  await page.getByTestId('new-game').click();
  await pickSkin(page, 'rocket');
  await switch3d(page);
  await expect(scene(page)).toHaveCount(0);
  await switch3d(page);
  await page.reload();
  await expect(board(page)).toHaveAttribute('data-skin', 'rocket');
  await expect(toggle3d(page)).toHaveAttribute('aria-pressed', 'true');
}

/** The menu says what usage statistics count; switching them off survives a reload. */
async function optOut(page: Page): Promise<void> {
  await openMenu(page);
  await expect(page.getByTestId('usage-statistics')).toContainText('never your nickname');
  await page.getByTestId('usage-toggle').click();
  await page.reload();
  await openMenu(page);
}

/** Offline a move shows at once with a notice; back online it is saved for another browser. */
async function offlineThenBack(page: Page, other: Page): Promise<void> {
  // The page has finished loading (the 3D board's modules come last) before the network goes.
  await expect(scene(page)).toHaveAttribute('data-webgl', 'ready', SCENE_TIMEOUT);
  await page.context().setOffline(true);
  await movableTiles(page).first().click();
  await expect(moves(page)).toHaveText('Moves: 1');
  await expect(gameMessage(page)).toHaveText(
    'You are offline. Your moves will be saved when you are back.',
  );
  await page.context().setOffline(false);
  await expect(gameMessage(page)).toHaveCount(0);
  await openProfileUntilMoves(other, await currentNickname(page), 'Moves: 1');
}

test('a player arrives, plays, comes back, wins, makes it theirs, goes offline and opts out', async ({
  page,
  otherBrowserPage,
  request,
}) => {
  await test.step('arrives: the first visit is a game at once', () => arrives(page));
  await test.step('plays: a first tap, then the known board', () =>
    firstTapThenKnownBoard(page, request));
  await test.step('plays: a tap, a drag and an arrow key', () => tapDragAndKeys(page));
  await test.step('comes back: a refresh, a new tab, another browser', () =>
    comesBack(page, otherBrowserPage));
  await test.step('wins', () => wins(page));
  await test.step('makes it theirs: a new game, a picture, 3D', () => makesItTheirs(page));
  await test.step('goes offline and back', () => offlineThenBack(page, otherBrowserPage));
  await test.step('opts out of usage statistics, and it is kept', async () => {
    await optOut(page);
    await expect(menu(page).getByTestId('usage-toggle')).toHaveText('Usage statistics: off');
  });
});
