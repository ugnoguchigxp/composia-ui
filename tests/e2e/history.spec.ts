import { expect, test } from '@playwright/test';
import { mockAuthMe } from './helpers';

const screenId = '11111111-1111-4111-8111-111111111111';
const futureScreenId = '11111111-1111-4111-8111-222222222222';
const sessionId = '22222222-2222-4222-8222-222222222222';
const designSessionId = '33333333-3333-4333-8333-333333333333';
const databaseSchemaJsonId = '44444444-4444-4444-8444-444444444444';

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
    databaseSchemaJsonId: null,
    dataBindings: [],
    contextSnapshot: {},
    providerMeta: {
      provider: 'mock',
      componentRegistryVersion: 'component-registry-v1',
    },
    createdAt: '2026-05-07T00:00:00.000Z',
    updatedAt: '2026-05-07T00:00:00.000Z',
  };
}

function databaseSchemaJsonPayload() {
  return {
    id: databaseSchemaJsonId,
    designSessionId,
    version: 1,
    prompt: 'このUIに必要なテーブル定義案を作成してください。',
    trigger: 'dbdesign-proposal',
    dataBindings: [],
    schema: {
      name: 'flower_shop_schema',
      label: 'Flower Shop',
      purpose: 'Flower Shop UI data model',
      tables: [
        {
          name: 'products',
          label: 'Products',
          columns: [
            {
              name: 'id',
              label: 'ID',
              type: 'uuid',
              nullable: false,
              primaryKey: true,
              unique: true,
              default: { kind: 'uuid' },
              validation: { required: true },
              ui: { listVisible: false, formVisible: false, filterable: false, sortable: false },
            },
            {
              name: 'name',
              label: 'Name',
              type: 'text',
              nullable: false,
              primaryKey: false,
              unique: false,
              validation: { required: true },
              ui: { listVisible: true, formVisible: true, filterable: true, sortable: true },
            },
          ],
          indexes: [],
          ui: { displayField: 'name', defaultSortField: 'name', defaultSortDirection: 'asc' },
        },
      ],
      relations: [],
      uiHints: {
        primaryTables: ['products'],
        defaultNavigation: ['products'],
        suggestedScreens: [{ name: 'Products', table: 'products', operation: 'list' }],
      },
    },
    diffSummary: {
      addedTables: ['products'],
      changedTables: [],
      removedTables: [],
      destructive: false,
    },
    providerMeta: { provider: 'mock', componentRegistryVersion: 'component-registry-v2:test' },
    createdAt: '2026-05-07T00:00:00.000Z',
    updatedAt: '2026-05-07T00:00:00.000Z',
  };
}

function databaseDraftGapResponse() {
  return {
    databaseSchemaJsonId,
    gap: {
      currentMatch: false,
      blockingCount: 1,
      infoCount: 0,
      items: [
        {
          kind: 'missing_table',
          severity: 'blocking',
          table: 'products',
          column: null,
          expected: 'products',
          actual: null,
          message: 'products is missing from SandboxDB',
        },
      ],
    },
  };
}

function databaseDesignConversationResponse() {
  return {
    session: {
      id: designSessionId,
      title: 'Flower Shop',
      createdBy: '44444444-4444-4444-8444-444444444444',
      activeDatabaseSchemaJsonId: databaseSchemaJsonId,
      activeScreenJsonId: screenId,
      createdAt: '2026-05-07T00:00:00.000Z',
      updatedAt: '2026-05-07T00:00:00.000Z',
    },
    activeDatabaseSchemaJsonId: databaseSchemaJsonId,
    activeScreenJsonId: screenId,
    databaseSchemaJsons: [databaseSchemaJsonPayload()],
    messages: [],
    dataBindings: [],
  };
}

function databaseDesignResponse() {
  return {
    session: databaseDesignConversationResponse().session,
    databaseSchemaJson: databaseSchemaJsonPayload(),
    screenJsonId: screenId,
    dataBindings: [],
    activities: [],
    migrationPreview: {
      databaseSchemaJsonId,
      sql: 'CREATE TABLE "products" ();',
      warnings: [],
      destructive: false,
      requiresConfirmation: false,
    },
    conversation: databaseDesignConversationResponse(),
  };
}

