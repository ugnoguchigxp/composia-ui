import { createRoute, z } from '@hono/zod-openapi';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { config } from '../config';
import { db } from '../db/client';
import { createOpenApiRouter } from '../lib/openapi';
import { getSandboxSql } from '../modules/database-design/sandbox-client';
import { mediaRepository } from '../modules/media/media.repository';

const readinessCheckStatusSchema = z.enum(['ok', 'fail', 'skip']);

const readinessCheckSchema = z.object({
  status: readinessCheckStatusSchema.openapi({ example: 'ok' }),
  detail: z.string().openapi({ example: 'reachable' }).optional(),
});

const readinessSchema = z.object({
  status: z.enum(['healthy', 'degraded']).openapi({ example: 'healthy' }),
  checks: z
    .object({
      database: readinessCheckSchema,
      sandboxDatabase: readinessCheckSchema,
      aiProvider: readinessCheckSchema,
      mediaStorage: readinessCheckSchema,
    })
    .openapi({
      example: {
        database: { status: 'ok', detail: 'reachable' },
        sandboxDatabase: { status: 'skip', detail: 'not configured' },
        aiProvider: { status: 'ok', detail: 'openai' },
        mediaStorage: { status: 'ok', detail: '12 assets indexed' },
      },
    }),
  timestamp: z.string().openapi({ example: '2026-04-02T11:47:06.000Z' }),
  version: z.string().openapi({ example: '1.0.0' }),
});

const livenessSchema = z.object({
  status: z.string().openapi({ example: 'alive' }),
  timestamp: z.string().openapi({ example: '2026-04-02T11:47:06.000Z' }),
  version: z.string().openapi({ example: '1.0.0' }),
});

const liveRoute = createRoute({
  method: 'get',
  path: '/live',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: livenessSchema,
        },
      },
      description: 'Liveness probe (process is up)',
    },
  },
});

const readyRoute = createRoute({
  method: 'get',
  path: '/ready',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: readinessSchema,
        },
      },
      description: 'Readiness probe (dependencies are ready)',
    },
    503: {
      content: {
        'application/json': {
          schema: readinessSchema,
        },
      },
      description: 'Readiness probe failed',
    },
  },
});

const legacyHealthRoute = createRoute({
  method: 'get',
  path: '/',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: readinessSchema,
        },
      },
      description: 'Backward-compatible readiness endpoint',
    },
    503: {
      content: {
        'application/json': {
          schema: readinessSchema,
        },
      },
      description: 'Backward-compatible readiness endpoint failed',
    },
  },
});

type ReadinessCheck = z.infer<typeof readinessCheckSchema>;
type ReadinessPayload = z.infer<typeof readinessSchema>;

function errorDetail(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return 'Unknown error';
}

function ok(detail: string): ReadinessCheck {
  return { status: 'ok', detail };
}

function fail(detail: string): ReadinessCheck {
  return { status: 'fail', detail };
}

function skip(detail: string): ReadinessCheck {
  return { status: 'skip', detail };
}

async function checkDatabase() {
  try {
    await db.execute(sql`select 1`);
    return ok('reachable');
  } catch (error) {
    return fail(errorDetail(error));
  }
}

async function checkSandboxDatabase() {
  if (!config.SANDBOX_DATABASE_URL) {
    return skip('not configured');
  }

  try {
    await getSandboxSql().unsafe('select 1');
    return ok('reachable');
  } catch (error) {
    return fail(errorDetail(error));
  }
}

function checkAiProvider() {
  const providers: string[] = [];
  if (config.OPENAI_API_KEY) providers.push('openai');
  if (
    config.AZURE_OPENAI_API_KEY &&
    config.AZURE_OPENAI_ENDPOINT &&
    config.AZURE_OPENAI_DEPLOYMENT_NAME
  ) {
    providers.push('azure-openai');
  }
  if (config.ANTHROPIC_API_KEY) providers.push('anthropic');
  if (config.GOOGLE_AI_API_KEY) providers.push('google-ai');
  if (providers.length === 0) {
    return fail('no provider credentials configured');
  }
  return ok(providers.join(','));
}

async function checkMediaStorage() {
  try {
    const assets = await mediaRepository.listAssets();
    return ok(`${assets.length} assets indexed`);
  } catch (error) {
    return fail(errorDetail(error));
  }
}

const buildReadinessPayload = async (): Promise<ReadinessPayload> => {
  const [database, sandboxDatabase, mediaStorage] = await Promise.all([
    checkDatabase(),
    checkSandboxDatabase(),
    checkMediaStorage(),
  ]);
  const aiProvider = checkAiProvider();
  const checks = {
    database,
    sandboxDatabase,
    aiProvider,
    mediaStorage,
  };
  const degraded = Object.values(checks).some((check) => check.status === 'fail');

  const status: ReadinessPayload['status'] = degraded ? 'degraded' : 'healthy';

  return {
    status,
    checks,
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  };
};

const readinessHandler = async (c: Context) => {
  const payload = await buildReadinessPayload();
  return c.json(payload, payload.status === 'healthy' ? 200 : 503);
};

export const healthRouter = createOpenApiRouter()
  .openapi(liveRoute, (c) => {
    return c.json(
      {
        status: 'alive',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
      200
    );
  })
  .openapi(readyRoute, readinessHandler)
  .openapi(legacyHealthRoute, readinessHandler);
