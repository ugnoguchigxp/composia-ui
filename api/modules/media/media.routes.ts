import { createRoute, z } from '@hono/zod-openapi';
import {
  mediaAssetSchema,
  mediaDeleteResponseSchema,
  mediaListQuerySchema,
  mediaListResponseSchema,
  mediaUpdateRequestSchema,
  mediaUploadResponseSchema,
} from '../../../shared/schemas/media.schema';
import { ValidationError } from '../../lib/errors';
import { createOpenApiRouter } from '../../lib/openapi';
import { authMiddleware } from '../../middleware/auth';
import { mediaService, type UploadFile } from './media.service';

const assetParamsSchema = z.object({
  assetId: z.string().min(1).max(255),
});

const listRoute = createRoute({
  method: 'get',
  path: '/assets',
  request: {
    query: mediaListQuerySchema,
  },
  responses: {
    200: {
      content: { 'application/json': { schema: mediaListResponseSchema } },
      description: 'List media assets',
    },
  },
});

const uploadRoute = createRoute({
  method: 'post',
  path: '/upload',
  responses: {
    201: {
      content: { 'application/json': { schema: mediaUploadResponseSchema } },
      description: 'Upload a media asset',
    },
  },
});

const updateRoute = createRoute({
  method: 'put',
  path: '/assets/:assetId',
  request: {
    body: {
      content: {
        'application/json': {
          schema: mediaUpdateRequestSchema,
        },
      },
    },
    params: assetParamsSchema,
  },
  responses: {
    200: {
      content: { 'application/json': { schema: mediaAssetSchema } },
      description: 'Update media asset metadata',
    },
  },
});

const deleteRoute = createRoute({
  method: 'delete',
  path: '/assets/:assetId',
  request: {
    params: assetParamsSchema,
  },
  responses: {
    200: {
      content: { 'application/json': { schema: mediaDeleteResponseSchema } },
      description: 'Delete media asset',
    },
  },
});

function isUploadFile(value: unknown): value is UploadFile {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<UploadFile>;
  return (
    typeof candidate.arrayBuffer === 'function' &&
    typeof candidate.name === 'string' &&
    typeof candidate.size === 'number' &&
    typeof candidate.type === 'string'
  );
}

function firstFormValue(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}

const protectedMediaRouter = createOpenApiRouter();
protectedMediaRouter.use('*', authMiddleware());

export const mediaRouter = protectedMediaRouter
  .openapi(listRoute, async (c) => c.json(await mediaService.list(c.req.valid('query')), 200))
  .openapi(uploadRoute, async (c) => {
    const body = await c.req.parseBody();
    const file = firstFormValue(body.file);
    if (!isUploadFile(file)) {
      throw new ValidationError('Upload requires a file field');
    }
    return c.json(await mediaService.upload(file), 201);
  })
  .openapi(updateRoute, async (c) => {
    const { assetId } = c.req.valid('param');
    return c.json(await mediaService.update(assetId, c.req.valid('json')), 200);
  })
  .openapi(deleteRoute, async (c) => {
    const { assetId } = c.req.valid('param');
    return c.json(await mediaService.delete(assetId), 200);
  });
