import { expect, test } from '@playwright/test';
import { defaultUser, mockAuthMeUnauthorized } from './helpers';

test.describe('Authentication Flows @regression', () => {
  test('logs in successfully with email/password @smoke', async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: defaultUser.id,
            email: defaultUser.email,
          },
        }),
      });
    });

    await page.goto('/login');
    await page.getByPlaceholder('Email').fill('user@example.com');
    await page.getByPlaceholder('Password').fill('DevTest!2026-Composia');
    await page.getByRole('button', { name: 'Login', exact: true }).click();

    await expect(page).toHaveURL('/');
    await expect(
      page.getByRole('button', { name: `User menu for ${defaultUser.email}` })
    ).toBeVisible();
  });

  test('shows login error when API returns 401', async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' },
        }),
      });
    });

    await page.goto('/login');
    await page.getByPlaceholder('Email').fill('user@example.com');
    await page.getByPlaceholder('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Login', exact: true }).click();

    await expect(page.getByText('Invalid email or password')).toBeVisible();
  });

  test('logs out and clears session @smoke', async ({ page }) => {
    await page.route('**/api/auth/login', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: defaultUser.id,
            email: defaultUser.email,
          },
        }),
      });
    });
    await page.route('**/api/auth/logout', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    await page.goto('/login');
    await page.getByPlaceholder('Email').fill('user@example.com');
    await page.getByPlaceholder('Password').fill('DevTest!2026-Composia');
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await page.getByRole('button', { name: `User menu for ${defaultUser.email}` }).click();
    await expect(page.getByRole('menuitem', { name: 'Logout' })).toBeVisible();

    await page.getByRole('menuitem', { name: 'Logout' }).click();

    await page.reload();
    await expect(page.getByRole('link', { name: 'Login' })).toBeVisible();
  });

  test('handles OAuth callback and redirects to home', async ({ page }) => {
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          userId: defaultUser.id,
          email: defaultUser.email,
        }),
      });
    });

    await page.goto('/oauth/callback');
    await expect(page).toHaveURL('/');
    await expect(
      page.getByRole('button', { name: `User menu for ${defaultUser.email}` })
    ).toBeVisible();
  });

  test('redirects OAuth callback to login when session is missing', async ({ page }) => {
    await mockAuthMeUnauthorized(page);
    await page.goto('/oauth/callback');
    await expect(page).toHaveURL('/login');
  });
});
