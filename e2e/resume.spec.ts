import { expect, test } from '@playwright/test';
import { makeMove, readBoard, signIn, uniqueNickname } from './helpers.ts';

test('the same profile resumes its saved game in another browser', async ({
  page,
  browser,
}, testInfo) => {
  const nickname = uniqueNickname('resume');

  // Browser A: play three moves.
  await signIn(page, nickname);
  await makeMove(page, 1);
  await makeMove(page, 2);
  await makeMove(page, 3);
  const savedBoard = await readBoard(page);

  // Browser B: a separate context (empty localStorage), nickname in another casing.
  // browser.newContext() does not inherit the project's baseURL, so pass it explicitly.
  const contextB = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  try {
    const pageB = await contextB.newPage();
    await signIn(pageB, nickname.toUpperCase());

    await expect(pageB.getByTestId('moves')).toHaveText('Moves: 3');
    expect(await readBoard(pageB)).toEqual(savedBoard);

    // A move in B is saved too.
    await makeMove(pageB, 4);
    const boardFromB = await readBoard(pageB);

    // Browser A sees the newer state after reloading and signing in again.
    await page.reload();
    await signIn(page, nickname);
    await expect(page.getByTestId('moves')).toHaveText('Moves: 4');
    expect(await readBoard(page)).toEqual(boardFromB);
  } finally {
    await contextB.close();
  }
});
