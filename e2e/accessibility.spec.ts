import { moves, solvedBanner, startKnownGame, tile } from './support/app.ts';
import { expect, expectAccessible, test, uniqueNickname } from './support/harness.ts';

test('the picker and the game have no accessibility violations', async ({ page, request }) => {
  await test.step('the profile picker', async () => {
    await page.goto('/sliding-puzzle');
    await expect(page.getByTestId('nickname-input')).toBeVisible();
    await expectAccessible(page);
  });
  await test.step('the game on the known board', async () => {
    await startKnownGame(page, request, uniqueNickname());
    await expect(moves(page)).toHaveText('Moves: 0');
    await expectAccessible(page);
  });
  await test.step('the solved game', async () => {
    await tile(page, 15).click();
    await expect(solvedBanner(page)).toBeVisible();
    await expectAccessible(page);
  });
});
