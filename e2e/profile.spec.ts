import type { APIRequestContext, Page } from '@playwright/test';
import {
  board,
  currentNickname,
  invalidProfile,
  moves,
  openSwitcher,
  profileNotice,
  seedKnownGame,
  switchTo,
  tile,
} from './support/app.ts';
import { AFTER_TILE_11, KNOWN_BOARD } from './support/boards.ts';
import { expect, test, uniqueNickname } from './support/harness.ts';

const GENERATED_PROFILE_URL = /\/sliding-puzzle\/p\/[a-z]+-[a-z]+-\d{3}$/;

/** Puts the generated profile on the known board and moves once, so its board is a literal. */
async function moveOnceOnKnownBoard(page: Page, request: APIRequestContext): Promise<void> {
  await seedKnownGame(request, await currentNickname(page));
  await page.reload();
  await tile(page, 11).click();
  await expect(moves(page)).toHaveText('Moves: 1');
}

/** Opens the app's home in a new page of the same browser and expects the same game. */
async function expectSameGameInNewPage(page: Page): Promise<void> {
  const second = await page.context().newPage();
  await second.goto('/sliding-puzzle');
  await expect(second).toHaveURL(GENERATED_PROFILE_URL);
  await expect(board(second)).toHaveAttribute('data-board', AFTER_TILE_11);
  await expect(moves(second)).toHaveText('Moves: 1');
}

/** The first visit: a generated profile in the URL, its game and the notice. */
async function expectGeneratedProfile(page: Page): Promise<void> {
  await page.goto('/sliding-puzzle');
  await expect(page).toHaveURL(GENERATED_PROFILE_URL);
  await expect(board(page)).toBeVisible();
  await expect(profileNotice(page)).toHaveText(
    'There is no login. Anyone with this link can play this profile.',
  );
}

test('a first visit lands in a generated profile that the browser remembers', async ({
  page,
  request,
}) => {
  await test.step('the first visit puts a generated profile in the URL and shows the game', () =>
    expectGeneratedProfile(page));
  await test.step('a refresh keeps the URL and the same board', async () => {
    await moveOnceOnKnownBoard(page, request);
    await page.reload();
    await expect(page).toHaveURL(GENERATED_PROFILE_URL);
    await expect(board(page)).toHaveAttribute('data-board', AFTER_TILE_11);
  });
  await test.step('home in a new page of the same browser lands on that profile', () =>
    expectSameGameInNewPage(page));
});

/** The one action of the invalid-name screen: a working game, with focus on the profile heading. */
async function expectNewRandomFromInvalid(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Play as a new random profile' }).click();
  await expect(page).toHaveURL(GENERATED_PROFILE_URL);
  await expect(moves(page)).toHaveText('Moves: 0');
  await expect(page.getByRole('heading', { level: 2 })).toBeFocused();
}

test('an unusable profile URL explains itself and offers a new random profile', async ({
  page,
}) => {
  await test.step('a name that is too long is refused with the rule it breaks', async () => {
    await page.goto('/sliding-puzzle/p/abcdefghijklmnopqrstuvwxyz01234');
    await expect(invalidProfile(page)).toContainText('Nickname must be 2-30 characters.');
  });
  await test.step('a name with other characters is refused', async () => {
    await page.goto('/sliding-puzzle/p/ada.smith');
    await expect(invalidProfile(page)).toContainText('This profile name cannot be used');
  });
  await test.step('malformed percent-encoding is refused without a page error', async () => {
    await page.goto('/sliding-puzzle/p/%E0%A4%A');
    await expect(invalidProfile(page)).toContainText('“%E0%A4%A”');
  });
  await test.step('the new random profile action leads to a working game', () =>
    expectNewRandomFromInvalid(page));
});

/** Two profiles on the known board; the first is opened and moved once. */
async function openFirstOfTwo(
  page: Page,
  request: APIRequestContext,
  first: string,
  second: string,
): Promise<void> {
  await seedKnownGame(request, first);
  await seedKnownGame(request, second);
  await page.goto(`/sliding-puzzle/p/${first}`);
  await tile(page, 11).click();
  await expect(moves(page)).toHaveText('Moves: 1');
}

/** Back shows the first profile's game, Forward the second's again. */
async function expectBackAndForward(page: Page): Promise<void> {
  await page.goBack();
  await expect(page).toHaveURL(/-one$/);
  await expect(board(page)).toHaveAttribute('data-board', AFTER_TILE_11);
  await page.goForward();
  await expect(page).toHaveURL(/-two$/);
  await expect(moves(page)).toHaveText('Moves: 0');
}

/** "New random profile" pushes a new entry; Back returns to the second profile. */
async function expectNewRandomThenBack(page: Page): Promise<void> {
  await openSwitcher(page);
  await page.getByRole('button', { name: 'New random profile' }).click();
  await expect(page).toHaveURL(GENERATED_PROFILE_URL);
  await expect(moves(page)).toHaveText('Moves: 0');
  await page.goBack();
  await expect(page).toHaveURL(/-two$/);
}

test('switching profiles, then Back and Forward show each its own game', async ({
  page,
  request,
}) => {
  const second = `${uniqueNickname()}-two`;
  await openFirstOfTwo(page, request, `${uniqueNickname()}-one`, second);
  await test.step('an invalid typed nickname shows the rule and stays on the profile', async () => {
    await switchTo(page, 'a');
    await expect(page.getByTestId('profile-error')).toHaveText('nickname must be 2-30 characters');
    await expect(page).toHaveURL(/-one$/);
  });
  await test.step('a typed nickname goes to its URL and its game', async () => {
    await switchTo(page, second);
    await expect(page).toHaveURL(/-two$/);
    await expect(board(page)).toHaveAttribute('data-board', KNOWN_BOARD);
  });
  await test.step('Back and Forward between the two', () => expectBackAndForward(page));
  await test.step('a new random profile and Back', () => expectNewRandomThenBack(page));
});
