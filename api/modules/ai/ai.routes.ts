import { createRoute } from '@hono/zod-openapi';
import {
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

export const aiRouter = protectedAiRouter
  .openapi(layoutRoute, async (c) =>
    c.json(await aiService.generateLayout(c.req.valid('json')), 200)
  )
  .openapi(summarizeRoute, async (c) => c.json(await aiService.summarize(c.req.valid('json')), 200))
  .openapi(classifyRoute, async (c) => c.json(await aiService.classify(c.req.valid('json')), 200))
  .openapi(navigationRoute, async (c) =>
    c.json(await aiService.generateNavigation(c.req.valid('json')), 200)
  );
