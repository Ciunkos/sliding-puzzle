// Moving tiles by hand, in depth: everything a finger, a mouse or a key can do on the board, and
// what it must not do. Each flow plays on from the known board (support/boards.ts): tile 11 above
// the gap, 14 left of it, 15 right of it. A held tile moves once it has gone 0.3 of a cell
// (input.ts COMMIT_SHARE), while the finger is still down.
import type { Page } from '@playwright/test';
import { board, moves, startKnownGame, tile, movableTiles } from './support/app.ts';
import {
  AFTER_TILE_11,
  AFTER_TILE_11_THEN_12,
  AFTER_TILE_14,
  BOTTOM_ROW_PUSHED,
  KNOWN_BOARD,
} from './support/boards.ts';
import {
  boardEdge,
  commitBatches,
  dragTo,
  flickDown,
  pressTile,
  pull,
  recordTones,
  scheduled,
  tileCentre,
  watchCommits,
} from './support/drag.ts';
import { expect, test, uniqueNickname } from './support/harness.ts';

const held = (page: Page) => page.locator('[data-held]');

/** Tile 11 held short of the threshold springs back, and is let go without a move. */
async function springsBack(page: Page): Promise<void> {
  const from = await pressTile(page, 11);
  await dragTo(page, from, 0, from.cell * 0.15);
  await expect(tile(page, 11)).toHaveClass(/sp-held/);
  await watchCommits(page);
  await page.mouse.up();
  await expect(tile(page, 11)).not.toHaveClass(/sp-held/);
  expect(await commitBatches(page)).toEqual([{ released: true, moved: false }]);
}

/** A right-click drag on tile 11 starts no drag. */
async function rightClickDrag(page: Page): Promise<void> {
  const from = await tileCentre(page, 11);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down({ button: 'right' });
  await dragTo(page, from, 0, from.cell * 0.6);
  await page.mouse.up({ button: 'right' });
}

/** A press just inside the board's edge, let go just outside it, ends there. */
async function pressOffTheBoard(page: Page): Promise<void> {
  const edge = await boardEdge(page);
  await page.mouse.move(edge.x - 2, edge.y);
  await page.mouse.down();
  await page.mouse.move(edge.x + 6, edge.y, { steps: 2 });
  await page.mouse.up();
}

/** Neither a right-click drag nor a press let go off the board moves anything. */
async function startsNothing(page: Page): Promise<void> {
  await rightClickDrag(page);
  await pressOffTheBoard(page);
  await expect(board(page)).toHaveAttribute('data-board', KNOWN_BOARD);
}

/** Just short of the threshold in 16 ms: only the flick's speed moves tile 11 down. */
async function flicks(page: Page): Promise<void> {
  const from = await tileCentre(page, 11);
  await flickDown(page, from, from.cell * 0.28);
  await expect(board(page)).toHaveAttribute('data-board', AFTER_TILE_11);
  await tile(page, 11).click();
  await expect(board(page)).toHaveAttribute('data-board', KNOWN_BOARD);
}

/** Past the threshold tile 11 moves with the finger down, let go in the same update. */
async function movesBeforeTheLift(page: Page): Promise<void> {
  const from = await pressTile(page, 11);
  await dragTo(page, from, 0, from.cell * 0.15);
  await watchCommits(page);
  await dragTo(page, from, 0, from.cell * 0.45);
  await expect(board(page)).toHaveAttribute('data-board', AFTER_TILE_11);
  await page.mouse.up();
  expect((await commitBatches(page))[0]).toEqual({ released: true, moved: true });
}

/** With reduced motion tile 11 (now below the gap) is not drawn held, yet moves at the threshold. */
async function withoutMotion(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const from = await pressTile(page, 11);
  await dragTo(page, from, 0, -from.cell * 0.15);
  await expect(tile(page, 11)).not.toHaveClass(/sp-held/);
  await dragTo(page, from, 0, -from.cell * 0.45);
  await expect(board(page)).toHaveAttribute('data-board', KNOWN_BOARD);
  await page.mouse.up();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
}

/** Tile 12 held after a tap on 11; Reset lets go of it, and the rest of the drag moves nothing. */
async function resetWhileHeld(page: Page): Promise<void> {
  await tile(page, 11).click();
  const from = await pressTile(page, 12);
  await dragTo(page, from, -from.cell * 0.15, 0);
  await expect(held(page)).toHaveCount(1);
  await page.getByTestId('reset').dispatchEvent('click');
  await expect(held(page)).toHaveCount(0);
  await dragTo(page, from, -from.cell * 0.6, 0);
  await page.mouse.up();
}

