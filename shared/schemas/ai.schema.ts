import { z } from 'zod';
import { entityMetadataSchema, entityRowSchema, normalizedEntitySchema } from './entities.schema';
import { sourceDefinitionSchema } from './sources.schema';
import { appUiSchemaSchema } from './ui-schema.schema';

export const aiSourceContextSchema = z
  .object({
    sources: z
      .array(
        z
          .object({
            source: sourceDefinitionSchema,
            items: z.array(normalizedEntitySchema).default([]),
          })
          .strict()
      )
      .default([]),
    entities: z
      .array(
        z
          .object({
            metadata: entityMetadataSchema,
            rows: z.array(entityRowSchema).default([]),
          })
          .strict()
      )
      .default([]),
  })
  .strict();

export const aiLayoutRequestSchema = z
  .object({
    prompt: z.string().trim().min(1).max(2000),
    context: aiSourceContextSchema.optional(),
  })
  .strict();

export const aiTextRequestSchema = z
  .object({
    text: z.string().trim().min(1).max(20_000),
    prompt: z.string().trim().min(1).max(2000).optional(),
    context: aiSourceContextSchema.optional(),
  })
  .strict();

export const aiClassificationRequestSchema = aiTextRequestSchema.extend({
  labels: z.array(z.string().trim().min(1)).min(1).max(20).optional(),
});

export const aiNavigationRequestSchema = z
  .object({
    prompt: z.string().trim().min(1).max(2000),
    context: aiSourceContextSchema.optional(),
  })
  .strict();

export const aiActivitySchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    status: z.enum(['completed', 'failed']),
    detail: z.string().min(1).optional(),
  })
  .strict();

export const aiLayoutResponseSchema = z
  .object({
    schema: appUiSchemaSchema,
    activities: z.array(aiActivitySchema).default([]),
  })
  .strict();

export const aiSummaryResponseSchema = z
  .object({
    summary: z.string().min(1),
    activities: z.array(aiActivitySchema).default([]),
  })
  .strict();

export const aiClassificationResponseSchema = z
  .object({
    label: z.string().min(1),
    confidence: z.number().min(0).max(1),
    reasoning: z.string().min(1).optional(),
    activities: z.array(aiActivitySchema).default([]),
  })
  .strict();

export const aiNavigationLinkSchema = z
  .object({
    label: z.string().min(1),
    href: z.string().regex(/^\/(?!\/)/, 'href must be an app-relative path'),
    description: z.string().min(1).optional(),
  })
  .strict();

export const aiNavigationResponseSchema = z
  .object({
    links: z.array(aiNavigationLinkSchema).min(1).max(12),
    activities: z.array(aiActivitySchema).default([]),
  })
  .strict();

export type AiSourceContext = z.infer<typeof aiSourceContextSchema>;
export type AiLayoutRequest = z.infer<typeof aiLayoutRequestSchema>;
export type AiTextRequest = z.infer<typeof aiTextRequestSchema>;
export type AiClassificationRequest = z.infer<typeof aiClassificationRequestSchema>;
export type AiNavigationRequest = z.infer<typeof aiNavigationRequestSchema>;
export type AiActivity = z.infer<typeof aiActivitySchema>;
export type AiLayoutResponse = z.infer<typeof aiLayoutResponseSchema>;
export type AiSummaryResponse = z.infer<typeof aiSummaryResponseSchema>;
export type AiClassificationResponse = z.infer<typeof aiClassificationResponseSchema>;
export type AiNavigationResponse = z.infer<typeof aiNavigationResponseSchema>;
