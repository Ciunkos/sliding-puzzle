// The core scenario: one player's whole visit, from the first open to the win, coming back from
// another tab and another browser, the menu, offline and the usage statistics. Each step starts
// where the last one left the player.
import type { APIRequestContext, Page } from '@playwright/test';
import {
  bestList,
  board,
  clickAndSave,
  currentNickname,
  gameMessage,
  movableTiles,
  moves,
  openProfileUntilMoves,
  seedKnownGame,
  solvedBanner,
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
import { dragTile } from './support/drag.ts';
import { expect, test } from './support/harness.ts';
import { pickSkin, scene, toggle3d } from './support/look.ts';
import { menu, openMenu, switch3d, welcome } from './support/menu.ts';

const GENERATED_PROFILE_URL = /\/sliding-puzzle\/p\/[a-z]+-[a-z]+-\d{3}$/;
const BUNDLED_PICTURE = /^(rocket|cat|balloon|fish|castle)$/;
const SCENE_TIMEOUT = { timeout: 30_000 };
const NO_LOGIN = 'There is no login. Anyone with this link can play this profile.';

/** A first visit: a generated profile, its game on a bundled picture in 3D, and the toast. */
async function arrives(page: Page): Promise<void> {
  await page.goto('/sliding-puzzle');
  await expect(page).toHaveURL(GENERATED_PROFILE_URL);
  await expect(moves(page)).toHaveText('Moves: 0');
  await expect(timer(page)).toHaveText('0:00');
  await expect(board(page)).toHaveAttribute('data-skin', BUNDLED_PICTURE);
  await expect(scene(page)).toHaveAttribute('data-webgl', 'ready', SCENE_TIMEOUT);
  await expect(welcome(page)).toContainText('Playing as');
  await expect(welcome(page).getByTestId('profile-notice')).toHaveText(NO_LOGIN);
}

/**
 * The first tap moves a tile, the toast goes, and the move is saved; then the known board is
 * dealt (test route) in its place.
 */
async function firstTapThenKnownBoard(page: Page, request: APIRequestContext): Promise<void> {
  await clickAndSave(page, movableTiles(page).first());
  await expect(moves(page)).toHaveText('Moves: 1');
  await expect(welcome(page)).toHaveCount(0);
  await seedKnownGame(request, await currentNickname(page));
  await page.reload();
  await expect(board(page)).toHaveAttribute('data-board', KNOWN_BOARD);
}

/**
 * A tap on 11; a drag of 12 (finger or mouse) that moves before it lifts, once; then Enter on 12,
 * which a drag's swallowed click must not eat.
 */
async function tapDragAndKeys(page: Page): Promise<void> {
  await tile(page, 11).click();
  await expect(board(page)).toHaveAttribute('data-board', AFTER_TILE_11);
  await dragTile(page, 12, { dx: -0.6, dy: 0 }, async () => {
    await expect(board(page)).toHaveAttribute('data-board', AFTER_TILE_11_THEN_12);
  });
  await expect(moves(page)).toHaveText('Moves: 2');
  await tile(page, 12).focus();
  await page.keyboard.press('Enter');
  await expect(board(page)).toHaveAttribute('data-board', AFTER_TILE_11);
  await expect(moves(page)).toHaveText('Moves: 3');
}

/** A refresh, the home page in a new tab and the link in another browser all resume the game. */
async function comesBack(page: Page, other: Page): Promise<void> {
  await page.reload();
  await expect(moves(page)).toHaveText('Moves: 3');
  await sameGameInNewTab(page);
  await openProfileUntilMoves(other, await currentNickname(page), 'Moves: 3');
  await expect(board(other)).toHaveAttribute('data-board', AFTER_TILE_11);
  await movedThereSeenHere(page, other);
}

/** The home page in a new tab of the same browser lands on this profile and its game. */
async function sameGameInNewTab(page: Page): Promise<void> {
  const tab = await page.context().newPage();
  await tab.goto('/sliding-puzzle');
  await expect(tab).toHaveURL(GENERATED_PROFILE_URL);
  await expect(board(tab)).toHaveAttribute('data-board', AFTER_TILE_11);
  await tab.close();
}

/** Tile 12 moved in the other browser and saved: this browser shows it after a reload. */
async function movedThereSeenHere(page: Page, other: Page): Promise<void> {
  await clickAndSave(other, tile(other, 12));
  await page.reload();
  await expect(board(page)).toHaveAttribute('data-board', AFTER_TILE_11_THEN_12);
  await expect(moves(page)).toHaveText('Moves: 4');
}

/** Tiles 12, 11 and 15 back to their places: solved, shown and announced. */
async function wins(page: Page): Promise<void> {
  await tile(page, 12).click();
  await tile(page, 11).click();
  await tile(page, 15).click();
  await expect(board(page)).toHaveAttribute('data-board', SOLVED_BOARD);
  await expect(solvedBanner(page)).toHaveText('Solved in 7 moves!');
  await expect(page.getByTestId('announcer')).toHaveText('Solved in 7 moves!');
  await theResult(page);
}

/** A new best, listed; no tile left to move; Reset unavailable and saying why. */
async function theResult(page: Page): Promise<void> {
  await expect(winResult(page)).toContainText('New best!');
  await expect(bestList(page)).toContainText('7 moves');
  await expect(movableTiles(page)).toHaveCount(0);
  await expect(page.getByTestId('reset')).toBeDisabled();
  await expect(page.getByTestId('reset')).toHaveAccessibleDescription(
    'Start a new game to play again.',
  );
}

/** A new game; plain numbers (never the first look) and 3D off, both unlike the defaults. */
async function newGameAndChoices(page: Page): Promise<void> {
  await page.getByTestId('new-game').click();
  await expect(solvedBanner(page)).toHaveCount(0);
  await expect(moves(page)).toHaveText('Moves: 0');
  await pickSkin(page, 'numbers');
  await expect(board(page)).toHaveAttribute('data-skin', 'numbers');
  await switch3d(page);
  await expect(scene(page)).toHaveCount(0);
}

/** After a reload the choices are kept; 3D on again draws the board. */
async function keptAfterReload(page: Page): Promise<void> {
  await page.reload();
  await expect(board(page)).toHaveAttribute('data-skin', 'numbers');
  await expect(toggle3d(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(scene(page)).toHaveCount(0);
  await switch3d(page);
  await expect(scene(page)).toHaveAttribute('data-webgl', 'ready', SCENE_TIMEOUT);
}

async function makesItTheirs(page: Page): Promise<void> {
  await newGameAndChoices(page);
  await keptAfterReload(page);
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
  await test.step('plays: a tap, a drag and Enter', () => tapDragAndKeys(page));
  await test.step('comes back: a refresh, a new tab, another browser both ways', () =>
    comesBack(page, otherBrowserPage));
  await test.step('wins', () => wins(page));
  await test.step('makes it theirs: a new game, numbers, 3D off, kept', () => makesItTheirs(page));
  await test.step('goes offline and back', () => offlineThenBack(page, otherBrowserPage));
  await test.step('opts out of usage statistics, and it is kept', async () => {
    await optOut(page);
    await expect(menu(page).getByTestId('usage-toggle')).toHaveText('Usage statistics: off');
  });
});
