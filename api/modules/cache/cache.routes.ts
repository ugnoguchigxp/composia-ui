import { createRoute, z } from '@hono/zod-openapi';
import {
  cacheEntryResponseSchema,
  cacheInvalidateRequestSchema,
  cacheMutationResponseSchema,
  cacheSetRequestSchema,
  cacheStatusSchema,
} from '../../../shared/schemas/cache.schema';
import { createOpenApiRouter } from '../../lib/openapi';
import { authMiddleware } from '../../middleware/auth';
import { cacheService } from './cache.service';

const statusRoute = createRoute({
  method: 'get',
  path: '/status',
  responses: {
    200: {
      content: { 'application/json': { schema: cacheStatusSchema } },
      description: 'Cache status',
    },
  },
});

const getRoute = createRoute({
  method: 'get',
  path: '/:namespace/:key',
  request: {
    params: z.object({ namespace: z.string().min(1), key: z.string().min(1) }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: cacheEntryResponseSchema } },
      description: 'Cache entry',
    },
  },
});

const setRoute = createRoute({
  method: 'post',
  path: '/set',
  request: {
    body: {
      content: {
        'application/json': {
          schema: cacheSetRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: cacheEntryResponseSchema } },
      description: 'Cache entry saved',
    },
  },
});

const invalidateRoute = createRoute({
  method: 'post',
  path: '/invalidate',
  request: {
    body: {
      content: {
        'application/json': {
          schema: cacheInvalidateRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: cacheMutationResponseSchema } },
      description: 'Cache invalidated',
    },
  },
});

const rebuildRoute = createRoute({
  method: 'post',
  path: '/rebuild',
  responses: {
    200: {
      content: { 'application/json': { schema: cacheMutationResponseSchema } },
      description: 'Expired cache entries removed',
    },
  },
});

const deleteRoute = createRoute({
  method: 'delete',
  path: '/:namespace/:key',
  request: {
    params: z.object({ namespace: z.string().min(1), key: z.string().min(1) }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: cacheMutationResponseSchema } },
      description: 'Cache entry deleted',
    },
  },
});

const protectedCacheRouter = createOpenApiRouter();
protectedCacheRouter.use('*', authMiddleware());

export const cacheRouter = protectedCacheRouter
  .openapi(statusRoute, async (c) => c.json(await cacheService.status(), 200))
  .openapi(setRoute, async (c) => c.json(await cacheService.set(c.req.valid('json')), 200))
  .openapi(invalidateRoute, async (c) =>
    c.json(await cacheService.invalidate(c.req.valid('json')), 200)
  )
  .openapi(rebuildRoute, async (c) => c.json(await cacheService.rebuild(), 200))
  .openapi(getRoute, async (c) => {
    const { namespace, key } = c.req.valid('param');
    return c.json(await cacheService.get(namespace, key), 200);
  })
  .openapi(deleteRoute, async (c) => {
    const { namespace, key } = c.req.valid('param');
    return c.json(await cacheService.delete(namespace, key), 200);
  });
