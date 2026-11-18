import { expect, test } from '@playwright/test';

test('the app loads and asks who is playing', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Who is playing?')).toBeVisible();
});
