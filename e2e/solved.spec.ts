import { expect, test } from '@playwright/test';
import { movableTiles, signIn, uniqueNickname } from './helpers.ts';

const API_BASE = 'http://localhost:8788';

test('solving the near-solved game shows the banner and locks the board', async ({
  page,
  request,
}) => {
  const nickname = uniqueNickname('solved');
  await signIn(page, nickname);

  // Test-only endpoint: puts the profile in the solved board with tile 15 slid once, so the blank
  // sits at index 14 and is adjacent to tiles 11, 14 and 15. Only tile 15 solves the game.
  const setup = await request.post(
    `${API_BASE}/api/test/profiles/${encodeURIComponent(nickname)}/game/near-solved`,
  );
  expect(setup).toBeOK();

  await page.reload();
  await signIn(page, nickname);

  await expect(page.getByTestId('solved-banner')).toHaveCount(0);
  await expect(page.getByTestId('moves')).toHaveText('Moves: 0');
  expect(await movableTiles(page)).toEqual([11, 14, 15]);

  await page.getByTestId('tile-15').click();

  await expect(page.getByTestId('solved-banner')).toBeVisible();
  await expect(page.getByTestId('solved-banner')).toHaveText('Solved in 1 moves!');
  await expect(page.getByTestId('moves')).toHaveText('Moves: 1');
  await expect(page.locator('button[data-testid^="tile-"]:enabled')).toHaveCount(0);

  await page.getByTestId('new-game').click();

  await expect(page.getByTestId('solved-banner')).toHaveCount(0);
  await expect(page.getByTestId('moves')).toHaveText('Moves: 0');
});
