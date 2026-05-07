import { z } from 'zod';
import { aiActivitySchema, aiSourceContextSchema } from './ai.schema';
import { appActionSchema, appUiSchemaSchema } from './ui-schema.schema';

export const screenTriggerSchema = z.enum(['initial-prompt', 'action-click', 'regenerate']);

export const screenProviderMetaSchema = z
  .object({
    provider: z.enum(['openai', 'azure-openai', 'mock']).default('mock'),
    model: z.string().min(1).optional(),
    componentRegistryVersion: z.string().min(1),
  })
  .strict();

export const promptSessionSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().min(1),
    createdBy: z.string().uuid(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const generatedScreenActionSchema = appActionSchema.extend({
  component: z.string().min(1).optional(),
});

export const generatedScreenSchema = z
  .object({
    id: z.string().uuid(),
    sessionId: z.string().uuid(),
    parentScreenId: z.string().uuid().nullable().optional(),
    trigger: screenTriggerSchema,
    prompt: z.string().min(1),
    inferredIntent: z.string().min(1),
    action: generatedScreenActionSchema.nullable().optional(),
    schema: appUiSchemaSchema,
    contextSnapshot: aiSourceContextSchema
      .extend({
        previousScreen: appUiSchemaSchema.optional(),
      })
      .partial()
      .default({}),
    providerMeta: screenProviderMetaSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const generatedScreenSummarySchema = generatedScreenSchema
  .pick({
    id: true,
    sessionId: true,
    parentScreenId: true,
    trigger: true,
    prompt: true,
    inferredIntent: true,
    action: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    page: z.string().min(1),
    sessionTitle: z.string().min(1),
    sections: z.number().int().min(0),
  })
  .strict();

export const screenGenerateRequestSchema = z
  .object({
    prompt: z.string().trim().min(1).max(2000),
    title: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export const screenActionGenerateRequestSchema = z
  .object({
    action: appActionSchema.optional(),
    prompt: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();

export const screenRegenerateRequestSchema = z
  .object({
    prompt: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();

export const screenListResponseSchema = z
  .object({
    screens: z.array(generatedScreenSummarySchema),
  })
  .strict();

export const screenResponseSchema = z
  .object({
    screen: generatedScreenSchema,
    activities: z.array(aiActivitySchema).default([]),
  })
  .strict();

export const screenChildrenResponseSchema = z
  .object({
    screens: z.array(generatedScreenSummarySchema),
  })
  .strict();

export const screenDeleteResponseSchema = z
  .object({
    success: z.boolean(),
  })
  .strict();

export type ScreenTrigger = z.infer<typeof screenTriggerSchema>;
export type PromptSession = z.infer<typeof promptSessionSchema>;
export type GeneratedScreen = z.infer<typeof generatedScreenSchema>;
export type GeneratedScreenSummary = z.infer<typeof generatedScreenSummarySchema>;
export type ScreenGenerateRequest = z.infer<typeof screenGenerateRequestSchema>;
export type ScreenActionGenerateRequest = z.infer<typeof screenActionGenerateRequestSchema>;
export type ScreenRegenerateRequest = z.infer<typeof screenRegenerateRequestSchema>;
export type ScreenListResponse = z.infer<typeof screenListResponseSchema>;
export type ScreenResponse = z.infer<typeof screenResponseSchema>;
export type ScreenChildrenResponse = z.infer<typeof screenChildrenResponseSchema>;
export type ScreenDeleteResponse = z.infer<typeof screenDeleteResponseSchema>;
