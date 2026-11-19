// Steps and locators of the game's menu: a modal dialog behind the menu button that holds the
// profile, the board size, the board's look and the usage statistics. No expected values are
// decided here.
import type { Locator, Page } from '@playwright/test';
import { expect } from './harness.ts';

export const menuButton = (page: Page) => page.getByTestId('menu-button');
export const menu = (page: Page) => page.getByTestId('menu');

/** Opens the menu unless it is open already. */
export async function openMenu(page: Page): Promise<void> {
  if (!(await menu(page).isVisible())) await menuButton(page).click();
  await expect(menu(page)).toBeVisible();
}

/** Closes the menu with Escape, if it is open. */
export async function closeMenu(page: Page): Promise<void> {
  if (await menu(page).isVisible()) await page.keyboard.press('Escape');
  await expect(menu(page)).toBeHidden();
}

/** Opens the menu and starts a new game of `size` x `size` (picking a size closes the menu). */
export async function chooseSize(page: Page, size: number): Promise<void> {
  await openMenu(page);
  await page.getByTestId(`size-${String(size)}`).click();
  await expect(menu(page)).toBeHidden();
}

/** Opens the menu, switches the 3D board on or off, and closes the menu again. */
export async function switch3d(page: Page): Promise<void> {
  await openMenu(page);
  await page.getByTestId('toggle-3d').click();
  await closeMenu(page);
}

/** Whether the element that has focus is inside `container`. */
export function holdsFocus(container: Locator): Promise<boolean> {
  return container.evaluate((element) => element.contains(document.activeElement));
}

/** The first-visit toast: who is playing, and that the link is the login. */
export const welcome = (page: Page) => page.getByTestId('welcome');
