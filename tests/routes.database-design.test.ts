import { OpenAPIHono } from '@hono/zod-openapi';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../api/lib/types';
import { errorHandler } from '../api/middleware/error-handler';

const userId = '11111111-1111-4111-8111-111111111111';
const designSessionId = '22222222-2222-4222-8222-222222222222';
const databaseSchemaJsonId = '33333333-3333-4333-8333-333333333333';
const screenJsonId = '44444444-4444-4444-8444-444444444444';

const databaseDesignServiceMocks = vi.hoisted(() => ({
  applyMigration: vi.fn(),
  conversation: vi.fn(),
  edit: vi.fn(),
  migrationPreview: vi.fn(),
  propose: vi.fn(),
  resetSandbox: vi.fn(),
  restoreCheckpoint: vi.fn(),
  schemaJson: vi.fn(),
}));

vi.mock('../api/middleware/auth', () => ({
  authMiddleware:
    () => async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
      c.set('user', { email: 'user@example.com', type: 'access', userId });
      await next();
    },
}));

vi.mock('../api/modules/database-design/database-design.service', () => ({
  databaseDesignService: databaseDesignServiceMocks,
}));

import {
  databaseDesignMcpRouter,
  databaseDesignRouter,
} from '../api/modules/database-design/database-design.routes';

function databaseSchemaJson() {
  return {
    id: databaseSchemaJsonId,
    designSessionId,
    version: 1,
    prompt: '商品を管理したい',
    trigger: 'dbdesign-proposal',
    schema: {
      name: 'products_schema',
      label: 'Products',
      purpose: '商品を管理する',
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

function conversationResponse() {
  return {
    session: {
      id: designSessionId,
      title: '商品を管理したい',
      createdBy: userId,
      activeDatabaseSchemaJsonId: databaseSchemaJsonId,
      activeScreenJsonId: screenJsonId,
      createdAt: '2026-05-07T00:00:00.000Z',
      updatedAt: '2026-05-07T00:00:00.000Z',
    },
    activeDatabaseSchemaJsonId: databaseSchemaJsonId,
    activeScreenJsonId: screenJsonId,
    databaseSchemaJsons: [databaseSchemaJson()],
    messages: [
      {
        id: '55555555-5555-4555-8555-555555555555',
        designSessionId,
        databaseSchemaJsonId,
        screenJsonId,
        role: 'assistant',
        content: 'Products のテーブル定義案 v1 を保存しました。',
        metadata: {
          checkpointDatabaseSchemaJsonId: databaseSchemaJsonId,
          checkpointLabel: 'このバージョンへ戻る',
          databaseSchemaVersion: 1,
          trigger: 'dbdesign-proposal',
        },
        createdAt: '2026-05-07T00:00:00.000Z',
        updatedAt: '2026-05-07T00:00:00.000Z',
      },
    ],
    dataBindings: [],
  };
}

function databaseDesignResponse() {
  return {
    session: conversationResponse().session,
    databaseSchemaJson: databaseSchemaJson(),
    screenJsonId,
    dataBindings: [],
    activities: [],
    migrationPreview: {
      databaseSchemaJsonId,
      sql: 'CREATE TABLE "products" ();',
      warnings: [],
      destructive: false,
      requiresConfirmation: false,
    },
    conversation: conversationResponse(),
  };
}

describe('database design routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createApp() {
    const app = new OpenAPIHono<AppEnv>();
    app.onError(errorHandler);
    app.route('/api/database-design', databaseDesignRouter);
    app.route('/api/mcp', databaseDesignMcpRouter);
    return app;
  }

  it('proposes a DBDesign draft from a unified prompt endpoint', async () => {
    databaseDesignServiceMocks.propose.mockResolvedValue(databaseDesignResponse());

    const res = await createApp().request('/api/database-design/propose', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt: '商品を管理したい',
        source: 'screen',
        screenJsonId,
      }),
    });

    expect(res.status).toBe(200);
    expect(databaseDesignServiceMocks.propose).toHaveBeenCalledWith(userId, {
      prompt: '商品を管理したい',
      source: 'screen',
      screenJsonId,
    });
  });

  it('restores a database checkpoint without proposing a new schema', async () => {
    databaseDesignServiceMocks.restoreCheckpoint.mockResolvedValue(conversationResponse());

    const res = await createApp().request(
      `/api/database-design/${designSessionId}/checkpoints/restore`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ databaseSchemaJsonId }),
      }
    );

    expect(res.status).toBe(200);
    expect(databaseDesignServiceMocks.restoreCheckpoint).toHaveBeenCalledWith(
      userId,
      designSessionId,
      databaseSchemaJsonId,
      undefined
    );
    expect(databaseDesignServiceMocks.propose).not.toHaveBeenCalled();
  });

  it('exposes the get_database_schema_json MCP tool endpoint', async () => {
    databaseDesignServiceMocks.schemaJson.mockResolvedValue({
      databaseSchemaJson: databaseSchemaJson(),
      schemaJson: JSON.stringify(databaseSchemaJson().schema),
    });

    const res = await createApp().request('/api/mcp/tools/get_database_schema_json', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ databaseSchemaJsonId }),
    });

    expect(res.status).toBe(200);
    expect(databaseDesignServiceMocks.schemaJson).toHaveBeenCalledWith(
      userId,
      databaseSchemaJsonId
    );
  });

  it('keeps the /schemas/:id read alias for DatabaseSchemaJSON', async () => {
    databaseDesignServiceMocks.schemaJson.mockResolvedValue({
      databaseSchemaJson: databaseSchemaJson(),
      schemaJson: JSON.stringify(databaseSchemaJson().schema),
    });

    const res = await createApp().request(`/api/database-design/schemas/${databaseSchemaJsonId}`);

    expect(res.status).toBe(200);
    expect(databaseDesignServiceMocks.schemaJson).toHaveBeenCalledWith(
      userId,
      databaseSchemaJsonId
    );
  });

  it('resets the sandbox through the guarded database-design endpoint', async () => {
    databaseDesignServiceMocks.resetSandbox.mockResolvedValue({
      success: true,
      droppedObjects: 3,
    });

    const res = await createApp().request('/api/database-design/reset', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirmation: 'RESET SANDBOX' }),
    });

    expect(res.status).toBe(200);
    expect(databaseDesignServiceMocks.resetSandbox).toHaveBeenCalledWith({
      confirmation: 'RESET SANDBOX',
    });
  });
});
