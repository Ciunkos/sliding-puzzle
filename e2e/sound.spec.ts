// The sound controls: the speaker in the top-right corner and the two switches in the menu. What
// is heard cannot be checked here; that the choices are made and kept can.
import { startKnownGame, openProfile } from './support/app.ts';
import { expect, test, uniqueNickname } from './support/harness.ts';
import { openMenu } from './support/menu.ts';

test('the speaker button mutes all sound, and the choice is kept after a reload', async ({
  page,
  request,
}) => {
  const nickname = uniqueNickname();
  await startKnownGame(page, request, nickname);
  const speaker = page.getByTestId('sound-toggle');
  await expect(speaker).toHaveAttribute('aria-pressed', 'true');

  await speaker.click();
  await openProfile(page, nickname);

  await expect(speaker).toHaveAttribute('aria-pressed', 'false');
});

test('the menu switches music off on its own, and the choice is kept after a reload', async ({
  page,
  request,
}) => {
  const nickname = uniqueNickname();
  await startKnownGame(page, request, nickname);
  await openMenu(page);
  await page.getByTestId('sound-music').click();

  await openProfile(page, nickname);

  await expect(page.getByTestId('sound-music')).not.toBeChecked();
  await expect(page.getByTestId('sound-effects')).toBeChecked();
});

test('the menu switches sound effects off on their own, and the choice is kept after a reload', async ({
  page,
  request,
}) => {
  const nickname = uniqueNickname();
  await startKnownGame(page, request, nickname);
  await openMenu(page);
  await page.getByTestId('sound-effects').click();

  await openProfile(page, nickname);

  await expect(page.getByTestId('sound-effects')).not.toBeChecked();
  await expect(page.getByTestId('sound-music')).toBeChecked();
});
