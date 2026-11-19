// The menu (a modal dialog behind the corner button) and the first-visit toast.
import type { Page } from '@playwright/test';
import {
  board,
  movableTiles,
  openProfile,
  profileNotice,
  seedKnownGame,
  startKnownGame,
  switchTo,
} from './support/app.ts';
import { expect, expectAccessible, test, uniqueNickname } from './support/harness.ts';
import { closeButton, holdsFocus, menu, menuButton, welcome } from './support/menu.ts';

/** The menu opened from its button with the keyboard: focus moves into it. */
async function openWithKeyboard(page: Page): Promise<void> {
  await menuButton(page).focus();
  await page.keyboard.press('Enter');
  await expect(menu(page)).toBeVisible();
}

/** From the first control, Shift+Tab wraps to the last one, and Tab from there back to the first. */
async function wrapsBothWays(page: Page): Promise<void> {
  await expect(closeButton(page)).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(closeButton(page)).not.toBeFocused();
  expect(await holdsFocus(menu(page))).toBe(true);
  await page.keyboard.press('Tab');
  await expect(closeButton(page)).toBeFocused();
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
  await test.step('Tab wraps around inside the open menu, both ways', () => wrapsBothWays(page));
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
  await expect(menu(page).getByTestId('menu-profile-notice')).toHaveText(
    'There is no login. Anyone with this link can play this profile.',
  );
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

test('switching profile from the menu closes it and leaves focus on the menu button', async ({
  page,
  request,
}) => {
  const other = `${uniqueNickname()}-b`;
  await seedKnownGame(request, other);
  await startKnownGame(page, request, uniqueNickname());

  await switchTo(page, other);

  await expect(page).toHaveURL(/-b$/);
  await expect(menu(page)).toBeHidden();
  await expect(menuButton(page)).toBeFocused();
});

test('after leaving an unusable name, focus stays in the game when the toast goes', async ({
  page,
}) => {
  await page.goto('/sliding-puzzle/p/a');
  await page.getByRole('button', { name: 'Play as a new random profile' }).click();
  await expect(page.getByRole('heading', { level: 2 })).toBeFocused();

  await page.keyboard.press('Shift');

  await expect(welcome(page)).toHaveCount(0);
  await expect(menuButton(page)).toBeFocused();
});
