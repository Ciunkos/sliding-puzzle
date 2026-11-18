import { signIn, submitNickname } from './support/app.ts';
import { expect, test } from './support/harness.ts';

const NICKNAME = 'picker-player';

test('a nickname is checked, opens the game and is remembered after a reload', async ({ page }) => {
  await test.step('an invalid nickname shows an error and stays on the picker', async () => {
    await submitNickname(page, 'a');
    await expect(page.getByTestId('profile-error')).toBeVisible();
    await expect(page.getByTestId('current-profile')).toHaveCount(0);
  });
  await test.step('a valid nickname opens the game showing that nickname', async () => {
    await signIn(page, NICKNAME);
    await expect(page.getByTestId('current-profile')).toHaveText(NICKNAME);
  });
  await test.step('after a reload the picker is pre-filled with the last nickname', async () => {
    await page.reload();
    await expect(page.getByTestId('nickname-input')).toHaveValue(NICKNAME);
  });
});
