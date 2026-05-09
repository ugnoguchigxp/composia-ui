import { OpenAPIHono } from '@hono/zod-openapi';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../api/lib/types';

const dbMocks = vi.hoisted(() => ({
  execute: vi.fn(),
}));

const sandboxMocks = vi.hoisted(() => ({
  unsafe: vi.fn(),
}));

const mediaMocks = vi.hoisted(() => ({
  listAssets: vi.fn(),
}));

const configMocks = vi.hoisted(() => ({
  ANTHROPIC_API_KEY: undefined as string | undefined,
  AZURE_OPENAI_API_KEY: undefined as string | undefined,
  AZURE_OPENAI_DEPLOYMENT_NAME: undefined as string | undefined,
  AZURE_OPENAI_ENDPOINT: undefined as string | undefined,
  GOOGLE_AI_API_KEY: undefined as string | undefined,
  OPENAI_API_KEY: 'test-openai-key',
  SANDBOX_DATABASE_URL: undefined as string | undefined,
}));

vi.mock('../api/config', () => ({
  config: configMocks,
}));

vi.mock('../api/db/client', () => ({
  db: {
    execute: dbMocks.execute,
  },
}));

vi.mock('../api/modules/database-design/sandbox-client', () => ({
  getSandboxSql: () => ({
    unsafe: sandboxMocks.unsafe,
  }),
}));

vi.mock('../api/modules/media/media.repository', () => ({
  mediaRepository: {
    listAssets: mediaMocks.listAssets,
  },
}));

import { healthRouter } from '../api/routes/health';

const createApp = () => {
  const app = new OpenAPIHono<AppEnv>();
  app.route('/api/health', healthRouter);
  return app;
};

describe('Health Check Endpoints', () => {
  beforeEach(() => {
    dbMocks.execute.mockReset();
    sandboxMocks.unsafe.mockReset();
    mediaMocks.listAssets.mockReset();
    configMocks.SANDBOX_DATABASE_URL = undefined;
    configMocks.OPENAI_API_KEY = 'test-openai-key';
    configMocks.AZURE_OPENAI_API_KEY = undefined;
    configMocks.AZURE_OPENAI_ENDPOINT = undefined;
    configMocks.AZURE_OPENAI_DEPLOYMENT_NAME = undefined;
    configMocks.ANTHROPIC_API_KEY = undefined;
    configMocks.GOOGLE_AI_API_KEY = undefined;
  });

  it('GET /api/health/live returns 200 and does not require DB', async () => {
    const app = createApp();
    const res = await app.request('/api/health/live');

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('alive');
    expect(data.version).toBeDefined();
    expect(data.timestamp).toBeDefined();
    expect(dbMocks.execute).not.toHaveBeenCalled();
    expect(mediaMocks.listAssets).not.toHaveBeenCalled();
    expect(sandboxMocks.unsafe).not.toHaveBeenCalled();
  });

  it('GET /api/health/ready returns 200 when required checks pass', async () => {
    dbMocks.execute.mockResolvedValueOnce([{ '?column?': 1 }]);
    mediaMocks.listAssets.mockResolvedValueOnce([]);
    const app = createApp();
    const res = await app.request('/api/health/ready');

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('healthy');
    expect(data.checks.database.status).toBe('ok');
    expect(data.checks.sandboxDatabase.status).toBe('skip');
    expect(data.checks.aiProvider.status).toBe('ok');
    expect(data.checks.mediaStorage.status).toBe('ok');
  });

  it('GET /api/health/ready returns 503 when DB is unreachable', async () => {
    dbMocks.execute.mockRejectedValueOnce(new Error('db down'));
    mediaMocks.listAssets.mockResolvedValueOnce([]);
    const app = createApp();
    const res = await app.request('/api/health/ready');

    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.status).toBe('degraded');
    expect(data.checks.database.status).toBe('fail');
  });

  it('GET /api/health/ready returns 503 when AI provider is not configured', async () => {
    dbMocks.execute.mockResolvedValueOnce([{ '?column?': 1 }]);
    mediaMocks.listAssets.mockResolvedValueOnce([]);
    configMocks.OPENAI_API_KEY = undefined;
    const app = createApp();
    const res = await app.request('/api/health/ready');

    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.status).toBe('degraded');
    expect(data.checks.aiProvider.status).toBe('fail');
  });

  it('GET /api/health (legacy) behaves as readiness endpoint', async () => {
    dbMocks.execute.mockResolvedValueOnce([{ '?column?': 1 }]);
    mediaMocks.listAssets.mockResolvedValueOnce([]);
    const app = createApp();
    const res = await app.request('/api/health');

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('healthy');
    expect(data.checks.database.status).toBe('ok');
  });
});