test('a held tile springs back short of a third of a cell, moves past it, and a flick is enough', async ({
  page,
  request,
}) => {
  await startKnownGame(page, request, uniqueNickname());
  await test.step('held short of the threshold, it springs back', () => springsBack(page));
  await test.step('a right-click or a press off the board starts no drag', () =>
    startsNothing(page));
  await test.step('a quick short flick moves it, a tap brings it back', () => flicks(page));
  await test.step('past the threshold it moves before the finger lifts', () =>
    movesBeforeTheLift(page));
  await test.step('with reduced motion it still moves at the threshold', () => withoutMotion(page));
  await test.step('a reset while a tile is held lets go of it', () => resetWhileHeld(page));

  await expect(board(page)).toHaveAttribute('data-board', KNOWN_BOARD);
});

/** Tile 13, two cells from the gap, pushed: 14 and 13 move, and the push of two is heard. */
async function pushesTheRow(page: Page): Promise<void> {
  const from = await pressTile(page, 13);
  await dragTo(page, from, from.cell * 0.5, 0);
  await page.mouse.up();
  await expect(board(page)).toHaveAttribute('data-board', BOTTOM_ROW_PUSHED);
  await expect(moves(page)).toHaveText('Moves: 2');
  // The push of two (the third wood, 254 Hz): its body at 0.8 of that, 203 Hz, and its overtone.
  await expect.poll(() => scheduled(page, [203, 560])).toBe(true);
}

/** Tile 14 pulled a cell and a half moves once; pulled 1.2 cells back, once back. */
async function pullsThereAndBack(page: Page): Promise<void> {
  await pull(page, 14, 1.5);
  await expect(board(page)).toHaveAttribute('data-board', AFTER_TILE_14);
  await expect(moves(page)).toHaveText('Moves: 1');
  await pull(page, 14, -1.2);
}

test('a row is pushed from its far end and heard; a long pull moves only the tile next to the gap', async ({
  page,
  request,
}) => {
  await recordTones(page);
  await startKnownGame(page, request, uniqueNickname());
  await test.step('the far end of the bottom row pushes the whole run', () => pushesTheRow(page));
  await test.step('Reset deals the starting board again', async () => {
    await page.getByTestId('reset').click();
    await expect(board(page)).toHaveAttribute('data-board', KNOWN_BOARD);
  });
  await test.step('a long pull and back moves once each way', () => pullsThereAndBack(page));

  await expect(board(page)).toHaveAttribute('data-board', KNOWN_BOARD);
  await expect(moves(page)).toHaveText('Moves: 2');
});

/** Only 11, 14 and 15 can move; tile 1 tapped wiggles and moves nothing, an impossible key neither. */
async function onlyNextToTheGap(page: Page): Promise<void> {
  await expect(movableTiles(page)).toHaveCount(3);
  await expect(tile(page, 1)).toBeDisabled();
  await tile(page, 1).dispatchEvent('click');
  await expect(tile(page, 1)).toHaveAttribute('data-nudge', /^[ab]$/);
  await expect(page.locator('[data-nudge]')).toHaveCount(0);
  // The gap is on the bottom row: nothing is below it to slide up, even with the key held.
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('ArrowUp');
  await page.keyboard.up('ArrowUp');
}

/** Down slides 11, left slides 12, D slides it back; focus follows the moved tile. */
async function arrowsAndWasd(page: Page): Promise<void> {
  await page.keyboard.press('ArrowDown');
  await expect(tile(page, 11)).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(board(page)).toHaveAttribute('data-board', AFTER_TILE_11_THEN_12);
  await expect(page.getByTestId('announcer')).toHaveText('Moved tile 12. 2 moves.');
  await page.keyboard.press('d');
  await expect(board(page)).toHaveAttribute('data-board', AFTER_TILE_11);
  await expect(tile(page, 12)).toBeFocused();
}

test('only tiles next to the gap move; the others wiggle; the keys slide tiles and focus follows', async ({
  page,
  request,
}) => {
  await startKnownGame(page, request, uniqueNickname());
  await tile(page, 1).focus();
  await test.step('only tiles next to the gap move', () => onlyNextToTheGap(page));
  await test.step('the arrow keys and WASD slide tiles', () => arrowsAndWasd(page));
  await test.step('Ctrl+S is a shortcut, not a move; Tab leaves the board', async () => {
    await page.keyboard.press('Control+s');
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('new-game')).toBeFocused();
  });

  await expect(moves(page)).toHaveText('Moves: 3');
  await expect(page.locator('[data-nudge]')).toHaveCount(0);
});
