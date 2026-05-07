import type { DataBinding, DataBindingDraft } from '../../../shared/schemas/data-binding.schema';
import type {
  DatabaseDesignConversationResponse,
  DatabaseDesignEditRequest,
  DatabaseDesignProposeRequest,
  DatabaseDesignResponse,
  DatabaseDesignTrigger,
  DatabaseSchemaJsonResponse,
  SandboxMigrationPreview,
  SandboxMigrationRun,
} from '../../../shared/schemas/database-design.schema';
import type { AppUiSchema } from '../../../shared/schemas/ui-schema.schema';
import { appUiSchemaSchema } from '../../../shared/schemas/ui-schema.schema';
import { NotFoundError } from '../../lib/errors';
import {
  createDefaultDatabaseDesignProvider,
  type DatabaseDesignProvider,
} from './database-design.provider';
import {
  type DatabaseDesignMessageRecord,
  type DatabaseDesignRepository,
  type DatabaseDesignSessionRecord,
  type DatabaseSchemaJsonRecord,
  databaseDesignRepository,
  type SandboxMigrationRunRecord,
} from './database-design.repository';
import {
  validateDataBindingsForDatabaseSchema,
  validateDatabaseSchemaJson,
} from './database-schema-validator.service';
import {
  createSandboxMigrationService,
  type SandboxMigrationService,
} from './sandbox-migration.service';

const checkpointLabel = 'このバージョンへ戻る';

function dateIso(value: Date) {
  return value.toISOString();
}

function titleFromPrompt(prompt: string) {
  const compact = prompt.trim();
  if (compact.length <= 80) return compact;
  return `${compact.slice(0, 77)}...`;
}

function mapSession(row: DatabaseDesignSessionRecord) {
  return {
    id: row.id,
    title: row.title,
    createdBy: row.createdBy,
    activeDatabaseSchemaJsonId: row.activeDatabaseSchemaJsonId ?? null,
    activeScreenJsonId: row.activeScreenJsonId ?? null,
    createdAt: dateIso(row.createdAt),
    updatedAt: dateIso(row.updatedAt),
  };
}

function mapSchemaJson(row: DatabaseSchemaJsonRecord) {
  return {
    id: row.id,
    designSessionId: row.designSessionId,
    version: row.version,
    prompt: row.prompt,
    trigger: row.trigger as DatabaseDesignTrigger,
    schema: row.schema,
    diffSummary: row.diffSummary,
    providerMeta: row.providerMeta,
    createdAt: dateIso(row.createdAt),
    updatedAt: dateIso(row.updatedAt),
  };
}

function mapMessage(row: DatabaseDesignMessageRecord) {
  return {
    id: row.id,
    designSessionId: row.designSessionId,
    databaseSchemaJsonId: row.databaseSchemaJsonId ?? null,
    screenJsonId: row.screenJsonId ?? null,
    role: row.role as 'user' | 'assistant',
    content: row.content,
    metadata: row.metadata ?? {},
    createdAt: dateIso(row.createdAt),
    updatedAt: dateIso(row.updatedAt),
  };
}

function mapMigrationRun(row: SandboxMigrationRunRecord): SandboxMigrationRun {
  return {
    id: row.id,
    databaseSchemaJsonId: row.databaseSchemaJsonId,
    status: row.status as SandboxMigrationRun['status'],
    fromVersion: row.fromVersion ?? null,
    toVersion: row.toVersion,
    sql: row.sql,
    checksum: row.checksum,
    appliedAt: row.appliedAt ? dateIso(row.appliedAt) : null,
    errorMessage: row.errorMessage ?? null,
    createdAt: dateIso(row.createdAt),
    updatedAt: dateIso(row.updatedAt),
  };
}

function persistedDataBindings(
  drafts: DataBindingDraft[],
  schemaRecord: DatabaseSchemaJsonRecord
): DataBinding[] {
  return drafts.map((binding) => ({
    ...binding,
    databaseSchemaJsonId: schemaRecord.id,
    databaseSchemaVersion: schemaRecord.version,
  }));
}

function diffSummary(
  previous: DatabaseSchemaJsonRecord | null,
  next: DatabaseSchemaJsonRecord['schema']
) {
  const previousTables = new Set(previous?.schema.tables.map((table) => table.name) ?? []);
  const nextTables = new Set(next.tables.map((table) => table.name));
  return {
    addedTables: [...nextTables].filter((table) => !previousTables.has(table)),
    changedTables: [...nextTables].filter((table) => previousTables.has(table)),
    removedTables: [...previousTables].filter((table) => !nextTables.has(table)),
    destructive: [...previousTables].some((table) => !nextTables.has(table)),
  };
}

