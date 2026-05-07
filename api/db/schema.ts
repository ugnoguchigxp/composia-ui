import {
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
import type {
  GeneratedScreen,
  PromptSessionMessage,
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
  },
  (table) => ({
    createdByIdx: index('prompt_sessions_created_by_idx').on(table.createdBy),
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
    contextSnapshot: jsonb('context_snapshot').$type<ScreenJson['contextSnapshot']>().notNull(),
    providerMeta: jsonb('provider_meta').$type<ScreenJson['providerMeta']>().notNull(),
  },
  (table) => ({
    sessionIdx: index('screen_jsons_session_idx').on(table.sessionId),
    sessionVersionUniqueIdx: uniqueIndex('screen_jsons_session_version_uidx').on(
      table.sessionId,
      table.version
    ),
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
  })
);
