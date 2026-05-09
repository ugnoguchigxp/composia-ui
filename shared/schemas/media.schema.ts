import { z } from 'zod';

export const mediaFolders = [
  'uncategorized',
  'articles',
  'banners',
  'icons',
  'thumbnails',
  'others',
] as const;

export const mediaFolderSchema = z.enum(mediaFolders);
export const mediaSortBySchema = z.enum(['date', 'name', 'size']);
export const mediaSortOrderSchema = z.enum(['asc', 'desc']);

export const mediaAssetSchema = z
  .object({
    id: z.string().min(1),
    filename: z.string().min(1),
    originalName: z.string().nullable().default(null),
    mimeType: z.string().min(1),
    size: z.number().int().min(0),
    url: z.string().min(1),
    width: z.number().int().positive().nullable().default(null),
    height: z.number().int().positive().nullable().default(null),
    folder: mediaFolderSchema.default('uncategorized'),
    tags: z.string().nullable().default(null),
    altText: z.string().nullable().default(null),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime().nullable().default(null),
  })
  .strict();

export const mediaListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(24),
    folder: z.union([mediaFolderSchema, z.literal('all')]).default('all'),
    q: z.string().trim().max(200).optional(),
    sortBy: mediaSortBySchema.default('date'),
    sortOrder: mediaSortOrderSchema.default('desc'),
  })
  .strict();

export const mediaPaginationSchema = z
  .object({
    total: z.number().int().min(0),
    page: z.number().int().min(1),
    limit: z.number().int().min(1),
    totalPages: z.number().int().min(0),
  })
  .strict();

export const mediaListResponseSchema = z
  .object({
    files: z.array(mediaAssetSchema),
    pagination: mediaPaginationSchema,
  })
  .strict();

export const mediaUpdateRequestSchema = z
  .object({
    folder: mediaFolderSchema.optional(),
    tags: z.string().trim().max(500).nullable().optional(),
    altText: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

export const mediaUploadResponseSchema = z
  .object({
    success: z.boolean(),
    asset: mediaAssetSchema.optional(),
    error: z.string().optional(),
  })
  .strict();

export const mediaDeleteResponseSchema = z
  .object({
    success: z.boolean(),
  })
  .strict();

export type MediaAsset = z.infer<typeof mediaAssetSchema>;
export type MediaFolder = z.infer<typeof mediaFolderSchema>;
export type MediaListQuery = z.infer<typeof mediaListQuerySchema>;
export type MediaListResponse = z.infer<typeof mediaListResponseSchema>;
export type MediaUpdateRequest = z.infer<typeof mediaUpdateRequestSchema>;
export type MediaUploadResponse = z.infer<typeof mediaUploadResponseSchema>;
export type MediaDeleteResponse = z.infer<typeof mediaDeleteResponseSchema>;
