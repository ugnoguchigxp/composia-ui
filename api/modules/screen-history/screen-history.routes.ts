import { createRoute, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import {
  screenActionGenerateRequestSchema,
  screenChildrenResponseSchema,
  screenDeleteResponseSchema,
  screenGenerateRequestSchema,
  screenListResponseSchema,
  screenRegenerateRequestSchema,
  screenResponseSchema,
} from '../../../shared/schemas/screen-history.schema';
import { createOpenApiRouter } from '../../lib/openapi';
import type { AppEnv } from '../../lib/types';
import { authMiddleware } from '../../middleware/auth';
import { screenHistoryService } from './screen-history.service';

const screenParamSchema = z.object({ screenId: z.string().uuid() }).strict();
const actionParamSchema = z
  .object({ screenId: z.string().uuid(), actionId: z.string().min(1) })
  .strict();

const listRoute = createRoute({
  method: 'get',
  path: '/',
  responses: {
    200: {
      content: { 'application/json': { schema: screenListResponseSchema } },
      description: 'List generated screens',
    },
  },
});

const detailRoute = createRoute({
  method: 'get',
  path: '/:screenId',
  request: { params: screenParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: screenResponseSchema } },
      description: 'Get generated screen',
    },
  },
});

const childrenRoute = createRoute({
  method: 'get',
  path: '/:screenId/children',
  request: { params: screenParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: screenChildrenResponseSchema } },
      description: 'List child screens',
    },
  },
});

const generateRoute = createRoute({
  method: 'post',
  path: '/generate',
  request: {
    body: {
      content: {
        'application/json': {
          schema: screenGenerateRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: screenResponseSchema } },
      description: 'Generate and save a screen from a prompt',
    },
  },
});

const actionGenerateRoute = createRoute({
  method: 'post',
  path: '/:screenId/actions/:actionId/generate',
  request: {
    params: actionParamSchema,
    body: {
      content: {
        'application/json': {
          schema: screenActionGenerateRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: screenResponseSchema } },
      description: 'Generate and save a child screen from an action',
    },
  },
});

const regenerateRoute = createRoute({
  method: 'post',
  path: '/:screenId/regenerate',
  request: {
    params: screenParamSchema,
    body: {
      content: {
        'application/json': {
          schema: screenRegenerateRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: screenResponseSchema } },
      description: 'Regenerate a screen',
    },
  },
});

const deleteRoute = createRoute({
  method: 'delete',
  path: '/:screenId',
  request: { params: screenParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: screenDeleteResponseSchema } },
      description: 'Delete generated screen',
    },
  },
});

const protectedScreensRouter = createOpenApiRouter();
protectedScreensRouter.use('*', authMiddleware());

function userId(c: Context<AppEnv>) {
  const user = c.get('user');
  if (!user) throw new Error('Authenticated user is missing from route context');
  return user.userId;
}

export const screenHistoryRouter = protectedScreensRouter
  .openapi(listRoute, async (c) => c.json(await screenHistoryService.list(userId(c)), 200))
  .openapi(generateRoute, async (c) =>
    c.json(await screenHistoryService.generate(userId(c), c.req.valid('json')), 200)
  )
  .openapi(childrenRoute, async (c) =>
    c.json(await screenHistoryService.children(userId(c), c.req.valid('param').screenId), 200)
  )
  .openapi(actionGenerateRoute, async (c) => {
    const { actionId, screenId } = c.req.valid('param');
    return c.json(
      await screenHistoryService.generateFromAction(
        userId(c),
        screenId,
        actionId,
        c.req.valid('json')
      ),
      200
    );
  })
  .openapi(regenerateRoute, async (c) =>
    c.json(
      await screenHistoryService.regenerate(
        userId(c),
        c.req.valid('param').screenId,
        c.req.valid('json')
      ),
      200
    )
  )
  .openapi(detailRoute, async (c) =>
    c.json(await screenHistoryService.get(userId(c), c.req.valid('param').screenId), 200)
  )
  .openapi(deleteRoute, async (c) =>
    c.json(await screenHistoryService.delete(userId(c), c.req.valid('param').screenId), 200)
  );
