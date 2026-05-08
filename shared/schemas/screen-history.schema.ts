import { z } from 'zod';
import { aiActivitySchema, aiSourceContextSchema } from './ai.schema';
import { dataBindingSchema } from './data-binding.schema';
import { appActionSchema, appRelativePathSchema, appUiSchemaSchema } from './ui-schema.schema';

export const screenTriggerSchema = z.enum([
  'initial-prompt',
  'action-click',
  'regenerate',
  'chat-edit',
]);
export const promptSessionVisibilitySchema = z.enum(['private', 'public']);
export const canonicalPromptPathSchema = appRelativePathSchema.nullable().default(null);

export const screenProviderMetaSchema = z
  .object({
    provider: z.enum(['openai', 'azure-openai', 'anthropic', 'google-ai', 'mock']).default('mock'),
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
    visibility: promptSessionVisibilitySchema.default('private'),
    publishedAt: z.string().datetime().nullable().default(null),
    projectId: z.string().uuid().nullable().default(null),
    pagePath: z.string().min(1).nullable().default(null),
    canonicalPath: canonicalPromptPathSchema,
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
    projectId: z.string().uuid().nullable().default(null),
    pagePath: z.string().min(1).nullable().default(null),
    canonicalPath: canonicalPromptPathSchema,
    parentScreenId: z.string().uuid().nullable().optional(),
    version: z.number().int().min(1).default(1),
    trigger: screenTriggerSchema,
    prompt: z.string().min(1),
    inferredIntent: z.string(),
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
    projectId: z.string().uuid().nullable().default(null),
    pagePath: z.string().min(1).nullable().default(null),
    canonicalPath: canonicalPromptPathSchema,
    version: z.number().int().min(1),
    prompt: z.string().min(1),
    trigger: screenTriggerSchema,
    inferredIntent: z.string(),
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

export const screenActionLinkSchema = z
  .object({
    id: z.string().uuid(),
    sourceSessionId: z.string().uuid(),
    actionId: z.string().min(1),
    targetSessionId: z.string().uuid().nullable(),
    targetPath: appRelativePathSchema.nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const screenCheckpointSchema = screenJsonSchema
  .pick({
    id: true,
    sessionId: true,
    projectId: true,
    pagePath: true,
    canonicalPath: true,
    version: true,
    prompt: true,
    trigger: true,
    inferredIntent: true,
    action: true,
    databaseSchemaJsonId: true,
    dataBindings: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    page: z.string().min(1),
  })
  .strict();

export const generatedScreenSummarySchema = generatedScreenSchema
  .pick({
    id: true,
    sessionId: true,
    projectId: true,
    pagePath: true,
    canonicalPath: true,
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
    visibility: promptSessionVisibilitySchema.default('private'),
    publishedAt: z.string().datetime().nullable().default(null),
    projectId: z.string().uuid().nullable().default(null),
    pagePath: z.string().min(1).nullable().default(null),
    canonicalPath: canonicalPromptPathSchema,
    page: z.string().min(1).nullable(),
    prompt: z.string().min(1).nullable(),
    inferredIntent: z.string().nullable(),
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

export const screenActionLinkUpsertRequestSchema = z
  .object({
    targetSessionId: z.string().uuid().nullable().optional(),
    targetPath: appRelativePathSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => Boolean(value.targetSessionId) !== Boolean(value.targetPath), {
    message: 'targetSessionId or targetPath is required',
  });

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

export const screenJsonSaveRequestSchema = z
  .object({
    schema: appUiSchemaSchema,
    prompt: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();

export const promptSessionVisibilityUpdateRequestSchema = z
  .object({
    visibility: promptSessionVisibilitySchema,
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
    activeScreenJson: screenJsonSchema.nullable().default(null),
    checkpoints: z.array(screenCheckpointSchema).default([]),
    screenJsons: z.array(screenJsonSchema).default([]),
    actionLinks: z.array(screenActionLinkSchema).default([]),
    messages: z.array(promptSessionMessageSchema),
  })
  .strict();

export const screenProjectPageResponseSchema = z
  .object({
    projectId: z.string().uuid(),
    pagePath: z.string().min(1),
    sessionId: z.string().uuid(),
    canonicalPath: appRelativePathSchema,
    session: promptSessionSchema,
  })
  .strict();

export const screenActionLinkResponseSchema = z
  .object({
    link: screenActionLinkSchema,
  })
  .strict();

export const promptSessionVisibilityResponseSchema = z
  .object({
    session: promptSessionSchema,
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

export const screenActionLinkDeleteResponseSchema = z.object({ success: z.boolean() }).strict();

export type ScreenTrigger = z.infer<typeof screenTriggerSchema>;
export type PromptSessionVisibility = z.infer<typeof promptSessionVisibilitySchema>;
export type CanonicalPromptPath = z.infer<typeof canonicalPromptPathSchema>;
export type PromptSession = z.infer<typeof promptSessionSchema>;
export type GeneratedScreen = z.infer<typeof generatedScreenSchema>;
export type ScreenJson = z.infer<typeof screenJsonSchema>;
export type PromptSessionMessage = z.infer<typeof promptSessionMessageSchema>;
export type ScreenActionLink = z.infer<typeof screenActionLinkSchema>;
export type ScreenCheckpoint = z.infer<typeof screenCheckpointSchema>;
export type GeneratedScreenSummary = z.infer<typeof generatedScreenSummarySchema>;
export type PromptSessionSummary = z.infer<typeof promptSessionSummarySchema>;
export type ScreenGenerateRequest = z.infer<typeof screenGenerateRequestSchema>;
export type ScreenActionGenerateRequest = z.infer<typeof screenActionGenerateRequestSchema>;
export type ScreenActionLinkUpsertRequest = z.infer<typeof screenActionLinkUpsertRequestSchema>;
export type ScreenRegenerateRequest = z.infer<typeof screenRegenerateRequestSchema>;
export type ScreenEditRequest = z.infer<typeof screenEditRequestSchema>;
export type ScreenJsonSaveRequest = z.infer<typeof screenJsonSaveRequestSchema>;
export type PromptSessionVisibilityUpdateRequest = z.infer<
  typeof promptSessionVisibilityUpdateRequestSchema
>;
export type ScreenListResponse = z.infer<typeof screenListResponseSchema>;
export type ScreenResponse = z.infer<typeof screenResponseSchema>;
export type ScreenChildrenResponse = z.infer<typeof screenChildrenResponseSchema>;
export type ScreenConversationResponse = z.infer<typeof screenConversationResponseSchema>;
export type ScreenProjectPageResponse = z.infer<typeof screenProjectPageResponseSchema>;
export type ScreenActionLinkResponse = z.infer<typeof screenActionLinkResponseSchema>;
export type PromptSessionVisibilityResponse = z.infer<typeof promptSessionVisibilityResponseSchema>;
export type ScreenJsonResponse = z.infer<typeof screenJsonResponseSchema>;
export type ScreenCheckpointRestoreResponse = z.infer<typeof screenCheckpointRestoreResponseSchema>;
export type ScreenDeleteResponse = z.infer<typeof screenDeleteResponseSchema>;
export type ScreenActionLinkDeleteResponse = z.infer<typeof screenActionLinkDeleteResponseSchema>;