test.describe('Generated screen history @regression', () => {
  test('replays a saved generated screen @smoke @visual', async ({ page }) => {
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
          activeScreenJson: screenJson,
          checkpoints: [screenJson, futureScreenJson].map(
            ({ schema, contextSnapshot, providerMeta, ...checkpoint }) => ({
              ...checkpoint,
              page: schema.page,
            })
          ),
          screenJsons: [],
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
    await page.route('**/api/database-design/propose', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(databaseDesignResponse()),
      });
    });
    await page.route('**/api/database-design/drafts', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          drafts: [
            {
              id: databaseSchemaJsonId,
              designSessionId,
              title: 'Flower Shop',
              prompt: 'このUIに必要なテーブル定義案を作成してください。',
              source: 'screen',
              createdAt: '2026-05-07T00:00:00.000Z',
              tableCount: 1,
              sourceScreenJsonId: screenId,
              boundScreenJsonId: screenId,
              boundPromptSessionId: sessionId,
              historicallyAppliedAt: null,
              currentMatch: false,
              gap: databaseDraftGapResponse().gap,
            },
          ],
        }),
      });
    });
    await page.route(`**/api/database-design/${designSessionId}/conversation`, async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(databaseDesignConversationResponse()),
      });
    });
    await page.route(
      `**/api/database-design/schema-jsons/${databaseSchemaJsonId}`,
      async (route) => {
        if (route.request().method() !== 'GET') return route.fallback();
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ databaseSchemaJson: databaseSchemaJsonPayload() }),
        });
      }
    );
    await page.route(
      `**/api/database-design/schema-jsons/${databaseSchemaJsonId}/gap`,
      async (route) => {
        if (route.request().method() !== 'GET') return route.fallback();
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(databaseDraftGapResponse()),
        });
      }
    );
    await page.route(
      `**/api/database-design/schema-jsons/${databaseSchemaJsonId}/migration/preview`,
      async (route) => {
        if (route.request().method() !== 'POST') return route.fallback();
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            databaseSchemaJsonId,
            sql: 'CREATE TABLE "products" ();',
            warnings: [],
            destructive: false,
            requiresConfirmation: false,
          }),
        });
      }
    );
    await page.route('**/api/sandbox-db/state', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          appliedDatabaseSchemaJsonId: null,
          appliedVersion: null,
          tables: [],
        }),
      });
    });
    await page.route('**/api/sources', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sources: [
            {
              id: '55555555-5555-4555-8555-555555555555',
              kind: 'rss',
              label: 'Release feed',
              url: 'https://example.com/feed.xml',
              entityType: 'article',
              enabled: true,
              itemCount: 12,
              lastStatus: 'success',
              lastRefreshedAt: '2026-05-07T00:00:00.000Z',
              createdAt: '2026-05-07T00:00:00.000Z',
              updatedAt: '2026-05-07T00:00:00.000Z',
            },
          ],
        }),
      });
    });

    await page.goto('/history');
    await expect(page.getByRole('heading', { name: 'UIDesign', exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Search UI designs...' }).fill('Future Shop');
    await expect(page.getByRole('link', { name: /Flower Shop/ })).toBeVisible();
    await page.getByRole('textbox', { name: 'Search UI designs...' }).fill('');
    await page.getByRole('link', { name: /Flower Shop/ }).click();
    await expect(page).toHaveURL(new RegExp(`/prompt/session/${sessionId}`));
    await expect(page.getByRole('region', { name: 'Flower Shop' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Flower details' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'DB生成' })).toBeVisible();
    const proposeRequest = page.waitForRequest('**/api/database-design/propose');
    await page.getByRole('button', { name: 'DB生成' }).click();
    await expect(page).toHaveURL(new RegExp(`/dbdesign/drafts/${databaseSchemaJsonId}`));
    await expect(await (await proposeRequest).postDataJSON()).toMatchObject({
      screenJsonId: screenId,
      source: 'screen',
    });

    await page.goto(`/prompt/session/${sessionId}`);
    await expect(page.getByRole('region', { name: 'Flower Shop' })).toBeVisible();
    await expect(page.getByRole('button', { name: '現在 v1' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'v2' })).toBeVisible();
    await expect(page.getByText('Future Shop を更新しました。')).toBeHidden();
    await page.getByRole('button', { name: 'Compose' }).click();
    await expect(page).toHaveScreenshot('history-compose-desktop.png', {
      animations: 'disabled',
      fullPage: true,
    });
    await page.getByRole('button', { name: 'AI Chat' }).click();
    await expect(page).toHaveScreenshot('history-replay-desktop.png', {
      animations: 'disabled',
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.getByRole('region', { name: 'Flower Shop' })).toBeVisible();
    await expect(page).toHaveScreenshot('history-replay-mobile.png', {
      animations: 'disabled',
      fullPage: true,
    });
    const regionOverflowPx = await page
      .getByRole('region', { name: 'Flower Shop' })
      .evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(regionOverflowPx).toBeLessThanOrEqual(24);
    await page.getByRole('button', { name: 'Collapse Chatdock' }).click();
    const pageOverflowPx = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(pageOverflowPx).toBeLessThanOrEqual(240);
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.reload();
    await expect(page.getByRole('region', { name: 'Flower Shop' })).toBeVisible();
    await expect(page.getByRole('button', { name: '現在 v1' })).toBeVisible();

    await page.goto(`/prompt/${screenId}`);
    await expect(page).toHaveURL(new RegExp(`/prompt/session/${sessionId}`));
    await expect(page.getByRole('region', { name: 'Flower Shop' })).toBeVisible();
  });
});
