import { OpenAPIHono } from '@hono/zod-openapi';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../api/lib/errors';
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
      activities: [
        {
          id: 'provider-response',
          label: 'AI provider response',
          status: 'completed',
          detail: '128ms',
        },
        {
          id: 'schema-validation',
          label: 'App UI Schema validation',
          status: 'completed',
          detail: '1 sections / 12ms',
        },
        {
          id: 'catalog-validation',
          label: 'Component catalog validation',
          status: 'completed',
          detail: '9ms',
        },
        {
          id: 'render-preparation',
          label: 'Render preparation',
          status: 'completed',
          detail: '3ms',
        },
      ],
    });

    const res = await createApp().request('/api/ai/layout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'Make a dashboard' }),
    });

    expect(res.status).toBe(200);
    expect(aiServiceMocks.generateLayout).toHaveBeenCalledWith(
      { prompt: 'Make a dashboard' },
      expect.objectContaining({
        requestId: undefined,
        userId: undefined,
      })
    );
    expect(res.headers.get('server-timing')).toContain('provider;dur=128');
    expect(res.headers.get('server-timing')).toContain('schema_validation;dur=12');
    expect(res.headers.get('server-timing')).toContain('catalog_validation;dur=9');
    expect(res.headers.get('server-timing')).toContain('render_preparation;dur=3');
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

  it('returns 503 with provider not configured details', async () => {
    aiServiceMocks.generateLayout.mockRejectedValue(
      new AppError(503, 'AI_PROVIDER_NOT_CONFIGURED', 'Layout provider is not configured', {
        task: 'Layout',
      })
    );

    const res = await createApp().request('/api/ai/layout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'Make a dashboard' }),
    });

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({
      error: {
        code: 'AI_PROVIDER_NOT_CONFIGURED',
        message: 'Layout provider is not configured',
        details: { task: 'Layout' },
      },
    });
  });
});
