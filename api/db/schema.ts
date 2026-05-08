import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { DataBinding } from '../../shared/schemas/data-binding.schema';
import type {
  DatabaseDesignMessage,
  DatabaseSchemaDiffSummary,
  DatabaseSchemaJson,
} from '../../shared/schemas/database-design.schema';
import type {
  GeneratedScreen,
  PromptSessionMessage,
  PromptSessionVisibility,
  ScreenJson,
} from '../../shared/schemas/screen-history.schema';
import type { AppUiSchema } from '../../shared/schemas/ui-schema.schema';

const commonColumns = {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdateFn(() => new Date())
    .notNull(),
};

export const users = pgTable('users', {
  ...commonColumns,
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  name: text('name').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
});

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    token: text('token').notNull().unique(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('rt_user_id_idx').on(table.userId),
  })
);

export const userExternalAccounts = pgTable(
  'user_external_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(), // 'google', 'github'
    externalId: text('external_id').notNull(),
    email: text('email'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    providerExternalIdUniqueIdx: uniqueIndex('uex_provider_ext_uidx').on(
      table.provider,
      table.externalId
    ),
    userIdIdx: index('uex_user_id_idx').on(table.userId),
  })
);

export const sourceDefinitions = pgTable(
  'source_definitions',
  {
    ...commonColumns,
    kind: text('kind').notNull(),
    label: text('label').notNull(),
    url: text('url'),
    entityType: text('entity_type').notNull(),
    settings: jsonb('settings').$type<Record<string, unknown>>(),
    enabled: boolean('enabled').default(true).notNull(),
  },
  (table) => ({
    kindIdx: index('src_kind_idx').on(table.kind),
    labelUniqueIdx: uniqueIndex('src_label_uidx').on(table.label),
  })
);

export const normalizedEntities = pgTable(
  'normalized_entities',
  {
    ...commonColumns,
    sourceDefinitionId: uuid('source_definition_id')
      .notNull()
      .references(() => sourceDefinitions.id, { onDelete: 'cascade' }),
    source: text('source').notNull(),
    entityType: text('entity_type').notNull(),
    externalId: text('external_id').notNull(),
    title: text('title'),
    body: text('body'),
    summary: text('summary'),
    url: text('url'),
    author: text('author'),
    tags: jsonb('tags').$type<string[]>(),
    status: text('status'),
    publishedAt: timestamp('published_at'),
    sourceUpdatedAt: timestamp('source_updated_at'),
    raw: jsonb('raw').notNull(),
  },
  (table) => ({
    sourceDefinitionIdx: index('ne_source_definition_idx').on(table.sourceDefinitionId),
    sourceDefinitionPublishedIdx: index('ne_source_definition_published_idx').on(
      table.sourceDefinitionId,
      table.publishedAt,
      table.createdAt
    ),
    entityTypeIdx: index('ne_entity_type_idx').on(table.entityType),
    sourceExternalUniqueIdx: uniqueIndex('ne_source_external_uidx').on(
      table.sourceDefinitionId,
      table.externalId
    ),
  })
);

export const cacheEntries = pgTable(
  'cache_entries',
  {
    ...commonColumns,
    namespace: text('namespace').notNull(),
    key: text('key').notNull(),
    value: jsonb('value').notNull(),
    expiresAt: timestamp('expires_at'),
  },
  (table) => ({
    namespaceIdx: index('cache_namespace_idx').on(table.namespace),
    namespaceKeyUniqueIdx: uniqueIndex('cache_namespace_key_uidx').on(table.namespace, table.key),
  })
);

