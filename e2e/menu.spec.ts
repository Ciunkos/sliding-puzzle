// The menu (a modal dialog behind the corner button) and the first-visit toast.
import type { Page } from '@playwright/test';
import { board, movableTiles, openProfile, profileNotice, startKnownGame } from './support/app.ts';
import { expect, expectAccessible, test, uniqueNickname } from './support/harness.ts';
import { holdsFocus, menu, menuButton, welcome } from './support/menu.ts';

/** The menu opened from its button with the keyboard: focus moves into it. */
async function openWithKeyboard(page: Page): Promise<void> {
  await menuButton(page).focus();
  await page.keyboard.press('Enter');
  await expect(menu(page)).toBeVisible();
}

test('the menu opens from its button, keeps focus inside, and Escape gives focus back', async ({
  page,
  request,
}) => {
  await startKnownGame(page, request, uniqueNickname());
  await test.step('Enter on the menu button opens the menu with focus inside it', async () => {
    await openWithKeyboard(page);
    expect(await holdsFocus(menu(page))).toBe(true);
  });
  await test.step('Tab and Shift+Tab stay inside the open menu', async () => {
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    expect(await holdsFocus(menu(page))).toBe(true);
  });
  await test.step('Escape closes the menu and focus is back on the menu button', async () => {
    await page.keyboard.press('Escape');
    await expect(menu(page)).toBeHidden();
    await expect(menuButton(page)).toBeFocused();
  });
});

test('the open menu has no accessibility violations', async ({ page, request }) => {
  await startKnownGame(page, request, uniqueNickname());
  await openWithKeyboard(page);

  await expect(menu(page).getByTestId('current-profile')).toBeVisible();
  await expectAccessible(page);
});

test('a first visit shows a toast with the player and the notice, over the game', async ({
  page,
}) => {
  await page.goto('/sliding-puzzle');
  await expect(board(page)).toBeVisible();

  await expect(welcome(page)).toContainText('Playing as');
  await expect(welcome(page).getByTestId('profile-notice')).toHaveText(
    'There is no login. Anyone with this link can play this profile.',
  );
  await expect(profileNotice(page)).toBeVisible();
});

test('a profile this browser has played before opens without the toast', async ({
  page,
  request,
}) => {
  const nickname = uniqueNickname();
  await startKnownGame(page, request, nickname);
  await openProfile(page, nickname);

  await expect(welcome(page)).toHaveCount(0);
});

test('the first-visit toast goes away with the first move', async ({ page }) => {
  await page.goto('/sliding-puzzle');
  await expect(welcome(page)).toBeVisible();

  await movableTiles(page).first().click();

  await expect(welcome(page)).toHaveCount(0);
});
