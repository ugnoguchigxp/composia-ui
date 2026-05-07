import { OpenAPIHono } from '@hono/zod-openapi';
import { describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../api/lib/types';
import { errorHandler } from '../api/middleware/error-handler';

vi.mock('../api/middleware/auth', () => ({
  authMiddleware: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

import { uiSchemaRouter } from '../api/modules/ui-schema/ui-schema.routes';

function createApp() {
  const app = new OpenAPIHono<AppEnv>();
  app.onError(errorHandler);
  app.route('/api/ui-schema', uiSchemaRouter);
  return app;
}

describe('ui schema routes', () => {
  it('validates catalog compatible schemas', async () => {
    const res = await createApp().request('/api/ui-schema/validate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
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
      }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ valid: true, issues: [] });
  });

  it('reports catalog validation issues', async () => {
    const res = await createApp().request('/api/ui-schema/validate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        schema: {
          page: 'Operations',
          intent: 'Show status',
          layout: 'dashboard',
          sections: [
            {
              component: 'DataTableSection',
              source: 'rss',
              props: { title: 'Rows', columns: [{ key: 'title', label: 'Title' }], rows: [] },
            },
          ],
        },
      }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      valid: false,
      issues: [expect.objectContaining({ path: 'sections.0.source' })],
    });
  });
});