export const promptSessions = pgTable(
  'prompt_sessions',
  {
    ...commonColumns,
    title: text('title').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    activeScreenJsonId: uuid('active_screen_json_id'),
    visibility: text('visibility').$type<PromptSessionVisibility>().notNull().default('private'),
    publishedAt: timestamp('published_at'),
    projectId: uuid('project_id').references((): AnyPgColumn => uiProjects.id, {
      onDelete: 'cascade',
    }),
    pagePath: text('page_path'),
  },
  (table) => ({
    createdByIdx: index('prompt_sessions_created_by_idx').on(table.createdBy),
    projectIdx: index('prompt_sessions_project_idx').on(table.projectId),
    projectPageUniqueIdx: uniqueIndex('prompt_sessions_project_page_uidx')
      .on(table.projectId, table.pagePath)
      .where(sql`${table.projectId} is not null and ${table.pagePath} is not null`),
  })
);

export const uiProjects = pgTable(
  'ui_projects',
  {
    ...commonColumns,
    title: text('title').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rootSessionId: uuid('root_session_id').references((): AnyPgColumn => promptSessions.id, {
      onDelete: 'set null',
    }),
  },
  (table) => ({
    createdByIdx: index('ui_projects_created_by_idx').on(table.createdBy),
  })
);

export const screenActionLinks = pgTable(
  'screen_action_links',
  {
    ...commonColumns,
    sourceSessionId: uuid('source_session_id')
      .notNull()
      .references(() => promptSessions.id, { onDelete: 'cascade' }),
    actionId: text('action_id').notNull(),
    targetSessionId: uuid('target_session_id').references(() => promptSessions.id, {
      onDelete: 'set null',
    }),
    targetPath: text('target_path'),
  },
  (table) => ({
    sourceActionUniqueIdx: uniqueIndex('screen_action_links_source_action_uidx').on(
      table.sourceSessionId,
      table.actionId
    ),
    sourceSessionIdx: index('screen_action_links_source_session_idx').on(table.sourceSessionId),
    targetSessionIdx: index('screen_action_links_target_session_idx').on(table.targetSessionId),
  })
);

export const databaseDesignSessions = pgTable(
  'database_design_sessions',
  {
    ...commonColumns,
    title: text('title').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    activeDatabaseSchemaJsonId: uuid('active_database_schema_json_id'),
    activeScreenJsonId: uuid('active_screen_json_id'),
  },
  (table) => ({
    createdByIdx: index('database_design_sessions_created_by_idx').on(table.createdBy),
  })
);

