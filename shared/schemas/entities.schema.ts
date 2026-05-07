import { z } from 'zod';

export const entitySourceSchema = z.enum(['rss', 'postgres', 'api', 'markdown']);
export const entityModeSchema = z.enum(['readonly', 'readwrite']);

export const normalizedEntitySchema = z
  .object({
    id: z.string().min(1),
    source: entitySourceSchema,
    entityType: z.string().min(1),
    title: z.string().optional(),
    body: z.string().optional(),
    summary: z.string().optional(),
    url: z.string().url().optional(),
    author: z.string().optional(),
    tags: z.array(z.string()).optional(),
    status: z.string().optional(),
    publishedAt: z.string().datetime().optional(),
    updatedAt: z.string().datetime().optional(),
    raw: z.unknown(),
  })
  .strict();

export const fieldMetadataSchema = z
  .object({
    name: z.string().min(1),
    label: z.string().min(1),
    type: z.string().min(1),
    ui: z.string().min(1).optional(),
    searchable: z.boolean().default(false),
    sortable: z.boolean().default(false),
    required: z.boolean().default(false),
  })
  .strict();

export const entityMetadataSchema = z
  .object({
    name: z.string().min(1),
    label: z.string().min(1),
    source: entitySourceSchema,
    mode: entityModeSchema,
    fields: z.array(fieldMetadataSchema),
    views: z
      .object({
        list: z.array(z.string().min(1)),
        detail: z.array(z.string().min(1)),
        form: z.array(z.string().min(1)).optional(),
        filter: z.array(z.string().min(1)).optional(),
        search: z.array(z.string().min(1)).optional(),
      })
      .strict(),
  })
  .strict();

export const entityRowSchema = z.record(z.string(), z.unknown());

export const entityMetadataListResponseSchema = z
  .object({
    entities: z.array(entityMetadataSchema),
  })
  .strict();

export const entityRowsResponseSchema = z
  .object({
    metadata: entityMetadataSchema,
    rows: z.array(entityRowSchema),
  })
  .strict();

export const entityDetailResponseSchema = z
  .object({
    metadata: entityMetadataSchema,
    row: entityRowSchema,
  })
  .strict();

export const entityMutationRequestSchema = z
  .object({
    values: entityRowSchema,
  })
  .strict();

export const entityMutationResponseSchema = z
  .object({
    row: entityRowSchema.optional(),
    success: z.boolean(),
  })
  .strict();

export type EntitySource = z.infer<typeof entitySourceSchema>;
export type NormalizedEntity = z.infer<typeof normalizedEntitySchema>;
export type FieldMetadata = z.infer<typeof fieldMetadataSchema>;
export type EntityMetadata = z.infer<typeof entityMetadataSchema>;
export type EntityRow = z.infer<typeof entityRowSchema>;
export type EntityRowsResponse = z.infer<typeof entityRowsResponseSchema>;
export type EntityDetailResponse = z.infer<typeof entityDetailResponseSchema>;
export type EntityMetadataListResponse = z.infer<typeof entityMetadataListResponseSchema>;
