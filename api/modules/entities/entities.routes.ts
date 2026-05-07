import { createRoute, z } from '@hono/zod-openapi';
import {
  entityDetailResponseSchema,
  entityMetadataListResponseSchema,
  entityMetadataSchema,
  entityMutationRequestSchema,
  entityMutationResponseSchema,
  entityRowsResponseSchema,
} from '../../../shared/schemas/entities.schema';
import { createOpenApiRouter } from '../../lib/openapi';
import { authMiddleware } from '../../middleware/auth';
import { entitiesService } from './entities.service';

const entityParamSchema = z.object({ entity: z.string().min(1) });
const entityIdParamSchema = z.object({ entity: z.string().min(1), id: z.string().uuid() });
const metadataResponseSchema = z.object({ metadata: entityMetadataSchema }).strict();

const metadataListRoute = createRoute({
  method: 'get',
  path: '/entities',
  responses: {
    200: {
      content: { 'application/json': { schema: entityMetadataListResponseSchema } },
      description: 'List entity metadata',
    },
  },
});

const metadataDetailRoute = createRoute({
  method: 'get',
  path: '/entities/:entity',
  request: { params: entityParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: metadataResponseSchema } },
      description: 'Get entity metadata',
    },
  },
});

const metadataRefreshRoute = createRoute({
  method: 'post',
  path: '/entities/:entity/refresh',
  request: { params: entityParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: metadataResponseSchema } },
      description: 'Refresh entity metadata',
    },
  },
});

const listRoute = createRoute({
  method: 'get',
  path: '/',
  responses: {
    200: {
      content: { 'application/json': { schema: entityMetadataListResponseSchema } },
      description: 'List entities',
    },
  },
});

const rowsRoute = createRoute({
  method: 'get',
  path: '/:entity',
  request: { params: entityParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: entityRowsResponseSchema } },
      description: 'List entity rows',
    },
  },
});

const detailRoute = createRoute({
  method: 'get',
  path: '/:entity/:id',
  request: { params: entityIdParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: entityDetailResponseSchema } },
      description: 'Get entity row',
    },
  },
});

const createEntityRoute = createRoute({
  method: 'post',
  path: '/:entity',
  request: {
    params: entityParamSchema,
    body: {
      content: {
        'application/json': {
          schema: entityMutationRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: entityMutationResponseSchema } },
      description: 'Create entity row',
    },
  },
});

const updateEntityRoute = createRoute({
  method: 'put',
  path: '/:entity/:id',
  request: {
    params: entityIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: entityMutationRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: entityMutationResponseSchema } },
      description: 'Update entity row',
    },
  },
});

const deleteEntityRoute = createRoute({
  method: 'delete',
  path: '/:entity/:id',
  request: { params: entityIdParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: entityMutationResponseSchema } },
      description: 'Delete entity row',
    },
  },
});

const protectedEntitiesRouter = createOpenApiRouter();
protectedEntitiesRouter.use('*', authMiddleware());

export const metadataRouter = protectedEntitiesRouter
  .openapi(metadataListRoute, async (c) => c.json(await entitiesService.listMetadata(), 200))
  .openapi(metadataDetailRoute, async (c) =>
    c.json(await entitiesService.metadata(c.req.valid('param').entity), 200)
  )
  .openapi(metadataRefreshRoute, async (c) =>
    c.json(await entitiesService.metadata(c.req.valid('param').entity), 200)
  );

const protectedEntityRowsRouter = createOpenApiRouter();
protectedEntityRowsRouter.use('*', authMiddleware());

export const entitiesRouter = protectedEntityRowsRouter
  .openapi(listRoute, async (c) => c.json(await entitiesService.listMetadata(), 200))
  .openapi(detailRoute, async (c) => {
    const { entity, id } = c.req.valid('param');
    return c.json(await entitiesService.get(entity, id), 200);
  })
  .openapi(rowsRoute, async (c) =>
    c.json(await entitiesService.list(c.req.valid('param').entity), 200)
  )
  .openapi(createEntityRoute, async (c) =>
    c.json(await entitiesService.create(c.req.valid('param').entity), 200)
  )
  .openapi(updateEntityRoute, async (c) =>
    c.json(await entitiesService.update(c.req.valid('param').entity), 200)
  )
  .openapi(deleteEntityRoute, async (c) =>
    c.json(await entitiesService.delete(c.req.valid('param').entity), 200)
  );
