import { expect, test } from '@playwright/test';

test.describe('Navigation and Public Pages @regression', () => {
  test('shows top navigation on home page @smoke', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Welcome to composia-ai');
    await expect(page.getByRole('link', { name: 'composia-ai' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Prompt', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'History', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Login', exact: true })).toBeVisible();
  });

  test('shows OAuth buttons on login page', async ({ page }) => {
    await page.route('**/api/auth/methods', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          authMode: 'both',
          local: true,
          oauth: {
            enabled: true,
            providers: {
              google: true,
              github: true,
            },
          },
        }),
      });
    });

    await page.goto('/login');
    await expect(page.getByRole('link', { name: 'Login with Google' })).toHaveAttribute(
      'href',
      '/api/auth/oauth/google'
    );
    await expect(page.getByRole('link', { name: 'Login with GitHub' })).toHaveAttribute(
      'href',
      '/api/auth/oauth/github'
    );
  });
});
