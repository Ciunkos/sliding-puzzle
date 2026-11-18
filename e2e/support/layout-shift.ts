// Layout shift of a first visit, as Lighthouse's Cumulative Layout Shift counts it: the sum of every
// `layout-shift` entry not caused by input. No expected values are decided here.
import type { Page } from '@playwright/test';
import { expect } from './harness.ts';

/** A phone screen, the one Lighthouse's mobile run uses. */
const PHONE = { width: 412, height: 823 };
/** How long the profile's answer is held back: long enough for "Loading profile…" to be painted. */
const SLOW_PROFILE_MS = 800;
/** How long the page is watched after the 3D board has drawn its first frame. */
const SETTLE_MS = 1000;

/** Sums the page's layout shifts from its first paint on (buffered), in a global the test reads. */
function recordShifts(): void {
  Reflect.set(window, 'layoutShiftTotal', 0);
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const shift: unknown = entry;
      const value: unknown = Reflect.get(shift as object, 'value');
      const byInput: unknown = Reflect.get(shift as object, 'hadRecentInput');
      const total: unknown = Reflect.get(window, 'layoutShiftTotal');
      if (byInput !== true && typeof value === 'number' && typeof total === 'number')
        Reflect.set(window, 'layoutShiftTotal', total + value);
    }
  }).observe({ type: 'layout-shift', buffered: true });
}

/**
 * Opens the app as a first visit on a phone screen, with the profile's answer held back as on a
 * slow network, and returns the sum of layout shifts until the 3D board is drawn and a second after.
 */
export async function firstVisitLayoutShift(page: Page): Promise<number> {
  await page.setViewportSize(PHONE);
  await page.addInitScript(recordShifts);
  await page.route('**/sliding-puzzle/api/profiles', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, SLOW_PROFILE_MS));
    await route.continue();
  });
  await page.goto('/sliding-puzzle');
  await expect(page.getByTestId('scene')).toHaveAttribute('data-webgl', 'ready');
  await page.waitForTimeout(SETTLE_MS);
  return page.evaluate(() => Number(Reflect.get(window, 'layoutShiftTotal')));
}
