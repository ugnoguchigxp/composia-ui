import { z } from 'zod';
import { aiActivitySchema } from './ai.schema';
import { dataBindingDraftSchema, dataBindingSchema } from './data-binding.schema';
import { appUiSchemaSchema } from './ui-schema.schema';

export const databaseIdentifierSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]*$/, 'Use snake_case identifiers starting with a letter');

export const databaseScalarTypeSchema = z.enum([
  'uuid',
  'text',
  'varchar',
  'integer',
  'bigint',
  'numeric',
  'boolean',
  'date',
  'timestamp',
  'jsonb',
  'enum',
]);

export const databaseColumnSchema = z
  .object({
    name: databaseIdentifierSchema,
    label: z.string().min(1),
    type: databaseScalarTypeSchema,
    enumName: databaseIdentifierSchema.optional(),
    enumValues: z.array(z.string().min(1)).optional(),
    nullable: z.boolean().default(false),
    primaryKey: z.boolean().default(false),
    unique: z.boolean().default(false),
    default: z
      .object({
        kind: z.enum(['uuid', 'now', 'literal', 'none']),
        value: z.unknown().optional(),
      })
      .strict()
      .optional(),
    validation: z
      .object({
        minLength: z.number().int().min(0).optional(),
        maxLength: z.number().int().min(1).optional(),
        min: z.number().optional(),
        max: z.number().optional(),
        pattern: z.string().optional(),
        required: z.boolean().default(true),
      })
      .strict()
      .default({ required: true }),
    ui: z
      .object({
        widget: z
          .enum(['text', 'textarea', 'number', 'checkbox', 'select', 'date', 'datetime', 'json'])
          .optional(),
        placeholder: z.string().optional(),
        listVisible: z.boolean().default(true),
        formVisible: z.boolean().default(true),
        filterable: z.boolean().default(false),
        sortable: z.boolean().default(false),
      })
      .strict()
      .default({
        listVisible: true,
        formVisible: true,
        filterable: false,
        sortable: false,
      }),
  })
  .strict();

export const databaseIndexSchema = z
  .object({
    name: databaseIdentifierSchema,
    columns: z.array(databaseIdentifierSchema).min(1),
    unique: z.boolean().default(false),
  })
  .strict();

export const databaseTableSchema = z
  .object({
    name: databaseIdentifierSchema,
    label: z.string().min(1),
    description: z.string().min(1).optional(),
    columns: z.array(databaseColumnSchema).min(1).max(80),
    indexes: z.array(databaseIndexSchema).default([]),
    ui: z
      .object({
        displayField: databaseIdentifierSchema.optional(),
        defaultSortField: databaseIdentifierSchema.optional(),
        defaultSortDirection: z.enum(['asc', 'desc']).default('asc'),
      })
      .strict()
      .default({ defaultSortDirection: 'asc' }),
  })
  .strict();

export const databaseRelationSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('one-to-many'),
      name: databaseIdentifierSchema,
      parentTable: databaseIdentifierSchema,
      childTable: databaseIdentifierSchema,
      foreignKeyColumn: databaseIdentifierSchema,
      parentDisplayField: databaseIdentifierSchema.optional(),
      onDelete: z.enum(['cascade', 'restrict', 'set-null']).default('restrict'),
    })
    .strict(),
  z
    .object({
      kind: z.literal('many-to-many'),
      name: databaseIdentifierSchema,
      leftTable: databaseIdentifierSchema,
      rightTable: databaseIdentifierSchema,
      joinTable: databaseIdentifierSchema,
      leftForeignKeyColumn: databaseIdentifierSchema,
      rightForeignKeyColumn: databaseIdentifierSchema,
      leftDisplayField: databaseIdentifierSchema.optional(),
      rightDisplayField: databaseIdentifierSchema.optional(),
      onDelete: z.enum(['cascade', 'restrict']).default('cascade'),
    })
    .strict(),
]);

export const databaseSchemaJsonSchema = z
  .object({
    name: databaseIdentifierSchema,
    label: z.string().min(1),
    purpose: z.string().min(1),
    tables: z.array(databaseTableSchema).min(1).max(40),
    relations: z.array(databaseRelationSchema).default([]),
    uiHints: z
      .object({
        primaryTables: z.array(databaseIdentifierSchema).default([]),
        defaultNavigation: z.array(databaseIdentifierSchema).default([]),
        suggestedScreens: z
          .array(
            z
              .object({
                name: z.string().min(1),
                table: databaseIdentifierSchema,
                operation: z.enum(['list', 'detail', 'create', 'edit']),
              })
              .strict()
          )
          .default([]),
      })
      .strict()
      .default({
        primaryTables: [],
        defaultNavigation: [],
        suggestedScreens: [],
      }),
  })
  .strict();

