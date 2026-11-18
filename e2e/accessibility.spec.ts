import type { Page } from '@playwright/test';
import {
  invalidProfile,
  moves,
  openSwitcher,
  profileNotice,
  solvedBanner,
  startKnownGame,
  tile,
} from './support/app.ts';
import { expect, expectAccessible, test, uniqueNickname } from './support/harness.ts';

/** The first visit: the profile bar with the switcher open, above the game. */
async function checkFirstVisit(page: Page): Promise<void> {
  await page.goto('/sliding-puzzle');
  await expect(profileNotice(page)).toBeVisible();
  await expect(moves(page)).toHaveText('Moves: 0');
  await openSwitcher(page);
  await expectAccessible(page);
}

async function checkInvalidName(page: Page): Promise<void> {
  await page.goto('/sliding-puzzle/p/a');
  await expect(invalidProfile(page)).toBeVisible();
  await expectAccessible(page);
}

test('the profile screens and the game have no accessibility violations', async ({
  page,
  request,
}) => {
  await test.step('the first visit with the switcher open', () => checkFirstVisit(page));
  await test.step('the invalid-name screen', () => checkInvalidName(page));
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
