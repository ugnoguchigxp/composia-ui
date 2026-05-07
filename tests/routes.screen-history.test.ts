import { OpenAPIHono } from '@hono/zod-openapi';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../api/lib/types';
import { errorHandler } from '../api/middleware/error-handler';

const userId = '11111111-1111-4111-8111-111111111111';
const screenId = '22222222-2222-4222-8222-222222222222';

const screenHistoryServiceMocks = vi.hoisted(() => ({
  children: vi.fn(),
  delete: vi.fn(),
  generate: vi.fn(),
  generateFromAction: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  regenerate: vi.fn(),
}));

vi.mock('../api/middleware/auth', () => ({
  authMiddleware:
    () => async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
      c.set('user', { email: 'user@example.com', type: 'access', userId });
      await next();
    },
}));

vi.mock('../api/modules/screen-history/screen-history.service', () => ({
  screenHistoryService: screenHistoryServiceMocks,
}));

import { screenHistoryRouter } from '../api/modules/screen-history/screen-history.routes';

function screenResponse() {
  return {
    screen: {
      id: screenId,
      sessionId: '33333333-3333-4333-8333-333333333333',
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
            props: { title: 'Fresh flowers', body: 'Seasonal bouquets' },
          },
        ],
      },
      contextSnapshot: {},
      providerMeta: { provider: 'mock', componentRegistryVersion: 'component-registry-v1' },
      createdAt: '2026-05-07T00:00:00.000Z',
      updatedAt: '2026-05-07T00:00:00.000Z',
    },
    activities: [],
  };
}

describe('screen history routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createApp() {
    const app = new OpenAPIHono<AppEnv>();
    app.onError(errorHandler);
    app.route('/api/screens', screenHistoryRouter);
    return app;
  }

  it('generates and saves a prompt screen', async () => {
    screenHistoryServiceMocks.generate.mockResolvedValue(screenResponse());

    const res = await createApp().request('/api/screens/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'ECサイトのトップ画面' }),
    });

    expect(res.status).toBe(200);
    expect(screenHistoryServiceMocks.generate).toHaveBeenCalledWith(userId, {
      prompt: 'ECサイトのトップ画面',
    });
  });

  it('replays a saved screen without regeneration', async () => {
    screenHistoryServiceMocks.get.mockResolvedValue(screenResponse());

    const res = await createApp().request(`/api/screens/${screenId}`);

    expect(res.status).toBe(200);
    expect(screenHistoryServiceMocks.get).toHaveBeenCalledWith(userId, screenId);
  });

  it('generates a child screen from an action', async () => {
    screenHistoryServiceMocks.generateFromAction.mockResolvedValue(screenResponse());

    const res = await createApp().request(`/api/screens/${screenId}/actions/flower/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: {
          id: 'flower',
          label: 'Flower details',
          kind: 'generate-screen',
        },
      }),
    });

    expect(res.status).toBe(200);
    expect(screenHistoryServiceMocks.generateFromAction).toHaveBeenCalledWith(
      userId,
      screenId,
      'flower',
      {
        action: {
          carry: {
            navigation: true,
            sourceContext: true,
            visualIntent: true,
          },
          id: 'flower',
          label: 'Flower details',
          kind: 'generate-screen',
        },
      }
    );
  });
});
