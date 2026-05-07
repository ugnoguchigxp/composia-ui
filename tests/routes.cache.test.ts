import { OpenAPIHono } from '@hono/zod-openapi';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../api/lib/types';
import { errorHandler } from '../api/middleware/error-handler';

const cacheServiceMocks = vi.hoisted(() => ({
  delete: vi.fn(),
  get: vi.fn(),
  invalidate: vi.fn(),
  rebuild: vi.fn(),
  set: vi.fn(),
  status: vi.fn(),
}));

vi.mock('../api/middleware/auth', () => ({
  authMiddleware: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../api/modules/cache/cache.service', () => ({
  cacheService: cacheServiceMocks,
}));

import { cacheRouter } from '../api/modules/cache/cache.routes';

describe('cache routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createApp() {
    const app = new OpenAPIHono<AppEnv>();
    app.onError(errorHandler);
    app.route('/api/cache', cacheRouter);
    return app;
  }

  it('returns cache status', async () => {
    cacheServiceMocks.status.mockResolvedValue({
      totalEntries: 1,
      namespaces: [{ namespace: 'ai-layout', entries: 1 }],
    });

    const res = await createApp().request('/api/cache/status');

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      totalEntries: 1,
      namespaces: [{ namespace: 'ai-layout', entries: 1 }],
    });
  });

  it('invalidates a namespace', async () => {
    cacheServiceMocks.invalidate.mockResolvedValue({ success: true });

    const res = await createApp().request('/api/cache/invalidate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ namespace: 'ai-layout' }),
    });

    expect(res.status).toBe(200);
    expect(cacheServiceMocks.invalidate).toHaveBeenCalledWith({ namespace: 'ai-layout' });
  });
});
