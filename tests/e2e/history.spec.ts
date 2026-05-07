import { expect, test } from '@playwright/test';
import { mockAuthMe } from './helpers';

const screenId = '11111111-1111-4111-8111-111111111111';

test.describe('Generated screen history @regression', () => {
  test('replays a saved generated screen @smoke', async ({ page }) => {
    await mockAuthMe(page);
    await page.route('**/api/screens**', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      const url = new URL(route.request().url());
      if (!url.pathname.match(/\/api\/screens\/?$/)) return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          screens: [
            {
              id: screenId,
              sessionId: '22222222-2222-4222-8222-222222222222',
              parentScreenId: null,
              trigger: 'initial-prompt',
              prompt: 'ECサイトのトップ画面',
              inferredIntent: 'Flower shop top page',
              action: null,
              page: 'Flower Shop',
              sessionTitle: 'ECサイトのトップ画面',
              sections: 1,
              createdAt: '2026-05-07T00:00:00.000Z',
              updatedAt: '2026-05-07T00:00:00.000Z',
            },
          ],
        }),
      });
    });
    await page.route(`**/api/screens/${screenId}**`, async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      const url = new URL(route.request().url());
      if (!url.pathname.match(new RegExp(`/api/screens/${screenId}/?$`))) {
        return route.fallback();
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          screen: {
            id: screenId,
            sessionId: '22222222-2222-4222-8222-222222222222',
            parentScreenId: null,
            trigger: 'initial-prompt',
            prompt: 'ECサイトのトップ画面',
            inferredIntent: 'Flower shop top page',
            action: null,
            schema: {
              page: 'Flower Shop',
              intent: 'Flower shop top page',
              layout: 'screen',
              sections: [
                {
                  component: 'InsightPanel',
                  source: 'summary',
                  props: {
                    title: 'Fresh flowers',
                    body: 'Seasonal bouquets are ready.',
                  },
                  actions: [
                    {
                      id: 'flower-detail',
                      label: 'Flower details',
                      kind: 'generate-screen',
                      intentHint: 'ECサイト 花の商品詳細画面',
                    },
                  ],
                },
              ],
            },
            contextSnapshot: {},
            providerMeta: {
              provider: 'mock',
              componentRegistryVersion: 'component-registry-v1',
            },
            createdAt: '2026-05-07T00:00:00.000Z',
            updatedAt: '2026-05-07T00:00:00.000Z',
          },
          activities: [],
        }),
      });
    });

    await page.goto('/history');
    await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
    await page.getByRole('link', { name: /Flower Shop/ }).click();
    await expect(page).toHaveURL(new RegExp(`/prompt/${screenId}`));
    await expect(page.getByRole('heading', { name: 'Flower Shop' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Flower details' })).toBeVisible();
  });
});
