import { OpenAPIHono } from '@hono/zod-openapi';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../api/lib/types';
import { errorHandler } from '../api/middleware/error-handler';

const mediaServiceMocks = vi.hoisted(() => ({
  delete: vi.fn(),
  list: vi.fn(),
  update: vi.fn(),
  upload: vi.fn(),
}));

vi.mock('../api/middleware/auth', () => ({
  authMiddleware: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../api/modules/media/media.service', () => ({
  mediaService: mediaServiceMocks,
}));

import { mediaRouter } from '../api/modules/media/media.routes';

const asset = {
  altText: null,
  createdAt: '2026-05-09T00:00:00.000Z',
  filename: 'hero.png',
  folder: 'uncategorized',
  height: null,
  id: 'hero.png',
  mimeType: 'image/png',
  originalName: 'hero.png',
  size: 5,
  tags: null,
  updatedAt: '2026-05-09T00:00:00.000Z',
  url: '/images/hero.png',
  width: null,
};

describe('media routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createApp() {
    const app = new OpenAPIHono<AppEnv>();
    app.onError(errorHandler);
    app.route('/api/media', mediaRouter);
    return app;
  }

  it('lists media assets', async () => {
    mediaServiceMocks.list.mockResolvedValue({
      files: [asset],
      pagination: { limit: 12, page: 1, total: 1, totalPages: 1 },
    });

    const res = await createApp().request(
      '/api/media/assets?page=1&limit=12&folder=all&sortBy=date&sortOrder=desc'
    );

    expect(res.status).toBe(200);
    expect(mediaServiceMocks.list).toHaveBeenCalledWith({
      folder: 'all',
      limit: 12,
      page: 1,
      sortBy: 'date',
      sortOrder: 'desc',
    });
    await expect(res.json()).resolves.toEqual({
      files: [asset],
      pagination: { limit: 12, page: 1, total: 1, totalPages: 1 },
    });
  });

  it('uploads multipart media files', async () => {
    mediaServiceMocks.upload.mockResolvedValue({ asset, success: true });
    const formData = new FormData();
    formData.set('file', new File(['image'], 'hero.png', { type: 'image/png' }));

    const res = await createApp().request('/api/media/upload', {
      body: formData,
      method: 'POST',
    });

    expect(res.status).toBe(201);
    expect(mediaServiceMocks.upload).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'hero.png',
        size: 5,
        type: 'image/png',
      })
    );
    await expect(res.json()).resolves.toEqual({ asset, success: true });
  });

  it('updates media metadata', async () => {
    mediaServiceMocks.update.mockResolvedValue({ ...asset, altText: 'Hero image' });

    const res = await createApp().request('/api/media/assets/hero.png', {
      body: JSON.stringify({ altText: 'Hero image', folder: 'banners', tags: 'hero' }),
      headers: { 'content-type': 'application/json' },
      method: 'PUT',
    });

    expect(res.status).toBe(200);
    expect(mediaServiceMocks.update).toHaveBeenCalledWith('hero.png', {
      altText: 'Hero image',
      folder: 'banners',
      tags: 'hero',
    });
  });

  it('deletes media assets', async () => {
    mediaServiceMocks.delete.mockResolvedValue({ success: true });

    const res = await createApp().request('/api/media/assets/hero.png', {
      method: 'DELETE',
    });

    expect(res.status).toBe(200);
    expect(mediaServiceMocks.delete).toHaveBeenCalledWith('hero.png');
    await expect(res.json()).resolves.toEqual({ success: true });
  });
});
