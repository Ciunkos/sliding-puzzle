import { expect, test } from '@playwright/test';
import { readBoard, signIn, uniqueNickname } from './helpers.ts';

test('an invalid nickname shows an error and keeps the picker open', async ({ page }) => {
  await page.goto('/');

  await page.getByTestId('nickname-input').fill('a');
  await page.getByTestId('profile-submit').click();
  await expect(page.getByTestId('profile-error')).toContainText('2-20 characters');
  await expect(page.getByTestId('nickname-input')).toBeVisible();
  await expect(page.getByTestId('current-profile')).toHaveCount(0);

  await page.getByTestId('nickname-input').fill('bad name!');
  await page.getByTestId('profile-submit').click();
  await expect(page.getByTestId('profile-error')).toContainText('may only contain');
  await expect(page.getByTestId('current-profile')).toHaveCount(0);
});

test('a valid nickname shows the current profile', async ({ page }) => {
  const nickname = uniqueNickname('profile');

  await signIn(page, nickname);

  await expect(page.getByTestId('current-profile')).toHaveText(nickname);
  await expect(page.getByTestId('profile-error')).toHaveCount(0);
});

test('reload remembers the last nickname and resumes the same board', async ({ page }) => {
  const nickname = uniqueNickname('remember');
  await signIn(page, nickname);
  const before = await readBoard(page);

  await page.reload();
  await expect(page.getByTestId('nickname-input')).toHaveValue(nickname);

  await signIn(page, nickname);
  await expect(page.getByTestId('moves')).toHaveText('Moves: 0');
  expect(await readBoard(page)).toEqual(before);
});

test('switch profile returns to the picker', async ({ page }) => {
  const nickname = uniqueNickname('switch');
  await signIn(page, nickname);

  await page.getByTestId('switch-profile').click();

  await expect(page.getByTestId('nickname-input')).toBeVisible();
  await expect(page.getByTestId('current-profile')).toHaveCount(0);
  await expect(page.getByTestId('board')).toHaveCount(0);
});
