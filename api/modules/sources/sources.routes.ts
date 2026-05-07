import { createRoute, z } from '@hono/zod-openapi';
import {
  createApiSourceRequestSchema,
  createMarkdownSourceRequestSchema,
  createPostgresSourceRequestSchema,
  createRssSourceRequestSchema,
  sourceItemsResponseSchema,
  sourceListResponseSchema,
  sourceRefreshResponseSchema,
  sourceResponseSchema,
} from '../../../shared/schemas/sources.schema';
import { createOpenApiRouter } from '../../lib/openapi';
import { authMiddleware } from '../../middleware/auth';
import { sourcesService } from './sources.service';

const sourceParamsSchema = z.object({ sourceId: z.string().uuid() });
const mutationResponseSchema = z.object({ success: z.boolean() }).strict();

const listRoute = createRoute({
  method: 'get',
  path: '/',
  responses: {
    200: {
      content: { 'application/json': { schema: sourceListResponseSchema } },
      description: 'List sources',
    },
  },
});

const getRoute = createRoute({
  method: 'get',
  path: '/:sourceId',
  request: { params: sourceParamsSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: sourceResponseSchema } },
      description: 'Get source',
    },
  },
});

const itemsRoute = createRoute({
  method: 'get',
  path: '/:sourceId/items',
  request: { params: sourceParamsSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: sourceItemsResponseSchema } },
      description: 'List source items',
    },
  },
});

const createRssRoute = createRoute({
  method: 'post',
  path: '/rss',
  request: {
    body: {
      content: {
        'application/json': {
          schema: createRssSourceRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: sourceResponseSchema } },
      description: 'Create RSS source',
    },
  },
});

const createApiRoute = createRoute({
  method: 'post',
  path: '/api',
  request: {
    body: {
      content: {
        'application/json': {
          schema: createApiSourceRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: sourceResponseSchema } },
      description: 'Create API source',
    },
  },
});

const createMarkdownRoute = createRoute({
  method: 'post',
  path: '/markdown',
  request: {
    body: {
      content: {
        'application/json': {
          schema: createMarkdownSourceRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: sourceResponseSchema } },
      description: 'Create Markdown source',
    },
  },
});

const createPostgresRoute = createRoute({
  method: 'post',
  path: '/postgres',
  request: {
    body: {
      content: {
        'application/json': {
          schema: createPostgresSourceRequestSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: sourceResponseSchema } },
      description: 'Create PostgreSQL source',
    },
  },
});

const refreshRoute = createRoute({
  method: 'post',
  path: '/:sourceId/refresh',
  request: { params: sourceParamsSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: sourceRefreshResponseSchema } },
      description: 'Refresh source',
    },
  },
});

const deleteRoute = createRoute({
  method: 'delete',
  path: '/:sourceId',
  request: { params: sourceParamsSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: mutationResponseSchema } },
      description: 'Delete source',
    },
  },
});

const protectedSourcesRouter = createOpenApiRouter();
protectedSourcesRouter.use('*', authMiddleware());

export const sourcesRouter = protectedSourcesRouter
  .openapi(listRoute, async (c) => c.json(await sourcesService.listSources(), 200))
  .openapi(createRssRoute, async (c) =>
    c.json(await sourcesService.createRssSource(c.req.valid('json')), 201)
  )
  .openapi(createApiRoute, async (c) =>
    c.json(await sourcesService.createApiSource(c.req.valid('json')), 201)
  )
  .openapi(createMarkdownRoute, async (c) =>
    c.json(await sourcesService.createMarkdownSource(c.req.valid('json')), 201)
  )
  .openapi(createPostgresRoute, async (c) =>
    c.json(await sourcesService.createPostgresSource(c.req.valid('json')), 201)
  )
  .openapi(itemsRoute, async (c) =>
    c.json(await sourcesService.listItems(c.req.valid('param').sourceId), 200)
  )
  .openapi(refreshRoute, async (c) =>
    c.json(await sourcesService.refreshSource(c.req.valid('param').sourceId), 200)
  )
  .openapi(getRoute, async (c) =>
    c.json(await sourcesService.getSource(c.req.valid('param').sourceId), 200)
  )
  .openapi(deleteRoute, async (c) =>
    c.json(await sourcesService.deleteSource(c.req.valid('param').sourceId), 200)
  );
