import { expect, test } from '@playwright/test';

test.describe('Basic Navigation @regression', () => {
  test('should show home page @smoke', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Welcome to composia-ai');
  });

  test('should navigate to Prompt page @smoke', async ({ page }) => {
    await page.goto('/');
    await page.click('text=Start prompting');
    await expect(page).toHaveURL(/\/prompt/);
    await expect(page.locator('h1')).toContainText('Prompt');
  });

  test('should navigate to Login page @smoke', async ({ page }) => {
    await page.goto('/');
    await page.click('text=Login');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('h1')).toContainText('Login');
  });
});