export const databaseSchemaDiffSummarySchema = z
  .object({
    addedTables: z.array(databaseIdentifierSchema).default([]),
    changedTables: z.array(databaseIdentifierSchema).default([]),
    removedTables: z.array(databaseIdentifierSchema).default([]),
    destructive: z.boolean().default(false),
  })
  .strict();

export const databaseDesignTriggerSchema = z.enum([
  'initial-prompt',
  'screen-proposal',
  'dbdesign-proposal',
  'db-edit',
  'ui-edit',
  'reset',
]);

export const databaseDesignSessionSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().min(1),
    createdBy: z.string().uuid(),
    activeDatabaseSchemaJsonId: z.string().uuid().nullable().default(null),
    activeScreenJsonId: z.string().uuid().nullable().default(null),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const databaseSchemaJsonRecordSchema = z
  .object({
    id: z.string().uuid(),
    designSessionId: z.string().uuid(),
    version: z.number().int().min(1),
    prompt: z.string().min(1),
    trigger: databaseDesignTriggerSchema,
    schema: databaseSchemaJsonSchema,
    diffSummary: databaseSchemaDiffSummarySchema.default({
      addedTables: [],
      changedTables: [],
      removedTables: [],
      destructive: false,
    }),
    providerMeta: z
      .object({
        provider: z.enum(['openai', 'azure-openai', 'mock']).default('mock'),
        model: z.string().min(1).optional(),
        componentRegistryVersion: z.string().min(1),
      })
      .strict(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const databaseDesignMessageMetadataSchema = z
  .object({
    checkpointLabel: z.string().min(1).optional(),
    checkpointScreenJsonId: z.string().uuid().optional(),
    checkpointDatabaseSchemaJsonId: z.string().uuid().optional(),
    screenVersion: z.number().int().min(1).optional(),
    databaseSchemaVersion: z.number().int().min(1).optional(),
    trigger: databaseDesignTriggerSchema.optional(),
  })
  .catchall(z.unknown());

export const databaseDesignMessageSchema = z
  .object({
    id: z.string().uuid(),
    designSessionId: z.string().uuid(),
    databaseSchemaJsonId: z.string().uuid().nullable().default(null),
    screenJsonId: z.string().uuid().nullable().default(null),
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1),
    metadata: databaseDesignMessageMetadataSchema.default({}),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const databaseDesignProposeRequestSchema = z
  .object({
    prompt: z.string().trim().min(1).max(4000),
    source: z.enum(['screen', 'dbdesign']).default('dbdesign'),
    designSessionId: z.string().uuid().optional(),
    screenJsonId: z.string().uuid().optional(),
  })
  .strict();

export const databaseDesignEditRequestSchema = z
  .object({
    prompt: z.string().trim().min(1).max(4000),
  })
  .strict();

export const databaseDesignDraftResponseSchema = z
  .object({
    screen: appUiSchemaSchema.optional(),
    databaseSchema: databaseSchemaJsonSchema,
    dataBindings: z.array(dataBindingDraftSchema).default([]),
    rationale: z
      .object({
        databaseChanges: z.array(z.string()).default([]),
        uiBindings: z.array(z.string()).default([]),
      })
      .strict()
      .default({ databaseChanges: [], uiBindings: [] }),
  })
  .strict();

export const sandboxMigrationPreviewSchema = z
  .object({
    databaseSchemaJsonId: z.string().uuid(),
    sql: z.string(),
    warnings: z.array(z.string()).default([]),
    destructive: z.boolean().default(false),
    requiresConfirmation: z.boolean().default(false),
  })
  .strict();

export const sandboxMigrationApplyRequestSchema = z
  .object({
    confirmation: z.string().optional(),
  })
  .strict();

export const sandboxResetRequestSchema = z
  .object({
    confirmation: z.string(),
  })
  .strict();

export const sandboxResetResponseSchema = z
  .object({
    success: z.boolean(),
    droppedObjects: z.number().int().min(0),
  })
  .strict();

export const sandboxMigrationRunSchema = z
  .object({
    id: z.string().uuid(),
    databaseSchemaJsonId: z.string().uuid(),
    status: z.enum(['pending', 'applied', 'failed', 'reverted']),
    fromVersion: z.number().int().min(1).nullable().default(null),
    toVersion: z.number().int().min(1),
    sql: z.string(),
    checksum: z.string(),
    appliedAt: z.string().datetime().nullable().default(null),
    errorMessage: z.string().nullable().default(null),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const databaseDesignConversationResponseSchema = z
  .object({
    session: databaseDesignSessionSchema,
    activeDatabaseSchemaJsonId: z.string().uuid().nullable(),
    activeScreenJsonId: z.string().uuid().nullable(),
    databaseSchemaJsons: z.array(databaseSchemaJsonRecordSchema),
    messages: z.array(databaseDesignMessageSchema),
    dataBindings: z.array(dataBindingSchema).default([]),
  })
  .strict();

export const databaseDesignResponseSchema = z
  .object({
    session: databaseDesignSessionSchema,
    databaseSchemaJson: databaseSchemaJsonRecordSchema,
    screen: appUiSchemaSchema.optional(),
    screenJsonId: z.string().uuid().nullable().default(null),
    dataBindings: z.array(dataBindingSchema).default([]),
    activities: z.array(aiActivitySchema).default([]),
    migrationPreview: sandboxMigrationPreviewSchema.optional(),
    conversation: databaseDesignConversationResponseSchema.optional(),
  })
  .strict();

export const databaseSchemaJsonResponseSchema = z
  .object({
    databaseSchemaJson: databaseSchemaJsonRecordSchema,
    schemaJson: z.string().min(1),
  })
  .strict();

export const databaseCheckpointRestoreRequestSchema = z
  .object({
    screenJsonId: z.string().uuid().optional(),
    databaseSchemaJsonId: z.string().uuid().optional(),
  })
  .strict()
  .refine((value) => value.screenJsonId || value.databaseSchemaJsonId, {
    message: 'screenJsonId or databaseSchemaJsonId is required',
  });

export const sandboxStateResponseSchema = z
  .object({
    appliedDatabaseSchemaJsonId: z.string().uuid().nullable(),
    appliedVersion: z.number().int().min(1).nullable(),
    tables: z.array(
      z
        .object({
          name: databaseIdentifierSchema,
          rowCount: z.number().int().min(0),
          managed: z.boolean(),
        })
        .strict()
    ),
  })
  .strict();

export const sandboxRowsResponseSchema = z
  .object({
    table: databaseIdentifierSchema,
    rows: z.array(z.record(z.string(), z.unknown())).default([]),
  })
  .strict();

export const sandboxRelationAttachRequestSchema = z
  .object({
    leftId: z.string().uuid(),
    rightId: z.string().uuid(),
  })
  .strict();

export const sandboxRowResponseSchema = z
  .object({
    table: databaseIdentifierSchema,
    row: z.record(z.string(), z.unknown()),
  })
  .strict();

export const sandboxDeleteResponseSchema = z.object({ success: z.boolean() }).strict();

export type DatabaseScalarType = z.infer<typeof databaseScalarTypeSchema>;
export type DatabaseColumn = z.infer<typeof databaseColumnSchema>;
export type DatabaseIndex = z.infer<typeof databaseIndexSchema>;
export type DatabaseTable = z.infer<typeof databaseTableSchema>;
export type DatabaseRelation = z.infer<typeof databaseRelationSchema>;
export type DatabaseSchemaJson = z.infer<typeof databaseSchemaJsonSchema>;
export type DatabaseSchemaDiffSummary = z.infer<typeof databaseSchemaDiffSummarySchema>;
export type DatabaseDesignTrigger = z.infer<typeof databaseDesignTriggerSchema>;
export type DatabaseDesignSession = z.infer<typeof databaseDesignSessionSchema>;
export type DatabaseSchemaJsonRecord = z.infer<typeof databaseSchemaJsonRecordSchema>;
export type DatabaseDesignMessage = z.infer<typeof databaseDesignMessageSchema>;
export type DatabaseDesignProposeRequest = z.infer<typeof databaseDesignProposeRequestSchema>;
export type DatabaseDesignEditRequest = z.infer<typeof databaseDesignEditRequestSchema>;
export type DatabaseDesignDraftResponse = z.infer<typeof databaseDesignDraftResponseSchema>;
export type SandboxMigrationPreview = z.infer<typeof sandboxMigrationPreviewSchema>;
export type SandboxMigrationRun = z.infer<typeof sandboxMigrationRunSchema>;
export type SandboxResetRequest = z.infer<typeof sandboxResetRequestSchema>;
export type SandboxResetResponse = z.infer<typeof sandboxResetResponseSchema>;
export type DatabaseDesignConversationResponse = z.infer<
  typeof databaseDesignConversationResponseSchema
>;
export type DatabaseDesignResponse = z.infer<typeof databaseDesignResponseSchema>;
export type DatabaseSchemaJsonResponse = z.infer<typeof databaseSchemaJsonResponseSchema>;
export type DatabaseCheckpointRestoreRequest = z.infer<
  typeof databaseCheckpointRestoreRequestSchema
>;
export type SandboxStateResponse = z.infer<typeof sandboxStateResponseSchema>;
export type SandboxRowsResponse = z.infer<typeof sandboxRowsResponseSchema>;
export type SandboxRelationAttachRequest = z.infer<typeof sandboxRelationAttachRequestSchema>;
export type SandboxRowResponse = z.infer<typeof sandboxRowResponseSchema>;
export type SandboxDeleteResponse = z.infer<typeof sandboxDeleteResponseSchema>;