export const databaseSchemaJsons = pgTable(
  'database_schema_jsons',
  {
    ...commonColumns,
    designSessionId: uuid('design_session_id')
      .notNull()
      .references(() => databaseDesignSessions.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    prompt: text('prompt').notNull(),
    trigger: text('trigger').notNull(),
    schema: jsonb('schema').$type<DatabaseSchemaJson>().notNull(),
    dataBindings: jsonb('data_bindings').$type<DataBinding[]>().notNull().default([]),
    diffSummary: jsonb('diff_summary').$type<DatabaseSchemaDiffSummary>().notNull().default({
      addedTables: [],
      changedTables: [],
      removedTables: [],
      destructive: false,
    }),
    providerMeta: jsonb('provider_meta')
      .$type<{
        provider: 'openai' | 'azure-openai' | 'mock';
        model?: string;
        componentRegistryVersion: string;
      }>()
      .notNull(),
  },
  (table) => ({
    designSessionIdx: index('database_schema_jsons_design_session_idx').on(table.designSessionId),
    designSessionVersionUniqueIdx: uniqueIndex('database_schema_jsons_session_version_uidx').on(
      table.designSessionId,
      table.version
    ),
  })
);

export const screenJsons = pgTable(
  'screen_jsons',
  {
    ...commonColumns,
    sessionId: uuid('session_id')
      .notNull()
      .references(() => promptSessions.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    prompt: text('prompt').notNull(),
    trigger: text('trigger').notNull(),
    inferredIntent: text('inferred_intent').notNull(),
    action: jsonb('action').$type<ScreenJson['action']>(),
    schema: jsonb('schema').$type<AppUiSchema>().notNull(),
    databaseSchemaJsonId: uuid('database_schema_json_id').references(() => databaseSchemaJsons.id, {
      onDelete: 'set null',
    }),
    dataBindings: jsonb('data_bindings').$type<DataBinding[]>().notNull().default([]),
    contextSnapshot: jsonb('context_snapshot').$type<ScreenJson['contextSnapshot']>().notNull(),
    providerMeta: jsonb('provider_meta').$type<ScreenJson['providerMeta']>().notNull(),
  },
  (table) => ({
    databaseSchemaJsonIdx: index('screen_jsons_database_schema_json_idx').on(
      table.databaseSchemaJsonId
    ),
    databaseSchemaJsonVersionIdx: index('screen_jsons_database_schema_json_version_idx').on(
      table.databaseSchemaJsonId,
      table.version,
      table.createdAt
    ),
    sessionIdx: index('screen_jsons_session_idx').on(table.sessionId),
    sessionCreatedAtIdx: index('screen_jsons_session_created_at_idx').on(
      table.sessionId,
      table.createdAt
    ),
    sessionVersionUniqueIdx: uniqueIndex('screen_jsons_session_version_uidx').on(
      table.sessionId,
      table.version
    ),
  })
);

export const publishedPromptPages = pgTable(
  'published_prompt_pages',
  {
    ...commonColumns,
    sessionId: uuid('session_id')
      .notNull()
      .references(() => promptSessions.id, { onDelete: 'cascade' }),
    screenJsonId: uuid('screen_json_id')
      .notNull()
      .references(() => screenJsons.id, { onDelete: 'cascade' }),
    html: text('html').notNull(),
  },
  (table) => ({
    screenJsonIdx: index('published_prompt_pages_screen_json_idx').on(table.screenJsonId),
    sessionUniqueIdx: uniqueIndex('published_prompt_pages_session_uidx').on(table.sessionId),
  })
);

export const databaseDesignMessages = pgTable(
  'database_design_messages',
  {
    ...commonColumns,
    designSessionId: uuid('design_session_id')
      .notNull()
      .references(() => databaseDesignSessions.id, { onDelete: 'cascade' }),
    databaseSchemaJsonId: uuid('database_schema_json_id').references(() => databaseSchemaJsons.id, {
      onDelete: 'cascade',
    }),
    screenJsonId: uuid('screen_json_id').references(() => screenJsons.id, {
      onDelete: 'cascade',
    }),
    role: text('role').notNull(),
    content: text('content').notNull(),
    metadata: jsonb('metadata').$type<DatabaseDesignMessage['metadata']>().notNull().default({}),
  },
  (table) => ({
    createdAtIdx: index('database_design_messages_created_at_idx').on(table.createdAt),
    databaseSchemaJsonIdx: index('database_design_messages_database_schema_json_idx').on(
      table.databaseSchemaJsonId
    ),
    databaseSchemaJsonCreatedAtIdx: index(
      'database_design_messages_database_schema_json_created_at_idx'
    ).on(table.databaseSchemaJsonId, table.createdAt),
    designSessionIdx: index('database_design_messages_design_session_idx').on(
      table.designSessionId
    ),
    designSessionCreatedAtIdx: index('database_design_messages_design_session_created_at_idx').on(
      table.designSessionId,
      table.createdAt
    ),
    screenJsonIdx: index('database_design_messages_screen_json_idx').on(table.screenJsonId),
  })
);

export const sandboxMigrationRuns = pgTable(
  'sandbox_migration_runs',
  {
    ...commonColumns,
    databaseSchemaJsonId: uuid('database_schema_json_id')
      .notNull()
      .references(() => databaseSchemaJsons.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    fromVersion: integer('from_version'),
    toVersion: integer('to_version').notNull(),
    sql: text('sql').notNull(),
    checksum: text('checksum').notNull(),
    appliedAt: timestamp('applied_at'),
    errorMessage: text('error_message'),
  },
  (table) => ({
    checksumIdx: index('sandbox_migration_runs_checksum_idx').on(table.checksum),
    databaseSchemaJsonIdx: index('sandbox_migration_runs_database_schema_json_idx').on(
      table.databaseSchemaJsonId
    ),
    databaseSchemaJsonAppliedAtIdx: index(
      'sandbox_migration_runs_database_schema_json_applied_at_idx'
    ).on(table.databaseSchemaJsonId, table.appliedAt, table.createdAt),
    statusAppliedAtIdx: index('sandbox_migration_runs_status_applied_at_idx').on(
      table.status,
      table.appliedAt,
      table.createdAt
    ),
  })
);

export const sandboxManagedObjects = pgTable(
  'sandbox_managed_objects',
  {
    ...commonColumns,
    databaseSchemaJsonId: uuid('database_schema_json_id').references(() => databaseSchemaJsons.id, {
      onDelete: 'set null',
    }),
    migrationRunId: uuid('migration_run_id').references(() => sandboxMigrationRuns.id, {
      onDelete: 'set null',
    }),
    objectType: text('object_type').notNull(),
    objectKey: text('object_key').notNull(),
    objectName: text('object_name').notNull(),
    parentObjectName: text('parent_object_name'),
    status: text('status').notNull(),
  },
  (table) => ({
    databaseSchemaJsonIdx: index('sandbox_managed_objects_database_schema_json_idx').on(
      table.databaseSchemaJsonId
    ),
    migrationRunIdx: index('sandbox_managed_objects_migration_run_idx').on(table.migrationRunId),
    objectKeyUniqueIdx: uniqueIndex('sandbox_managed_objects_object_key_uidx').on(table.objectKey),
    objectNameIdx: index('sandbox_managed_objects_object_name_idx').on(table.objectName),
  })
);

export const promptSessionMessages = pgTable(
  'prompt_session_messages',
  {
    ...commonColumns,
    sessionId: uuid('session_id')
      .notNull()
      .references(() => promptSessions.id, { onDelete: 'cascade' }),
    screenJsonId: uuid('screen_json_id')
      .notNull()
      .references(() => screenJsons.id, {
        onDelete: 'cascade',
      }),
    role: text('role').notNull(),
    content: text('content').notNull(),
    metadata: jsonb('metadata').$type<PromptSessionMessage['metadata']>().notNull().default({}),
  },
  (table) => ({
    createdAtIdx: index('prompt_session_messages_created_at_idx').on(table.createdAt),
    screenJsonIdx: index('prompt_session_messages_screen_json_idx').on(table.screenJsonId),
    sessionIdx: index('prompt_session_messages_session_idx').on(table.sessionId),
    sessionCreatedAtIdx: index('prompt_session_messages_session_created_at_idx').on(
      table.sessionId,
      table.createdAt
    ),
  })
);

export const generatedScreens = pgTable(
  'generated_screens',
  {
    ...commonColumns,
    sessionId: uuid('session_id')
      .notNull()
      .references(() => promptSessions.id, { onDelete: 'cascade' }),
    parentScreenId: uuid('parent_screen_id'),
    trigger: text('trigger').notNull(),
    prompt: text('prompt').notNull(),
    inferredIntent: text('inferred_intent').notNull(),
    action: jsonb('action').$type<GeneratedScreen['action']>(),
    schema: jsonb('schema').$type<AppUiSchema>().notNull(),
    contextSnapshot: jsonb('context_snapshot')
      .$type<GeneratedScreen['contextSnapshot']>()
      .notNull(),
    providerMeta: jsonb('provider_meta').$type<GeneratedScreen['providerMeta']>().notNull(),
  },
  (table) => ({
    parentScreenIdx: index('generated_screens_parent_idx').on(table.parentScreenId),
    sessionIdx: index('generated_screens_session_idx').on(table.sessionId),
    sessionCreatedAtIdx: index('generated_screens_session_created_at_idx').on(
      table.sessionId,
      table.createdAt
    ),
  })
);
