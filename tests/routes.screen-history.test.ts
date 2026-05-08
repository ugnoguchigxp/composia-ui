import { OpenAPIHono } from '@hono/zod-openapi';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../api/lib/types';
import { errorHandler } from '../api/middleware/error-handler';

const userId = '11111111-1111-4111-8111-111111111111';
const screenId = '22222222-2222-4222-8222-222222222222';
const sessionId = '33333333-3333-4333-8333-333333333333';

const screenHistoryServiceMocks = vi.hoisted(() => ({
  children: vi.fn(),
  conversation: vi.fn(),
  delete: vi.fn(),
  edit: vi.fn(),
  generate: vi.fn(),
  generateFromAction: vi.fn(),
  generateFromSessionAction: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  regenerate: vi.fn(),
  regenerateSession: vi.fn(),
  restoreCheckpoint: vi.fn(),
  screenJson: vi.fn(),
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

import {
  mcpToolsRouter,
  screenHistoryRouter,
  screenJsonRouter,
  screenSessionRouter,
} from '../api/modules/screen-history/screen-history.routes';

function screenResponse() {
  return {
    screen: {
      id: screenId,
      sessionId,
      parentScreenId: null,
      version: 1,
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
      databaseSchemaJsonId: null,
      dataBindings: [],
      contextSnapshot: {},
      providerMeta: { provider: 'mock', componentRegistryVersion: 'component-registry-v1' },
      createdAt: '2026-05-07T00:00:00.000Z',
      updatedAt: '2026-05-07T00:00:00.000Z',
    },
    activities: [],
  };
}

function conversationResponse() {
  const { parentScreenId: _parentScreenId, ...screenJson } = screenResponse().screen;
  return {
    session: {
      id: sessionId,
      title: 'ECサイトのトップ画面',
      createdBy: userId,
      activeScreenJsonId: screenId,
      createdAt: '2026-05-07T00:00:00.000Z',
      updatedAt: '2026-05-07T00:00:00.000Z',
    },
    activeScreenJsonId: screenId,
    activeVersion: 1,
    activeScreenJson: screenJson,
    checkpoints: [
      {
        id: screenJson.id,
        sessionId: screenJson.sessionId,
        version: screenJson.version,
        trigger: screenJson.trigger,
        prompt: screenJson.prompt,
        inferredIntent: screenJson.inferredIntent,
        action: screenJson.action,
        page: screenJson.schema.page,
        databaseSchemaJsonId: screenJson.databaseSchemaJsonId ?? null,
        dataBindings: screenJson.dataBindings ?? [],
        createdAt: screenJson.createdAt,
        updatedAt: screenJson.updatedAt,
      },
    ],
    screenJsons: [],
    messages: [
      {
        id: '44444444-4444-4444-8444-444444444444',
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
    ],
  };
}

function screenJsonResponse() {
  const { parentScreenId: _parentScreenId, ...screenJson } = screenResponse().screen;
  return {
    screenJson,
    schemaJson: JSON.stringify(screenResponse().screen.schema),
  };
}

describe('screen history routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createApp() {
    const app = new OpenAPIHono<AppEnv>();
    app.onError(errorHandler);
    app.route('/api/mcp', mcpToolsRouter);
    app.route('/api/screens', screenHistoryRouter);
    app.route('/api/screen-jsons', screenJsonRouter);
    app.route('/api/sessions', screenSessionRouter);
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

  it('returns a persisted session conversation', async () => {
    screenHistoryServiceMocks.conversation.mockResolvedValue(conversationResponse());

    const res = await createApp().request(`/api/sessions/${sessionId}/conversation`);

    expect(res.status).toBe(200);
    expect(screenHistoryServiceMocks.conversation).toHaveBeenCalledWith(userId, sessionId);
  });

  it('edits the active session screen', async () => {
    screenHistoryServiceMocks.edit.mockResolvedValue(screenResponse());

    const res = await createApp().request(`/api/sessions/${sessionId}/edit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'H1を小さくする' }),
    });

    expect(res.status).toBe(200);
    expect(screenHistoryServiceMocks.edit).toHaveBeenCalledWith(userId, sessionId, {
      prompt: 'H1を小さくする',
    });
  });

  it('restores a checkpoint without using the screen generation route', async () => {
    screenHistoryServiceMocks.restoreCheckpoint.mockResolvedValue({
      screen: screenResponse().screen,
      conversation: conversationResponse(),
    });

    const res = await createApp().request(
      `/api/sessions/${sessionId}/checkpoints/${screenId}/restore`,
      { method: 'POST' }
    );

    expect(res.status).toBe(200);
    expect(screenHistoryServiceMocks.restoreCheckpoint).toHaveBeenCalledWith(
      userId,
      sessionId,
      screenId
    );
    expect(screenHistoryServiceMocks.generate).not.toHaveBeenCalled();
  });

  it('returns minified ScreenJSON through the ScreenJSON route', async () => {
    screenHistoryServiceMocks.screenJson.mockResolvedValue(screenJsonResponse());

    const res = await createApp().request(`/api/screen-jsons/${screenId}`);
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.schemaJson).toBe(JSON.stringify(screenResponse().screen.schema));
    expect(screenHistoryServiceMocks.screenJson).toHaveBeenCalledWith(userId, screenId);
  });

  it('exposes the get_screen_json MCP tool endpoint', async () => {
    screenHistoryServiceMocks.screenJson.mockResolvedValue(screenJsonResponse());

    const res = await createApp().request('/api/mcp/tools/get_screen_json', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ screenJsonId: screenId }),
    });

    expect(res.status).toBe(200);
    expect(screenHistoryServiceMocks.screenJson).toHaveBeenCalledWith(userId, screenId);
  });
});
