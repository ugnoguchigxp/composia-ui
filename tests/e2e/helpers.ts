import type { Page } from '@playwright/test';

export type TestUser = {
  id: string;
  email: string;
};

export const defaultUser: TestUser = {
  id: 'user-1',
  email: 'user@example.com',
};

export const mockAuthMe = async (page: Page, user: TestUser = defaultUser) => {
  await page.context().addCookies([
    {
      name: 'auth_hint',
      value: 'true',
      url: 'http://localhost:5173',
    },
  ]);
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        userId: user.id,
        email: user.email,
      }),
    });
  });
};

export const mockAuthMeUnauthorized = async (page: Page) => {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
      }),
    });
  });
};
