// The sound controls: the speaker in the top-right corner and the two switches in the menu. What
// is heard cannot be checked here; that the choices are made and kept can. (The push sound is
// checked where the row is pushed, in moving.spec.ts.)
import type { Page } from '@playwright/test';
import { openProfile, startKnownGame } from './support/app.ts';
import { expect, test, uniqueNickname } from './support/harness.ts';
import { openMenu } from './support/menu.ts';

const speaker = (page: Page) => page.getByTestId('sound-toggle');
const music = (page: Page) => page.getByTestId('sound-music');
const effects = (page: Page) => page.getByTestId('sound-effects');

/** Music off in the menu: after a reload it is off, and the effects are still on. */
async function musicOff(page: Page, nickname: string): Promise<void> {
  await openMenu(page);
  await music(page).click();
  await openProfile(page, nickname);
  await expect(music(page)).not.toBeChecked();
  await expect(effects(page)).toBeChecked();
}

test('music, effects and the speaker are switched each on its own, and kept after a reload', async ({
  page,
  request,
}) => {
  const nickname = uniqueNickname();
  await startKnownGame(page, request, nickname);
  await test.step('music off on its own', () => musicOff(page, nickname));
  await test.step('effects off too', async () => {
    await openMenu(page);
    await effects(page).click();
    await openProfile(page, nickname);
    await expect(effects(page)).not.toBeChecked();
  });
  await test.step('the speaker mutes everything', async () => {
    await expect(speaker(page)).toHaveAttribute('aria-pressed', 'true');
    await speaker(page).click();
    await openProfile(page, nickname);
  });

  await expect(speaker(page)).toHaveAttribute('aria-pressed', 'false');
});
