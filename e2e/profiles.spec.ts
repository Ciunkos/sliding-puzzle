// Profiles without a login, the menu and accessibility, in depth: the addresses that cannot be
// used, switching between profiles with the browser's history, and every screen checked by axe
// and driven by the keyboard.
import type { APIRequestContext, Page } from '@playwright/test';
import {
  board,
  invalidProfile,
  moves,
  openProfile,
  openSwitcher,
  seedKnownGame,
  solvedBanner,
  startKnownGame,
  switchTo,
  tile,
} from './support/app.ts';
import { AFTER_TILE_11, KNOWN_BOARD } from './support/boards.ts';
import { expect, expectAccessible, test, uniqueNickname } from './support/harness.ts';
import { closeButton, holdsFocus, menu, menuButton, welcome } from './support/menu.ts';

const GENERATED_PROFILE_URL = /\/sliding-puzzle\/p\/[a-z]+-[a-z]+-\d{3}$/;

/** Three names that break the rules, each refused with what is wrong. */
async function refusesBadNames(page: Page): Promise<void> {
  await page.goto('/sliding-puzzle/p/abcdefghijklmnopqrstuvwxyz01234');
  await expect(invalidProfile(page)).toContainText('Nickname must be 2-30 characters.');
  await page.goto('/sliding-puzzle/p/ada.smith');
  await expect(invalidProfile(page)).toContainText('This profile name cannot be used');
  // Malformed percent-encoding: refused, without a page error (the harness fails on one).
  await page.goto('/sliding-puzzle/p/%E0%A4%A');
  await expect(invalidProfile(page)).toContainText('“%E0%A4%A”');
}

/** The screen's one action: a working game with focus on its heading; a key then leaves the toast. */
async function newRandomKeepsFocus(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Play as a new random profile' }).click();
  await expect(page).toHaveURL(GENERATED_PROFILE_URL);
  await expect(moves(page)).toHaveText('Moves: 0');
  await expect(page.getByRole('heading', { level: 2 })).toBeFocused();
  await page.keyboard.press('Shift');
  await expect(welcome(page)).toHaveCount(0);
}

test('an unusable profile address explains itself, and its one action leads to a game', async ({
  page,
}) => {
  await test.step('a first visit with a query keeps it in the profile address', async () => {
    await page.goto('/sliding-puzzle?fps');
    await expect(page).toHaveURL(/\/sliding-puzzle\/p\/[a-z]+-[a-z]+-\d{3}\?fps$/);
  });
  await test.step('names that break the rules are refused', () => refusesBadNames(page));
  await test.step('a new random profile is a game that keeps focus', () =>
    newRandomKeepsFocus(page));

  await expect(menuButton(page)).toBeFocused();
});

/** Two profiles on the known board; the first is opened, opened again (no toast), moved once. */
async function firstOfTwo(page: Page, request: APIRequestContext, first: string, second: string) {
  await seedKnownGame(request, second);
  await startKnownGame(page, request, first);
  await openProfile(page, first);
  await expect(welcome(page)).toHaveCount(0);
  await tile(page, 11).click();
  await expect(moves(page)).toHaveText('Moves: 1');
}

/** A typed name that breaks the rules stays; the second name goes to its game, focus kept. */
async function typesNames(page: Page, second: string): Promise<void> {
  await switchTo(page, 'a');
  await expect(page.getByTestId('profile-error')).toHaveText('nickname must be 2-30 characters');
  await expect(page).toHaveURL(/-one$/);
  await switchTo(page, second);
  await expect(page).toHaveURL(/-two$/);
  await expect(board(page)).toHaveAttribute('data-board', KNOWN_BOARD);
  await expect(menu(page)).toBeHidden();
  await expect(menuButton(page)).toBeFocused();
}

/** Back shows the first profile's game, Forward the second's; a new random one, and Back. */
async function history(page: Page): Promise<void> {
  await page.goBack();
  await expect(board(page)).toHaveAttribute('data-board', AFTER_TILE_11);
  await page.goForward();
  await newRandomThenBack(page);
}

async function newRandomThenBack(page: Page): Promise<void> {
  await expect(page).toHaveURL(/-two$/);
  await openSwitcher(page);
  await page.getByRole('button', { name: 'New random profile' }).click();
  await expect(page).toHaveURL(GENERATED_PROFILE_URL);
  await page.goBack();
  await expect(page).toHaveURL(/-two$/);
}

test('switching profiles by name, then Back and Forward, and a link in other casing', async ({
  page,
  otherBrowserPage,
  request,
}) => {
  const first = `${uniqueNickname()}-one`;
  await firstOfTwo(page, request, first, `${uniqueNickname()}-two`);
  await test.step('typed names: one refused, one played', () =>
    typesNames(page, `${uniqueNickname()}-two`));
  await test.step('Back, Forward and a new random profile', () => history(page));
  await test.step('the link in capitals opens the profile at its own address', async () => {
    await openProfile(otherBrowserPage, first.toUpperCase());
    await expect(otherBrowserPage).toHaveURL(/-one$/);
  });

  await expect(board(otherBrowserPage)).toHaveAttribute('data-board', AFTER_TILE_11);
});

/** Enter on the menu button opens it with focus inside; Tab wraps around both ways. */
async function menuByKeyboard(page: Page): Promise<void> {
  await menuButton(page).focus();
  await page.keyboard.press('Enter');
  await expect(closeButton(page)).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  expect(await holdsFocus(menu(page))).toBe(true);
  await page.keyboard.press('Tab');
  await expect(closeButton(page)).toBeFocused();
  await expect(menu(page).getByTestId('menu-profile-notice')).toHaveText(
    'There is no login. Anyone with this link can play this profile.',
  );
}

/** The first visit with the switcher open, and the invalid-name screen. */
async function profileScreens(page: Page): Promise<void> {
  await page.goto('/sliding-puzzle');
  await openSwitcher(page);
  await expectAccessible(page);
  await page.goto('/sliding-puzzle/p/a');
  await expect(invalidProfile(page)).toBeVisible();
  await expectAccessible(page);
}

test('every screen passes axe, and the menu is driven by the keyboard', async ({
  page,
  request,
}) => {
  await test.step('the profile screens', () => profileScreens(page));
  await test.step('the game, and the menu opened and closed with the keyboard', async () => {
    await startKnownGame(page, request, uniqueNickname());
    await expectAccessible(page);
    await menuByKeyboard(page);
    await expectAccessible(page);
    await page.keyboard.press('Escape');
    await expect(menuButton(page)).toBeFocused();
  });
  await test.step('the solved game', async () => {
    await tile(page, 15).click();
    await expectAccessible(page);
  });

  await expect(solvedBanner(page)).toBeVisible();
});
