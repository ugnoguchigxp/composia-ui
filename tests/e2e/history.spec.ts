import { expect, test } from '@playwright/test';
import { mockAuthMe } from './helpers';

const screenId = '11111111-1111-4111-8111-111111111111';
const futureScreenId = '11111111-1111-4111-8111-222222222222';
const sessionId = '22222222-2222-4222-8222-222222222222';

function screenPayload(input: { id?: string; page?: string; version?: number } = {}) {
  return {
    id: input.id ?? screenId,
    sessionId,
    parentScreenId: null,
    version: input.version ?? 1,
    trigger: input.version && input.version > 1 ? 'chat-edit' : 'initial-prompt',
    prompt: 'ECサイトのトップ画面',
    inferredIntent: `${input.page ?? 'Flower Shop'} top page`,
    action: null,
    schema: {
      page: input.page ?? 'Flower Shop',
      intent: `${input.page ?? 'Flower Shop'} top page`,
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
  };
}

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
              sessionId,
              parentScreenId: null,
              version: 1,
              trigger: 'initial-prompt',
              prompt: 'ECサイトのトップ画面',
              inferredIntent: 'Flower shop top page',
              action: null,
              page: 'Flower Shop',
              sessionTitle: 'ECサイトのトップ画面',
              activeScreenJsonId: screenId,
              sections: 1,
              createdAt: '2026-05-07T00:00:00.000Z',
              updatedAt: '2026-05-07T00:00:00.000Z',
            },
          ],
          sessions: [
            {
              id: sessionId,
              title: 'ECサイトのトップ画面',
              activeScreenJsonId: screenId,
              activeVersion: 1,
              page: 'Flower Shop',
              prompt: 'ECサイトのトップ画面',
              inferredIntent: 'Flower shop top page',
              screenCount: 1,
              messageCount: 2,
              messageSearchText: 'Future Shop を更新しました。',
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
          screen: screenPayload(),
          activities: [],
        }),
      });
    });
    await page.route('**/api/sessions/**', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      const url = new URL(route.request().url());
      if (!url.pathname.match(new RegExp(`/api/sessions/${sessionId}/conversation/?$`))) {
        return route.fallback();
      }
      const { parentScreenId: _parentScreenId, ...screenJson } = screenPayload();
      const { parentScreenId: _futureParentScreenId, ...futureScreenJson } = screenPayload({
        id: futureScreenId,
        page: 'Future Shop',
        version: 2,
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          session: {
            id: sessionId,
            title: 'ECサイトのトップ画面',
            createdBy: '44444444-4444-4444-8444-444444444444',
            activeScreenJsonId: screenId,
            createdAt: '2026-05-07T00:00:00.000Z',
            updatedAt: '2026-05-07T00:00:00.000Z',
          },
          activeScreenJsonId: screenId,
          activeVersion: 1,
          screenJsons: [screenJson, futureScreenJson],
          messages: [
            {
              id: '33333333-3333-4333-8333-333333333333',
              sessionId,
              screenJsonId: screenId,
              role: 'assistant',
              content: 'Flower Shop を保存しました。',
              metadata: {
                checkpointScreenJsonId: screenId,
                checkpointLabel: 'このバージョンへ戻る',
                generatedPage: 'Flower Shop',
                version: 1,
                trigger: 'initial-prompt',
              },
              createdAt: '2026-05-07T00:00:00.000Z',
              updatedAt: '2026-05-07T00:00:00.000Z',
            },
            {
              id: '33333333-3333-4333-8333-444444444444',
              sessionId,
              screenJsonId: futureScreenId,
              role: 'assistant',
              content: 'Future Shop を更新しました。',
              metadata: {
                checkpointScreenJsonId: futureScreenId,
                checkpointLabel: 'このバージョンへ戻る',
                generatedPage: 'Future Shop',
                version: 2,
                trigger: 'chat-edit',
              },
              createdAt: '2026-05-07T00:01:00.000Z',
              updatedAt: '2026-05-07T00:01:00.000Z',
            },
          ],
        }),
      });
    });

    await page.goto('/history');
    await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Search generated screens' }).fill('Future Shop');
    await expect(page.getByRole('link', { name: /Flower Shop/ })).toBeVisible();
    await page.getByRole('textbox', { name: 'Search generated screens' }).fill('');
    await page.getByRole('link', { name: /Flower Shop/ }).click();
    await expect(page).toHaveURL(new RegExp(`/prompt/session/${sessionId}`));
    await expect(page.getByRole('region', { name: 'Flower Shop' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Flower details' })).toBeVisible();
    await expect(page.getByRole('button', { name: '現在 v1' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'v2' })).toBeVisible();
    await expect(page.getByRole('button', { name: '現在のバージョン' })).toBeVisible();
    await expect(page.getByText('Future Shop を更新しました。')).toBeHidden();

    await page.reload();
    await expect(page.getByRole('region', { name: 'Flower Shop' })).toBeVisible();
    await expect(page.getByRole('button', { name: '現在のバージョン' })).toBeVisible();

    await page.goto(`/prompt/${screenId}`);
    await expect(page).toHaveURL(new RegExp(`/prompt/session/${sessionId}`));
    await expect(page.getByRole('region', { name: 'Flower Shop' })).toBeVisible();
  });
});
