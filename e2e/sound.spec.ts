// The sound controls: the speaker in the top-right corner and the two switches in the menu. What
// is heard cannot be checked here; that the choices are made and kept can.
import { startKnownGame, openProfile } from './support/app.ts';
import { dragTo, pressTile, recordTones, scheduled } from './support/drag.ts';
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

test('pushing a row of two blocks makes the push sound: a lower body and its overtone', async ({
  page,
  request,
}) => {
  await recordTones(page);
  await startKnownGame(page, request, uniqueNickname());
  // 13 is two cells from the gap, 14 between: a push moves both (2 moves, the third wood, 254 Hz).
  const from = await pressTile(page, 13);

  await dragTo(page, from, from.cell * 0.5, 0);
  await page.mouse.up();

  // The push of two on that wood: its body at 0.8 of 254 Hz, 203 Hz, and its overtone, 560 Hz.
  await expect.poll(() => scheduled(page, [203, 560])).toBe(true);
});
