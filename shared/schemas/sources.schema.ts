import { z } from 'zod';
import { normalizedEntitySchema } from './entities.schema';

export const sourceKindSchema = z.enum(['rss', 'postgres', 'api', 'markdown']);

export const sourceSettingsSchema = z
  .object({
    entity: z.string().min(1).optional(),
    itemPath: z.string().min(1).optional(),
    titleField: z.string().min(1).optional(),
    bodyField: z.string().min(1).optional(),
    summaryField: z.string().min(1).optional(),
    urlField: z.string().min(1).optional(),
    authorField: z.string().min(1).optional(),
    tagsField: z.string().min(1).optional(),
    publishedAtField: z.string().min(1).optional(),
    updatedAtField: z.string().min(1).optional(),
  })
  .strict();

export const sourceDefinitionSchema = z
  .object({
    id: z.string().min(1),
    kind: sourceKindSchema,
    label: z.string().min(1),
    url: z.string().url().optional(),
    entityType: z.string().min(1),
    settings: sourceSettingsSchema.optional(),
    enabled: z.boolean().default(true),
    createdAt: z.string().datetime().optional(),
    updatedAt: z.string().datetime().optional(),
  })
  .strict();

const sourceBaseRequestSchema = z
  .object({
    label: z.string().trim().min(1),
    entityType: z.string().trim().min(1).default('rss-item'),
  })
  .strict();

export const createRssSourceRequestSchema = sourceBaseRequestSchema.extend({
  url: z.string().trim().url(),
});

export const createApiSourceRequestSchema = sourceBaseRequestSchema.extend({
  url: z.string().trim().url(),
  settings: sourceSettingsSchema.optional(),
});

export const createMarkdownSourceRequestSchema = sourceBaseRequestSchema.extend({
  url: z.string().trim().url(),
  settings: sourceSettingsSchema.optional(),
});

export const createPostgresSourceRequestSchema = sourceBaseRequestSchema.extend({
  entity: z.enum(['source-definitions', 'normalized-entities', 'cache-entries']),
  settings: sourceSettingsSchema.omit({ entity: true }).optional(),
});

export const sourceListResponseSchema = z
  .object({
    sources: z.array(sourceDefinitionSchema),
  })
  .strict();

export const sourceResponseSchema = z
  .object({
    source: sourceDefinitionSchema,
  })
  .strict();

export const sourceItemsResponseSchema = z
  .object({
    source: sourceDefinitionSchema,
    items: z.array(normalizedEntitySchema),
  })
  .strict();

export const sourceRefreshResponseSchema = z
  .object({
    source: sourceDefinitionSchema,
    items: z.array(normalizedEntitySchema),
    refreshedAt: z.string().datetime(),
  })
  .strict();

export type SourceKind = z.infer<typeof sourceKindSchema>;
export type SourceSettings = z.infer<typeof sourceSettingsSchema>;
export type SourceDefinition = z.infer<typeof sourceDefinitionSchema>;
export type CreateRssSourceRequest = z.infer<typeof createRssSourceRequestSchema>;
export type CreateApiSourceRequest = z.infer<typeof createApiSourceRequestSchema>;
export type CreateMarkdownSourceRequest = z.infer<typeof createMarkdownSourceRequestSchema>;
export type CreatePostgresSourceRequest = z.infer<typeof createPostgresSourceRequestSchema>;
export type SourceListResponse = z.infer<typeof sourceListResponseSchema>;
export type SourceItemsResponse = z.infer<typeof sourceItemsResponseSchema>;
export type SourceRefreshResponse = z.infer<typeof sourceRefreshResponseSchema>;
