import { z } from 'zod';
import { aiActivitySchema, aiSourceContextSchema } from './ai.schema';
import { dataBindingSchema } from './data-binding.schema';
import { appActionSchema, appUiSchemaSchema } from './ui-schema.schema';

export const screenTriggerSchema = z.enum([
  'initial-prompt',
  'action-click',
  'regenerate',
  'chat-edit',
]);

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
    activeScreenJsonId: z.string().uuid().nullable().default(null),
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
    version: z.number().int().min(1).default(1),
    trigger: screenTriggerSchema,
    prompt: z.string().min(1),
    inferredIntent: z.string().min(1),
    action: generatedScreenActionSchema.nullable().optional(),
    schema: appUiSchemaSchema,
    databaseSchemaJsonId: z.string().uuid().nullable().default(null),
    dataBindings: z.array(dataBindingSchema).default([]),
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

export const screenJsonSchema = z
  .object({
    id: z.string().uuid(),
    sessionId: z.string().uuid(),
    version: z.number().int().min(1),
    prompt: z.string().min(1),
    trigger: screenTriggerSchema,
    inferredIntent: z.string().min(1),
    action: generatedScreenActionSchema.nullable().optional(),
    schema: appUiSchemaSchema,
    databaseSchemaJsonId: z.string().uuid().nullable().default(null),
    dataBindings: z.array(dataBindingSchema).default([]),
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

export const promptSessionMessageMetadataSchema = z
  .object({
    checkpointScreenJsonId: z.string().uuid().optional(),
    checkpointLabel: z.string().min(1).optional(),
    generatedPage: z.string().min(1).optional(),
    version: z.number().int().min(1).optional(),
    trigger: screenTriggerSchema.optional(),
  })
  .catchall(z.unknown());

export const promptSessionMessageSchema = z
  .object({
    id: z.string().uuid(),
    sessionId: z.string().uuid(),
    screenJsonId: z.string().uuid(),
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1),
    metadata: promptSessionMessageMetadataSchema.default({}),
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
    version: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    page: z.string().min(1),
    sessionTitle: z.string().min(1),
    activeScreenJsonId: z.string().uuid().nullable().default(null),
    sections: z.number().int().min(0),
  })
  .strict();

export const promptSessionSummarySchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().min(1),
    activeScreenJsonId: z.string().uuid().nullable(),
    activeVersion: z.number().int().min(1).nullable(),
    page: z.string().min(1).nullable(),
    prompt: z.string().min(1).nullable(),
    inferredIntent: z.string().min(1).nullable(),
    screenCount: z.number().int().min(0),
    messageCount: z.number().int().min(0),
    messageSearchText: z.string().nullable().default(null),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
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

export const screenEditRequestSchema = z
  .object({
    prompt: z.string().trim().min(1).max(2000),
  })
  .strict();

export const screenListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    search: z.string().optional(),
    sortBy: z.enum(['updatedAt', 'createdAt', 'title', 'screenCount']).default('updatedAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict();

export const screenListResponseSchema = z
  .object({
    screens: z.array(generatedScreenSummarySchema),
    sessions: z.array(promptSessionSummarySchema).default([]),
    total: z.number().int().min(0).default(0),
  })
  .strict();

export type ScreenListQuery = z.infer<typeof screenListQuerySchema>;

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

export const screenConversationResponseSchema = z
  .object({
    session: promptSessionSchema,
    activeScreenJsonId: z.string().uuid().nullable(),
    activeVersion: z.number().int().min(1).nullable(),
    screenJsons: z.array(screenJsonSchema),
    messages: z.array(promptSessionMessageSchema),
  })
  .strict();

export const screenJsonResponseSchema = z
  .object({
    screenJson: screenJsonSchema,
    schemaJson: z.string().min(1),
  })
  .strict();

export const screenCheckpointRestoreResponseSchema = z
  .object({
    screen: generatedScreenSchema,
    conversation: screenConversationResponseSchema,
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
export type ScreenJson = z.infer<typeof screenJsonSchema>;
export type PromptSessionMessage = z.infer<typeof promptSessionMessageSchema>;
export type GeneratedScreenSummary = z.infer<typeof generatedScreenSummarySchema>;
export type PromptSessionSummary = z.infer<typeof promptSessionSummarySchema>;
export type ScreenGenerateRequest = z.infer<typeof screenGenerateRequestSchema>;
export type ScreenActionGenerateRequest = z.infer<typeof screenActionGenerateRequestSchema>;
export type ScreenRegenerateRequest = z.infer<typeof screenRegenerateRequestSchema>;
export type ScreenEditRequest = z.infer<typeof screenEditRequestSchema>;
export type ScreenListResponse = z.infer<typeof screenListResponseSchema>;
export type ScreenResponse = z.infer<typeof screenResponseSchema>;
export type ScreenChildrenResponse = z.infer<typeof screenChildrenResponseSchema>;
export type ScreenConversationResponse = z.infer<typeof screenConversationResponseSchema>;
export type ScreenJsonResponse = z.infer<typeof screenJsonResponseSchema>;
export type ScreenCheckpointRestoreResponse = z.infer<typeof screenCheckpointRestoreResponseSchema>;
export type ScreenDeleteResponse = z.infer<typeof screenDeleteResponseSchema>;
