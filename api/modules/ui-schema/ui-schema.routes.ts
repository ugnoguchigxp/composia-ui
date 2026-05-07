import { createRoute, z } from '@hono/zod-openapi';
import {
  uiSchemaRequestSchema,
  uiSchemaResponseSchema,
  uiSchemaValidationResponseSchema,
} from '../../../shared/schemas/ui-schema.schema';
import { createOpenApiRouter } from '../../lib/openapi';
import { authMiddleware } from '../../middleware/auth';
import { uiSchemaService } from './ui-schema.service';

const pageRoute = createRoute({
  method: 'get',
  path: '/pages/:pageId',
  request: {
    params: z.object({ pageId: z.string().min(1) }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: uiSchemaResponseSchema } },
      description: 'Get fixed UI schema page',
    },
  },
});

const validateRoute = createRoute({
  method: 'post',
  path: '/validate',
  request: {
    body: {
      content: {
        'application/json': {
          schema: uiSchemaRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: uiSchemaValidationResponseSchema } },
      description: 'Validate UI schema',
    },
  },
});

const previewRoute = createRoute({
  method: 'post',
  path: '/preview',
  request: {
    body: {
      content: {
        'application/json': {
          schema: uiSchemaRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: uiSchemaResponseSchema } },
      description: 'Preview UI schema',
    },
  },
});

const protectedUiSchemaRouter = createOpenApiRouter();
protectedUiSchemaRouter.use('*', authMiddleware());

export const uiSchemaRouter = protectedUiSchemaRouter
  .openapi(pageRoute, async (c) =>
    c.json(await uiSchemaService.getPage(c.req.valid('param').pageId), 200)
  )
  .openapi(validateRoute, async (c) =>
    c.json(await uiSchemaService.validate(c.req.valid('json')), 200)
  )
  .openapi(previewRoute, async (c) =>
    c.json(await uiSchemaService.preview(c.req.valid('json')), 200)
  );
