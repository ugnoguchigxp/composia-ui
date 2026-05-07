import { OpenAPIHono } from '@hono/zod-openapi';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../api/lib/types';
import { errorHandler } from '../api/middleware/error-handler';

const aiServiceMocks = vi.hoisted(() => ({
  classify: vi.fn(),
  generateLayout: vi.fn(),
  generateNavigation: vi.fn(),
  summarize: vi.fn(),
}));

vi.mock('../api/middleware/auth', () => ({
  authMiddleware: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../api/modules/ai/ai.service', () => ({
  aiService: aiServiceMocks,
}));

import { aiRouter } from '../api/modules/ai/ai.routes';

describe('ai routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createApp() {
    const app = new OpenAPIHono<AppEnv>();
    app.onError(errorHandler);
    app.route('/api/ai', aiRouter);
    return app;
  }

  it('generates layout schemas', async () => {
    aiServiceMocks.generateLayout.mockResolvedValue({
      schema: {
        page: 'Operations',
        intent: 'Show status',
        layout: 'dashboard',
        sections: [
          {
            component: 'InsightPanel',
            source: 'summary',
            props: { title: 'Status', body: 'Stable' },
          },
        ],
      },
      activities: [],
    });

    const res = await createApp().request('/api/ai/layout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'Make a dashboard' }),
    });

    expect(res.status).toBe(200);
    expect(aiServiceMocks.generateLayout).toHaveBeenCalledWith({ prompt: 'Make a dashboard' });
  });

  it('generates summaries, classifications, and navigation', async () => {
    aiServiceMocks.summarize.mockResolvedValue({ summary: 'Short', activities: [] });
    aiServiceMocks.classify.mockResolvedValue({
      label: 'incident',
      confidence: 0.8,
      activities: [],
    });
    aiServiceMocks.generateNavigation.mockResolvedValue({
      links: [{ label: 'History', href: '/history' }],
      activities: [],
    });
    const app = createApp();

    expect(
      await app.request('/api/ai/summarize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'Long text' }),
      })
    ).toHaveProperty('status', 200);
    expect(
      await app.request('/api/ai/classify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'Outage', labels: ['incident'] }),
      })
    ).toHaveProperty('status', 200);
    expect(
      await app.request('/api/ai/navigation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: 'Links' }),
      })
    ).toHaveProperty('status', 200);
  });
});
