import { OpenAPIHono } from '@hono/zod-openapi';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../api/lib/types';
import { errorHandler } from '../api/middleware/error-handler';

const sourcesServiceMocks = vi.hoisted(() => ({
  createApiSource: vi.fn(),
  createMarkdownSource: vi.fn(),
  createPostgresSource: vi.fn(),
  createRssSource: vi.fn(),
  deleteSource: vi.fn(),
  getSource: vi.fn(),
  listItems: vi.fn(),
  listSources: vi.fn(),
  refreshSource: vi.fn(),
}));

vi.mock('../api/middleware/auth', () => ({
  authMiddleware: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../api/modules/sources/sources.service', () => ({
  sourcesService: sourcesServiceMocks,
}));

import { sourcesRouter } from '../api/modules/sources/sources.routes';

const source = {
  id: '11111111-1111-4111-8111-111111111111',
  kind: 'rss',
  label: 'Release feed',
  url: 'https://example.com/feed.xml',
  entityType: 'article',
  enabled: true,
};

describe('sources routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createApp() {
    const app = new OpenAPIHono<AppEnv>();
    app.onError(errorHandler);
    app.route('/api/sources', sourcesRouter);
    return app;
  }

  it('creates RSS sources', async () => {
    sourcesServiceMocks.createRssSource.mockResolvedValue({ source });

    const res = await createApp().request('/api/sources/rss', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        label: 'Release feed',
        url: 'https://example.com/feed.xml',
        entityType: 'article',
      }),
    });

    expect(res.status).toBe(201);
    expect(sourcesServiceMocks.createRssSource).toHaveBeenCalledWith({
      label: 'Release feed',
      url: 'https://example.com/feed.xml',
      entityType: 'article',
    });
  });

  it('creates PostgreSQL sources', async () => {
    sourcesServiceMocks.createPostgresSource.mockResolvedValue({
      source: { ...source, kind: 'postgres', url: undefined },
    });

    const res = await createApp().request('/api/sources/postgres', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        label: 'Entities',
        entity: 'normalized-entities',
        entityType: 'entity-row',
      }),
    });

    expect(res.status).toBe(201);
    expect(sourcesServiceMocks.createPostgresSource).toHaveBeenCalledWith({
      label: 'Entities',
      entity: 'normalized-entities',
      entityType: 'entity-row',
    });
  });

  it('creates API and Markdown sources', async () => {
    sourcesServiceMocks.createApiSource.mockResolvedValue({
      source: { ...source, kind: 'api', label: 'JSON API' },
    });
    sourcesServiceMocks.createMarkdownSource.mockResolvedValue({
      source: { ...source, kind: 'markdown', label: 'Docs' },
    });
    const app = createApp();

    const apiRes = await app.request('/api/sources/api', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        label: 'JSON API',
        url: 'https://example.com/data.json',
        entityType: 'record',
      }),
    });
    const markdownRes = await app.request('/api/sources/markdown', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        label: 'Docs',
        url: 'https://example.com/page.md',
        entityType: 'document',
      }),
    });

    expect(apiRes.status).toBe(201);
    expect(markdownRes.status).toBe(201);
  });

  it('lists sources with operational refresh metadata', async () => {
    sourcesServiceMocks.listSources.mockResolvedValue({
      sources: [
        {
          ...source,
          itemCount: 12,
          lastStatus: 'success',
          lastRefreshedAt: '2026-05-09T00:00:00.000Z',
          createdAt: '2026-05-09T00:00:00.000Z',
          updatedAt: '2026-05-09T00:01:00.000Z',
        },
      ],
    });

    const res = await createApp().request('/api/sources', {
      method: 'GET',
    });

    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload).toEqual({
      sources: [
        expect.objectContaining({
          id: source.id,
          itemCount: 12,
          lastStatus: 'success',
          lastRefreshedAt: '2026-05-09T00:00:00.000Z',
        }),
      ],
    });
  });

  it('refreshes source and returns refreshed metadata and items', async () => {
    sourcesServiceMocks.refreshSource.mockResolvedValue({
      source: {
        ...source,
        itemCount: 1,
        lastStatus: 'success',
        lastRefreshedAt: '2026-05-09T00:00:00.000Z',
        createdAt: '2026-05-09T00:00:00.000Z',
        updatedAt: '2026-05-09T00:01:00.000Z',
      },
      items: [
        {
          id: 'item-1',
          source: 'rss',
          entityType: 'article',
          title: 'Release note',
          summary: 'Summary',
          raw: { guid: 'g-1' },
        },
      ],
      refreshedAt: '2026-05-09T00:02:00.000Z',
    });

    const res = await createApp().request(`/api/sources/${source.id}/refresh`, {
      method: 'POST',
    });

    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload).toEqual({
      source: expect.objectContaining({
        id: source.id,
        itemCount: 1,
        lastStatus: 'success',
      }),
      items: [
        expect.objectContaining({
          id: 'item-1',
          source: 'rss',
          entityType: 'article',
        }),
      ],
      refreshedAt: '2026-05-09T00:02:00.000Z',
    });
  });
});
