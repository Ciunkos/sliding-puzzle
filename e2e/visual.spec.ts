import type { Page } from '@playwright/test';
import { board, moves, openProfile, startKnownGame, tile } from './support/app.ts';
import { AFTER_TILE_11 } from './support/boards.ts';
import { expect, test, uniqueNickname } from './support/harness.ts';
import {
  choosePhoto,
  removePhoto,
  photoNote,
  pickSkin,
  scene,
  skinButton,
  toggle3d,
  withoutWebGl,
} from './support/look.ts';
import { closeMenu, openMenu, switch3d } from './support/menu.ts';

/** A 2 x 1 pixel PNG (one red, one blue pixel), made once with node:zlib outside the tests. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVR4nGP4z8DAwPAfAAcAAf9+CLHQAAAAAElFTkSuQmCC',
  'base64',
);

/** The tap on tile 11 of the known board: the DOM board and the 3D board agree on the result. */
async function tapAndCompare(page: Page): Promise<void> {
  await tile(page, 11).click();
  await expect(board(page)).toHaveAttribute('data-board', AFTER_TILE_11);
  await expect(scene(page)).toHaveAttribute('data-scene-board', AFTER_TILE_11);
  await expect(moves(page)).toHaveText('Moves: 1');
}

test('the 3D board is drawn under the buttons and shows the board after a tap', async ({
  page,
  request,
}) => {
  await startKnownGame(page, request, uniqueNickname());
  await test.step('the scene draws its first frame, and the buttons hand their looks over', async () => {
    // The 3D chunk loads after first paint; on a machine without a GPU that takes a while.
    await expect(scene(page)).toHaveAttribute('data-webgl', 'ready', { timeout: 30_000 });
    await expect(scene(page).locator('canvas')).toHaveCount(1);
    await expect(board(page)).toHaveClass(/sp-layered/);
  });
  await test.step('a tap moves the tile in both layers', () => tapAndCompare(page));
});

test('a bundled picture and the 3D switch are remembered by this browser', async ({
  page,
  request,
}) => {
  const nickname = uniqueNickname();
  await startKnownGame(page, request, nickname);
  await test.step('choosing the rocket shows it on the board', async () => {
    await pickSkin(page, 'rocket');
    await expect(board(page)).toHaveAttribute('data-skin', 'rocket');
    await expect(skinButton(page, 'rocket')).toHaveAttribute('aria-pressed', 'true');
  });
  await test.step('3D off removes the 3D board; the flat board shows the picture and plays', () =>
    switchOff3d(page));
  await test.step('after a reload the rocket and 3D off are still chosen', async () => {
    await openProfile(page, nickname);
    await expect(board(page)).toHaveAttribute('data-skin', 'rocket');
    await expect(toggle3d(page)).toHaveAttribute('aria-pressed', 'false');
  });
});

/** 3D off: no 3D board, the flat tiles show their square of the picture, and a tap plays. */
async function switchOff3d(page: Page): Promise<void> {
  await switch3d(page);
  await expect(scene(page)).toHaveCount(0);
  await expect(tile(page, 1).locator('.sp-picture')).toHaveCSS('background-size', '400% 400%');
  await tapAndMove(page);
}

/** One tap on tile 11 of the known board moves it. */
async function tapAndMove(page: Page): Promise<void> {
  await tile(page, 11).click();
  await expect(board(page)).toHaveAttribute('data-board', AFTER_TILE_11);
}

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

test('without WebGL the flat board is shown and plays', async ({ page, request }) => {
  await withoutWebGl(page);
  await startKnownGame(page, request, uniqueNickname());
  await openMenu(page);
  await expect(
    page.getByText('This browser cannot draw the 3D board, so the flat board is shown.'),
  ).toBeVisible();
  await closeMenu(page);
  await expect(scene(page)).toHaveCount(0);
  await expect(board(page)).not.toHaveClass(/sp-layered/);
  await tapAndMove(page);
});

test('a first visit starts on a bundled picture, not on plain numbers', async ({ page }) => {
  await page.goto('/sliding-puzzle');

  await expect(board(page)).toHaveAttribute('data-skin', /^(rocket|cat|balloon|fish|castle)$/);
});

test('a tile that cannot move wiggles when it is tapped, and nothing moves', async ({
  page,
  request,
}) => {
  await startKnownGame(page, request, uniqueNickname());

  await tile(page, 1).dispatchEvent('click');

  await expect(tile(page, 1)).toHaveAttribute('data-nudge', /^[ab]$/);
  await expect(moves(page)).toHaveText('Moves: 0');
  await expect(page.locator('[data-nudge]')).toHaveCount(0);
});

test('an arrow key that moves nothing wiggles no tile, even held down', async ({
  page,
  request,
}) => {
  await startKnownGame(page, request, uniqueNickname());
  await tile(page, 1).focus();

  // The blank is on the bottom row: nothing is below it to slide up.
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('ArrowUp');
  await page.keyboard.up('ArrowUp');

  await expect(moves(page)).toHaveText('Moves: 0');
  await expect(page.locator('[data-nudge]')).toHaveCount(0);
});

test('the shake of a move is over once it has played, so nothing replays it later', async ({
  page,
  request,
}) => {
  await startKnownGame(page, request, uniqueNickname());
  await switch3d(page);

  await tile(page, 11).click();

  await expect(page.locator('[data-shake]')).toHaveCount(1);
  await expect(page.locator('[data-shake]')).toHaveCount(0);
});