export function createDatabaseDesignService(
  repo: DatabaseDesignRepository,
  provider: DatabaseDesignProvider,
  migrationService: SandboxMigrationService
) {
  const conversation = async (
    userId: string,
    designSessionId: string
  ): Promise<DatabaseDesignConversationResponse> => {
    const session = await repo.findDesignSessionById(userId, designSessionId);
    if (!session) throw new NotFoundError('Database design session not found');
    const schemaJsons = await repo.listSchemaJsons(designSessionId);
    const messages = await repo.listDesignMessages(designSessionId);
    const screen = session.activeScreenJsonId
      ? await repo.findScreenJsonById(userId, session.activeScreenJsonId)
      : null;
    return {
      session: mapSession(session),
      activeDatabaseSchemaJsonId: session.activeDatabaseSchemaJsonId ?? null,
      activeScreenJsonId: session.activeScreenJsonId ?? null,
      databaseSchemaJsons: schemaJsons.map(mapSchemaJson),
      messages: messages.map(mapMessage),
      dataBindings: screen?.screenJson.dataBindings ?? [],
    };
  };

  const persistBoundScreen = async ({
    dataBindings,
    prompt,
    schema,
    schemaRecord,
    screenJsonId,
    userId,
  }: {
    dataBindings: DataBinding[];
    prompt: string;
    schema?: AppUiSchema;
    schemaRecord: DatabaseSchemaJsonRecord;
    screenJsonId?: string;
    userId: string;
  }) => {
    if (!screenJsonId || !schema) return null;
    const current = await repo.findScreenJsonById(userId, screenJsonId);
    if (!current) throw new NotFoundError('ScreenJSON not found');
    const version = await repo.nextScreenJsonVersion(current.screenJson.sessionId);
    const next = await repo.createScreenJson({
      action: current.screenJson.action ?? null,
      contextSnapshot: current.screenJson.contextSnapshot,
      databaseSchemaJsonId: schemaRecord.id,
      dataBindings,
      inferredIntent: schema.intent,
      prompt,
      providerMeta: current.screenJson.providerMeta,
      schema,
      sessionId: current.screenJson.sessionId,
      trigger: 'chat-edit',
      version,
    });
    await repo.updatePromptSessionActiveScreenJson(current.screenJson.sessionId, next.id);
    return next;
  };

  const propose = async (
    userId: string,
    input: DatabaseDesignProposeRequest
  ): Promise<DatabaseDesignResponse> => {
    const session = input.designSessionId
      ? await repo.findDesignSessionById(userId, input.designSessionId)
      : await repo.createDesignSession({
          activeDatabaseSchemaJsonId: null,
          activeScreenJsonId: input.screenJsonId ?? null,
          createdBy: userId,
          title: titleFromPrompt(input.prompt),
        });
    if (!session) throw new NotFoundError('Database design session not found');

    const screenRow = input.screenJsonId
      ? await repo.findScreenJsonById(userId, input.screenJsonId)
      : null;
    if (input.screenJsonId && !screenRow) throw new NotFoundError('ScreenJSON not found');

    const previous = await repo.latestSchemaJsonForSession(session.id);
    const generated = await provider.propose({
      currentDatabaseSchema: previous?.schema ?? null,
      currentScreen: screenRow?.screenJson.schema ?? null,
      prompt: input.prompt,
      source: input.source,
    });
    const databaseSchema = validateDatabaseSchemaJson(generated.draft.databaseSchema);
    const draftBindings = validateDataBindingsForDatabaseSchema(
      databaseSchema,
      generated.draft.dataBindings
    );
    const version = await repo.nextSchemaVersion(session.id);
    const schemaRecord = await repo.createSchemaJson({
      designSessionId: session.id,
      diffSummary: diffSummary(previous, databaseSchema),
      prompt: input.prompt,
      providerMeta: generated.providerMeta,
      schema: databaseSchema,
      trigger: input.source === 'screen' ? 'screen-proposal' : 'dbdesign-proposal',
      version,
    });
    const dataBindings = persistedDataBindings(draftBindings, schemaRecord);
    const persistedScreen = await persistBoundScreen({
      dataBindings,
      prompt: input.prompt,
      schema: generated.draft.screen ? appUiSchemaSchema.parse(generated.draft.screen) : undefined,
      schemaRecord,
      screenJsonId: input.screenJsonId,
      userId,
    });
    const updatedSession = await repo.updateDesignSessionActive(session.id, {
      activeDatabaseSchemaJsonId: schemaRecord.id,
      activeScreenJsonId:
        persistedScreen?.id ?? input.screenJsonId ?? session.activeScreenJsonId ?? null,
    });
    await repo.createMessages([
      {
        content: input.prompt,
        databaseSchemaJsonId: schemaRecord.id,
        designSessionId: session.id,
        metadata: {},
        role: 'user',
        screenJsonId: persistedScreen?.id ?? input.screenJsonId ?? null,
      },
      {
        content: `${databaseSchema.label} のテーブル定義案 v${schemaRecord.version} を保存しました。`,
        databaseSchemaJsonId: schemaRecord.id,
        designSessionId: session.id,
        metadata: {
          checkpointDatabaseSchemaJsonId: schemaRecord.id,
          checkpointLabel,
          checkpointScreenJsonId: persistedScreen?.id,
          databaseSchemaVersion: schemaRecord.version,
          screenVersion: persistedScreen?.version,
          trigger: input.source === 'screen' ? 'screen-proposal' : 'dbdesign-proposal',
        },
        role: 'assistant',
        screenJsonId: persistedScreen?.id ?? input.screenJsonId ?? null,
      },
    ]);

    return {
      session: mapSession(updatedSession),
      databaseSchemaJson: mapSchemaJson(schemaRecord),
      screen: generated.draft.screen,
      screenJsonId: persistedScreen?.id ?? input.screenJsonId ?? null,
      dataBindings,
      activities: generated.activities,
      migrationPreview: await migrationService.preview(schemaRecord),
      conversation: await conversation(userId, session.id),
    };
  };

  return {
    applyMigration: async (userId: string, databaseSchemaJsonId: string) => {
      const found = await repo.findSchemaJsonById(userId, databaseSchemaJsonId);
      if (!found) throw new NotFoundError('DatabaseSchemaJSON not found');
      return mapMigrationRun(await migrationService.apply(found.databaseSchemaJson));
    },
    conversation,
    edit: async (
      userId: string,
      designSessionId: string,
      input: DatabaseDesignEditRequest
    ): Promise<DatabaseDesignResponse> =>
      propose(userId, {
        designSessionId,
        prompt: input.prompt,
        source: 'dbdesign',
      }),
    migrationPreview: async (
      userId: string,
      databaseSchemaJsonId: string
    ): Promise<SandboxMigrationPreview> => {
      const found = await repo.findSchemaJsonById(userId, databaseSchemaJsonId);
      if (!found) throw new NotFoundError('DatabaseSchemaJSON not found');
      return migrationService.preview(found.databaseSchemaJson);
    },
    propose,
    resetSandbox: async (input: { confirmation: string }) => migrationService.reset(input),
    restoreCheckpoint: async (
      userId: string,
      designSessionId: string,
      databaseSchemaJsonId?: string,
      screenJsonId?: string
    ): Promise<DatabaseDesignConversationResponse> => {
      const session = await repo.findDesignSessionById(userId, designSessionId);
      if (!session) throw new NotFoundError('Database design session not found');
      if (databaseSchemaJsonId) {
        const schema = await repo.findSchemaJsonById(userId, databaseSchemaJsonId);
        if (!schema || schema.databaseSchemaJson.designSessionId !== designSessionId) {
          throw new NotFoundError('DatabaseSchemaJSON checkpoint not found');
        }
      }
      if (screenJsonId) {
        const screen = await repo.findScreenJsonById(userId, screenJsonId);
        if (!screen) throw new NotFoundError('ScreenJSON checkpoint not found');
      }
      await repo.updateDesignSessionActive(designSessionId, {
        activeDatabaseSchemaJsonId: databaseSchemaJsonId ?? session.activeDatabaseSchemaJsonId,
        activeScreenJsonId: screenJsonId ?? session.activeScreenJsonId,
      });
      return conversation(userId, designSessionId);
    },
    schemaJson: async (
      userId: string,
      databaseSchemaJsonId: string
    ): Promise<DatabaseSchemaJsonResponse> => {
      const found = await repo.findSchemaJsonById(userId, databaseSchemaJsonId);
      if (!found) throw new NotFoundError('DatabaseSchemaJSON not found');
      const databaseSchemaJson = mapSchemaJson(found.databaseSchemaJson);
      return {
        databaseSchemaJson,
        schemaJson: JSON.stringify(databaseSchemaJson.schema),
      };
    },
  };
}

export const databaseDesignService = createDatabaseDesignService(
  databaseDesignRepository,
  createDefaultDatabaseDesignProvider(),
  createSandboxMigrationService(databaseDesignRepository)
);
