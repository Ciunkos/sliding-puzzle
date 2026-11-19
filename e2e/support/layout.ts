// Steps and measurements of the page layout: screen sizes and overflow. No expected values are
// decided here.
import type { Locator, Page } from '@playwright/test';

/** A small phone, the narrowest screen the page is made for. */
export const SMALL_PHONE = { width: 320, height: 568 };
/** A common Android phone. */
export const PHONE = { width: 360, height: 640 };
/** A common iPhone. */
export const TALL_PHONE = { width: 390, height: 844 };
/** A tablet held upright. */
export const TABLET = { width: 768, height: 1024 };
/** A tablet held sideways. */
export const LANDSCAPE_TABLET = { width: 1024, height: 768 };
/** A desktop window a little wider than tall. */
export const SQUARE_WINDOW = { width: 1000, height: 850 };
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

/** The smaller side of an element on screen, in pixels: its touch target. */
export async function targetSize(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  return Math.min(box?.width ?? 0, box?.height ?? 0);
}

/** Whether the boxes of two elements on screen share any area. */
export async function overlap(first: Locator, second: Locator): Promise<boolean> {
  const a = await first.boundingBox();
  const b = await second.boundingBox();
  if (a === null || b === null) return false;
  const apart =
    a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
  return !apart;
}
