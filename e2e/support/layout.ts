// Steps and measurements of the page layout: screen sizes and overflow. No expected values are
// decided here.
import type { Page } from '@playwright/test';

/** A small phone, the narrowest screen the page is made for. */
export const SMALL_PHONE = { width: 320, height: 568 };
/** A common Android phone. */
export const PHONE = { width: 360, height: 640 };
/** A common iPhone. */
export const TALL_PHONE = { width: 390, height: 844 };
/** A tablet held upright. */
export const TABLET = { width: 768, height: 1024 };
/** A laptop screen. */
export const DESKTOP = { width: 1440, height: 900 };

export const newGameButton = (page: Page) => page.getByTestId('new-game');
export const resetButton = (page: Page) => page.getByTestId('reset');

/**
 * Whether the document scrolls, each way: true when it is taller (or wider) than the screen.
 */
export function scrolls(page: Page): Promise<{ vertically: boolean; sideways: boolean }> {
  return page.evaluate(() => ({
    vertically: document.documentElement.scrollHeight > window.innerHeight,
    sideways: document.documentElement.scrollWidth > window.innerWidth,
  }));
}
