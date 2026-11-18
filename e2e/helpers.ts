import { expect, type Page } from '@playwright/test';
import { z } from 'zod';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const SUFFIX_LENGTH = 8;
const PREFIX_LENGTH = 10;

const boardSchema = z.array(z.number().int().min(0).max(15)).length(16);

/** A nickname no other test uses. The database is shared, so every test needs its own profile. */
export function uniqueNickname(prefix: string): string {
  const safe = prefix.replace(/[^A-Za-z0-9_]/g, '').slice(0, PREFIX_LENGTH);
  let suffix = '';
  for (let i = 0; i < SUFFIX_LENGTH; i++) {
    suffix += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length));
  }
  return `${safe}_${suffix}`;
}

/** Opens the picker, signs in with the nickname and waits until the board is on screen. */
export async function signIn(page: Page, nickname: string): Promise<void> {
  await page.goto('/');
  await page.getByTestId('nickname-input').fill(nickname);
  await page.getByTestId('profile-submit').click();
  await expect(page.getByTestId('current-profile')).toBeVisible();
  await expect(page.getByTestId('board')).toBeVisible();
}

/** The 16 cells in board order, parsed from the board's data-board attribute. 0 is the blank. */
export async function readBoard(page: Page): Promise<number[]> {
  const raw = (await page.getByTestId('board').getAttribute('data-board')) ?? '';
  return boardSchema.parse(raw.split(',').map((cell) => Number(cell)));
}

/** Numbers of the tiles that can slide into the blank right now (enabled tile buttons). */
export async function movableTiles(page: Page): Promise<number[]> {
  const enabled = page.locator('button[data-testid^="tile-"]:enabled');
  await expect(enabled.first()).toBeVisible();
  const ids = await enabled.evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-testid') ?? ''),
  );
  return ids.map((id) => Number(id.replace('tile-', '')));
}

/** The number of the first enabled tile. Fails if the game has no legal move. */
export async function firstMovableTile(page: Page): Promise<number> {
  const [first] = await movableTiles(page);
  if (first === undefined) throw new Error('no movable tile on the board');
  return first;
}

/** Clicks the first movable tile and waits for the move counter to show the new total. */
export async function makeMove(page: Page, expectedMoves: number): Promise<number> {
  const tile = await firstMovableTile(page);
  await page.getByTestId(`tile-${String(tile)}`).click();
  await expect(page.getByTestId('moves')).toHaveText(`Moves: ${String(expectedMoves)}`);
  return tile;
}

/**
 * Solvability of a 4x4 board with goal [1..15, 0]: (inversions + blank row from the top, 0-based) must be odd.
 * Computed independently of the app, so the test does not trust the code it checks.
 */
export function isSolvableBoard(board: number[]): boolean {
  const tiles = board.filter((cell) => cell !== 0);
  let inversions = 0;
  tiles.forEach((a, i) => {
    for (const b of tiles.slice(i + 1)) {
      if (a > b) inversions++;
    }
  });
  const blankRow = Math.floor(board.indexOf(0) / 4);
  return (inversions + blankRow) % 2 === 1;
}
