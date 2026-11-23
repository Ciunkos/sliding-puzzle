// The board's look, in depth: the 3D board, the pictures, the player's own photo, a browser
// without WebGL, and the board sizes.
import type { Page } from '@playwright/test';
import {
  board,
  movableTiles,
  moves,
  openProfile,
  sizeChoice,
  startKnownGame,
  tile,
} from './support/app.ts';
import { AFTER_TILE_11, KNOWN_BOARD } from './support/boards.ts';
import { expect, test, uniqueNickname } from './support/harness.ts';
import {
  choosePhoto,
  photoNote,
  pickSkin,
  removePhoto,
  scene,
  skinButton,
  toggle3d,
  withoutWebGl,
} from './support/look.ts';
import { chooseSize, closeMenu, openMenu, switch3d } from './support/menu.ts';

/** A 2 x 1 pixel PNG (one red, one blue pixel), made once with node:zlib outside the tests. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVR4nGP4z8DAwPAfAAcAAf9+CLHQAAAAAElFTkSuQmCC',
  'base64',
);

/** The scene draws its first frame, and the flat buttons hand their looks over to it. */
async function drawnIn3d(page: Page): Promise<void> {
  // The 3D chunk loads after first paint; on a machine without a GPU that takes a while.
  await expect(scene(page)).toHaveAttribute('data-webgl', 'ready', { timeout: 30_000 });
  await expect(scene(page).locator('canvas')).toHaveCount(1);
  await expect(board(page)).toHaveClass(/sp-layered/);
}

/** The tap on tile 11 of the known board: the DOM board and the 3D board agree on the result. */
async function tapInBothLayers(page: Page): Promise<void> {
  await tile(page, 11).click();
  await expect(board(page)).toHaveAttribute('data-board', AFTER_TILE_11);
  await expect(scene(page)).toHaveAttribute('data-scene-board', AFTER_TILE_11);
}

/** The rocket, then 3D off: no 3D board, each flat tile shows its square of the picture. */
async function flatRocket(page: Page): Promise<void> {
  await pickSkin(page, 'rocket');
  await expect(skinButton(page, 'rocket')).toHaveAttribute('aria-pressed', 'true');
  await switch3d(page);
  await expect(scene(page)).toHaveCount(0);
  await expect(tile(page, 1).locator('.sp-picture')).toHaveCSS('background-size', '400% 400%');
}

/** Tile 11 tapped back up on the flat board: the move shakes the board once, then it is over. */
async function shakesOnce(page: Page): Promise<void> {
  await tile(page, 11).click();
  await expect(board(page)).toHaveAttribute('data-board', KNOWN_BOARD);
  await expect(page.locator('[data-shake]')).toHaveCount(1);
  await expect(page.locator('[data-shake]')).toHaveCount(0);
}

test('the 3D board follows a tap; a picture on the flat board shakes once; both are remembered', async ({
  page,
  request,
}) => {
  const nickname = uniqueNickname();
  await startKnownGame(page, request, nickname);
  await test.step('the 3D board is drawn under the buttons', () => drawnIn3d(page));
  await test.step('a tap moves the tile in both layers', () => tapInBothLayers(page));
  await test.step('the rocket on the flat board', () => flatRocket(page));
  await test.step('a move on the flat board shakes it once', () => shakesOnce(page));
  await test.step('after a reload the rocket and 3D off are still chosen', async () => {
    await openProfile(page, nickname);
    await expect(board(page)).toHaveAttribute('data-skin', 'rocket');
    await expect(toggle3d(page)).toHaveAttribute('aria-pressed', 'false');
  });
});

/** A text file is refused with a quiet sentence; then a PNG becomes the picture. */
async function refuseThenChoose(page: Page): Promise<void> {
  await choosePhoto(page, {
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hello'),
  });
  await expect(photoNote(page)).toHaveText('That file is not a picture. Choose a photo instead.');
  await page
    .getByTestId('photo-input')
    .setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: TINY_PNG });
  await expect(board(page)).toHaveAttribute('data-skin', 'photo');
}

test('the player’s own photo becomes the picture, stays after a reload, and can be removed', async ({
  page,
  request,
}) => {
  const nickname = uniqueNickname();
  await startKnownGame(page, request, nickname);
  await test.step('a file that is not a picture is refused quietly, a photo is chosen', () =>
    refuseThenChoose(page));
  await test.step('after a reload the photo is still the picture', async () => {
    await openProfile(page, nickname);
    await expect(board(page)).toHaveAttribute('data-skin', 'photo');
  });
  await test.step('removing the photo goes back to numbers', async () => {
    await removePhoto(page);
    await expect(board(page)).toHaveAttribute('data-skin', 'numbers');
  });
});

test('without WebGL the menu says why the board is flat, and the flat board plays', async ({
  page,
  request,
}) => {
  await withoutWebGl(page);
  await startKnownGame(page, request, uniqueNickname());
  await openMenu(page);
  await expect(
    page.getByText('This browser cannot draw the 3D board, so the flat board is shown.'),
  ).toBeVisible();
  await closeMenu(page);
  await tile(page, 11).click();
  await expect(board(page)).not.toHaveClass(/sp-layered/);
  await expect(board(page)).toHaveAttribute('data-board', AFTER_TILE_11);
});

/** With reduced motion: 3x3 starts a game of 9 cells whose tiles do not animate but still move. */
async function threeByThreeWithoutMotion(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await chooseSize(page, 3);
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
    await expect(tile(page, 1)).toHaveCSS('transition-duration', '0.3s');
  });
  await test.step('3x3 starts a game of 9 cells, and a tile still moves without motion', () =>
    threeByThreeWithoutMotion(page));
  await test.step('5x5 starts a game of 25 cells', async () => {
    await chooseSize(page, 5);
    await expect(board(page)).toHaveAttribute('data-board', /^\d+(,\d+){24}$/);
    await expect(moves(page)).toHaveText('Moves: 0');
  });
});
