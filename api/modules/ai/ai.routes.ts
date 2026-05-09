import { createRoute } from '@hono/zod-openapi';
import type { Context } from 'hono';
import {
  type AiActivity,
  aiClassificationRequestSchema,
  aiClassificationResponseSchema,
  aiLayoutRequestSchema,
  aiLayoutResponseSchema,
  aiNavigationRequestSchema,
  aiNavigationResponseSchema,
  aiSummaryResponseSchema,
  aiTextRequestSchema,
} from '../../../shared/schemas/ai.schema';
import { createOpenApiRouter } from '../../lib/openapi';
import { authMiddleware } from '../../middleware/auth';
import { aiService } from './ai.service';

const layoutRoute = createRoute({
  method: 'post',
  path: '/layout',
  request: {
    body: {
      content: {
        'application/json': {
          schema: aiLayoutRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: aiLayoutResponseSchema,
        },
      },
      description: 'Generated App UI Schema',
    },
  },
});

const summarizeRoute = createRoute({
  method: 'post',
  path: '/summarize',
  request: {
    body: {
      content: {
        'application/json': {
          schema: aiTextRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: aiSummaryResponseSchema,
        },
      },
      description: 'Generated summary',
    },
  },
});

const classifyRoute = createRoute({
  method: 'post',
  path: '/classify',
  request: {
    body: {
      content: {
        'application/json': {
          schema: aiClassificationRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: aiClassificationResponseSchema,
        },
      },
      description: 'Generated classification',
    },
  },
});

const navigationRoute = createRoute({
  method: 'post',
  path: '/navigation',
  request: {
    body: {
      content: {
        'application/json': {
          schema: aiNavigationRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: aiNavigationResponseSchema,
        },
      },
      description: 'Generated navigation',
    },
  },
});

const protectedAiRouter = createOpenApiRouter();
protectedAiRouter.use('*', authMiddleware());

function traceContext(c: Context) {
  return {
    logger: c.get('logger'),
    requestId: c.req.header('X-Request-Id') ?? undefined,
    userId: c.get('user')?.userId,
  };
}

const activityTimingMetricMap: Record<string, string> = {
  'catalog-validation': 'catalog_validation',
  'provider-response': 'provider',
  'render-preparation': 'render_preparation',
  'schema-validation': 'schema_validation',
};

function activityDurationMs(detail?: string) {
  if (!detail) return null;
  const match = detail.match(/(\d+)\s*ms\b/i);
  if (!match) return null;
  const duration = Number.parseInt(match[1], 10);
  if (!Number.isFinite(duration)) return null;
  return duration;
}

function setServerTimingHeader(c: Context, activities: AiActivity[]) {
  const metrics = activities
    .map((activity) => ({
      durationMs: activityDurationMs(activity.detail),
      metricName: activityTimingMetricMap[activity.id],
    }))
    .filter(
      (
        metric
      ): metric is {
        durationMs: number;
        metricName: string;
      } => Boolean(metric.metricName) && typeof metric.durationMs === 'number'
    );

  if (metrics.length === 0) return;

  c.header(
    'Server-Timing',
    metrics.map((metric) => `${metric.metricName};dur=${metric.durationMs}`).join(', ')
  );
}

export const aiRouter = protectedAiRouter
  .openapi(layoutRoute, async (c) => {
    const response = await aiService.generateLayout(c.req.valid('json'), traceContext(c));
    setServerTimingHeader(c, response.activities);
    return c.json(response, 200);
  })
  .openapi(summarizeRoute, async (c) => {
    const response = await aiService.summarize(c.req.valid('json'), traceContext(c));
    setServerTimingHeader(c, response.activities);
    return c.json(response, 200);
  })
  .openapi(classifyRoute, async (c) => {
    const response = await aiService.classify(c.req.valid('json'), traceContext(c));
    setServerTimingHeader(c, response.activities);
    return c.json(response, 200);
  })
  .openapi(navigationRoute, async (c) => {
    const response = await aiService.generateNavigation(c.req.valid('json'), traceContext(c));
    setServerTimingHeader(c, response.activities);
    return c.json(response, 200);
  });
