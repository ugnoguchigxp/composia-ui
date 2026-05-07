import { OpenAPIHono } from '@hono/zod-openapi';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../api/lib/types';
import { errorHandler } from '../api/middleware/error-handler';

const entitiesServiceMocks = vi.hoisted(() => ({
  create: vi.fn(),
  delete: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  listMetadata: vi.fn(),
  metadata: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../api/middleware/auth', () => ({
  authMiddleware: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../api/modules/entities/entities.service', () => ({
  entitiesService: entitiesServiceMocks,
}));

import { entitiesRouter, metadataRouter } from '../api/modules/entities/entities.routes';

const metadata = {
  name: 'cache-entries',
  label: 'Cache Entries',
  source: 'postgres',
  mode: 'readonly',
  fields: [
    {
      name: 'key',
      label: 'Key',
      type: 'text',
      searchable: true,
      sortable: false,
      required: false,
    },
  ],
  views: {
    list: ['key'],
    detail: ['key'],
  },
};

describe('entities routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createApp() {
    const app = new OpenAPIHono<AppEnv>();
    app.onError(errorHandler);
    app.route('/api/entities', entitiesRouter);
    app.route('/api/metadata', metadataRouter);
    return app;
  }

  it('lists metadata', async () => {
    entitiesServiceMocks.listMetadata.mockResolvedValue({ entities: [metadata] });

    const res = await createApp().request('/api/metadata/entities');

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ entities: [metadata] });
  });

  it('refreshes metadata from the current manual registry', async () => {
    entitiesServiceMocks.metadata.mockResolvedValue({ metadata });

    const res = await createApp().request('/api/metadata/entities/cache-entries/refresh', {
      method: 'POST',
    });

    expect(res.status).toBe(200);
    expect(entitiesServiceMocks.metadata).toHaveBeenCalledWith('cache-entries');
  });

  it('gets entity detail rows', async () => {
    entitiesServiceMocks.get.mockResolvedValue({
      metadata,
      row: { id: '22222222-2222-4222-8222-222222222222', key: 'prompt-a' },
    });

    const res = await createApp().request(
      '/api/entities/cache-entries/22222222-2222-4222-8222-222222222222'
    );

    expect(res.status).toBe(200);
    expect(entitiesServiceMocks.get).toHaveBeenCalledWith(
      'cache-entries',
      '22222222-2222-4222-8222-222222222222'
    );
  });
});
