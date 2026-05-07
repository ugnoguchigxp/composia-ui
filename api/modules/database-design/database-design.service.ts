import { randomUUID } from 'node:crypto';
import type { DataBinding, DataBindingDraft } from '../../../shared/schemas/data-binding.schema';
import type {
  DatabaseDesignConversationResponse,
  DatabaseDesignEditRequest,
  DatabaseDesignProposeRequest,
  DatabaseDesignReproposalRequest,
  DatabaseDesignResponse,
  DatabaseDesignTrigger,
  DatabaseDraftSummary,
  DatabaseSchemaJsonResponse,
  SandboxMigrationPreview,
  SandboxMigrationRun,
} from '../../../shared/schemas/database-design.schema';
import { NotFoundError } from '../../lib/errors';
import { logger } from '../../lib/logger';
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
import { detectDatabaseDraftGap } from './database-draft-gap.service';
import {
  validateDataBindingsForDatabaseSchema,
  validateDatabaseSchemaJson,
} from './database-schema-validator.service';
import {
  createSandboxMigrationService,
  type SandboxMigrationService,
} from './sandbox-migration.service';
import { createSandboxQueryService, type SandboxQueryService } from './sandbox-query.service';

const checkpointLabel = 'Draft を表示';

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
    dataBindings: row.dataBindings ?? [],
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
  schemaRecord: Pick<DatabaseSchemaJsonRecord, 'id' | 'version'>
): DataBinding[] {
  return drafts.map((binding) => ({
    ...binding,
    databaseSchemaJsonId: schemaRecord.id,
    databaseSchemaVersion: schemaRecord.version,
  }));
}

function sourceFromTrigger(trigger: string): DatabaseDraftSummary['source'] {
  if (trigger === 'screen-proposal') return 'screen';
  if (trigger === 'db-reproposal') return 'reproposal';
  return 'dbdesign';
}

function historicalAppliedAtBySchemaId(runs: SandboxMigrationRunRecord[]) {
  const appliedAtBySchemaId = new Map<string, Date>();
  for (const run of runs) {
    if (!run.appliedAt || !['applied', 'reverted'].includes(run.status)) continue;
    const current = appliedAtBySchemaId.get(run.databaseSchemaJsonId);
    if (!current || run.appliedAt > current) {
      appliedAtBySchemaId.set(run.databaseSchemaJsonId, run.appliedAt);
    }
  }
  return appliedAtBySchemaId;
}

function sourceScreenJsonIdBySchemaId(
  rows: Awaited<ReturnType<DatabaseDesignRepository['listSourceScreenJsonIdsBySchemaJsonIds']>>
) {
  const screenJsonIdBySchemaId = new Map<string, string>();
  for (const row of rows) {
    if (!row.databaseSchemaJsonId || !row.screenJsonId) continue;
    if (!screenJsonIdBySchemaId.has(row.databaseSchemaJsonId)) {
      screenJsonIdBySchemaId.set(row.databaseSchemaJsonId, row.screenJsonId);
    }
  }
  return screenJsonIdBySchemaId;
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
  migrationService: SandboxMigrationService,
  sandboxQueryService: SandboxQueryService
) {
  const conversation = async (
    userId: string,
    designSessionId: string
  ): Promise<DatabaseDesignConversationResponse> => {
    const session = await repo.findDesignSessionById(userId, designSessionId);
    if (!session) throw new NotFoundError('Database design session not found');
    const schemaJsons = await repo.listSchemaJsons(designSessionId);
    const messages = await repo.listDesignMessages(designSessionId);
    const activeSchema =
      schemaJsons.find((schema) => schema.id === session.activeDatabaseSchemaJsonId) ??
      schemaJsons.at(-1) ??
      null;
    return {
      session: mapSession(session),
      activeDatabaseSchemaJsonId: session.activeDatabaseSchemaJsonId ?? null,
      activeScreenJsonId: session.activeScreenJsonId ?? null,
      databaseSchemaJsons: schemaJsons.map(mapSchemaJson),
      messages: messages.map(mapMessage),
      dataBindings: activeSchema?.dataBindings ?? [],
    };
  };

  const propose = async (
    userId: string,
    input: DatabaseDesignProposeRequest
  ): Promise<DatabaseDesignResponse> => {
    const traceId = randomUUID();
    const startedAt = Date.now();
    logger.info(
      {
        traceId,
        designSessionId: input.designSessionId ?? null,
        promptChars: input.prompt.length,
        screenJsonId: input.screenJsonId ?? null,
        source: input.source,
        userId,
      },
      'DBDesign service propose started'
    );
    const session = input.designSessionId
      ? await repo.findDesignSessionById(userId, input.designSessionId)
      : await repo.createDesignSession({
          activeDatabaseSchemaJsonId: null,
          activeScreenJsonId: input.screenJsonId ?? null,
          createdBy: userId,
          title: titleFromPrompt(input.prompt),
        });
    if (!session) throw new NotFoundError('Database design session not found');
    logger.info(
      {
        traceId,
        activeDatabaseSchemaJsonId: session.activeDatabaseSchemaJsonId ?? null,
        activeScreenJsonId: session.activeScreenJsonId ?? null,
        designSessionId: session.id,
      },
      'DBDesign service session resolved'
    );

    const screenRow = input.screenJsonId
      ? await repo.findScreenJsonById(userId, input.screenJsonId)
      : null;
    if (input.screenJsonId && !screenRow) throw new NotFoundError('ScreenJSON not found');
    logger.info(
      {
        traceId,
        foundScreenJsonId: screenRow?.screenJson.id ?? null,
        screenSectionCount: screenRow?.screenJson.schema.sections.length ?? 0,
      },
      'DBDesign service screen context resolved'
    );

    const previous = await repo.latestSchemaJsonForSession(session.id);
    logger.info(
      {
        traceId,
        previousSchemaJsonId: previous?.id ?? null,
        previousTableCount: previous?.schema.tables.length ?? 0,
        previousVersion: previous?.version ?? null,
      },
      'DBDesign service previous schema resolved'
    );
    logger.info({ traceId }, 'DBDesign service provider call starting');
    const generated = await provider.propose({
      currentDatabaseSchema: previous?.schema ?? null,
      currentScreen: screenRow?.screenJson.schema ?? null,
      prompt: input.prompt,
      source: input.source,
    });
    logger.info(
      {
        traceId,
        bindingCount: generated.draft.dataBindings.length,
        hasScreen: Boolean(generated.draft.screen),
        provider: generated.providerMeta.provider,
        tableCount: generated.draft.databaseSchema.tables.length,
      },
      'DBDesign service provider call completed'
    );
    logger.info({ traceId }, 'DBDesign service database schema validation starting');
    const databaseSchema = validateDatabaseSchemaJson(generated.draft.databaseSchema);
    logger.info(
      {
        traceId,
        relationCount: databaseSchema.relations.length,
        tableCount: databaseSchema.tables.length,
        tables: databaseSchema.tables.map((table) => table.name),
      },
      'DBDesign service database schema validation completed'
    );
    logger.info({ traceId }, 'DBDesign service data binding validation starting');
    const draftBindings = validateDataBindingsForDatabaseSchema(
      databaseSchema,
      generated.draft.dataBindings
    );
    logger.info(
      { traceId, bindingCount: draftBindings.length },
      'DBDesign service data binding validation completed'
    );
    const version = await repo.nextSchemaVersion(session.id);
    const databaseSchemaJsonId = randomUUID();
    logger.info({ traceId, version }, 'DBDesign service schema version allocated');
    const dataBindings = persistedDataBindings(draftBindings, {
      id: databaseSchemaJsonId,
      version,
    });
    const schemaRecord = await repo.createSchemaJson({
      dataBindings,
      designSessionId: session.id,
      diffSummary: diffSummary(previous, databaseSchema),
      id: databaseSchemaJsonId,
      prompt: input.prompt,
      providerMeta: generated.providerMeta,
      schema: databaseSchema,
      trigger: input.source === 'screen' ? 'screen-proposal' : 'dbdesign-proposal',
      version,
    });
    logger.info(
      { traceId, databaseSchemaJsonId: schemaRecord.id, version: schemaRecord.version },
      'DBDesign service schema JSON persisted'
    );
    const updatedSession = await repo.updateDesignSessionActive(session.id, {
      activeDatabaseSchemaJsonId: schemaRecord.id,
      activeScreenJsonId: session.activeScreenJsonId ?? input.screenJsonId ?? null,
    });
    logger.info(
      {
        traceId,
        activeDatabaseSchemaJsonId: updatedSession.activeDatabaseSchemaJsonId ?? null,
        activeScreenJsonId: updatedSession.activeScreenJsonId ?? null,
      },
      'DBDesign service session active pointers updated'
    );
    await repo.createMessages([
      {
        content: input.prompt,
        databaseSchemaJsonId: schemaRecord.id,
        designSessionId: session.id,
        metadata: {},
        role: 'user',
        screenJsonId: input.screenJsonId ?? null,
      },
      {
        content: `${databaseSchema.label} のテーブル定義案を保存しました。`,
        databaseSchemaJsonId: schemaRecord.id,
        designSessionId: session.id,
        metadata: {
          checkpointDatabaseSchemaJsonId: schemaRecord.id,
          checkpointLabel,
          trigger: input.source === 'screen' ? 'screen-proposal' : 'dbdesign-proposal',
        },
        role: 'assistant',
        screenJsonId: input.screenJsonId ?? null,
      },
    ]);
    logger.info({ traceId }, 'DBDesign service conversation messages persisted');
    const nextConversation = await conversation(userId, session.id);
    logger.info(
      {
        traceId,
        durationMs: Date.now() - startedAt,
        messageCount: nextConversation.messages.length,
        schemaVersionCount: nextConversation.databaseSchemaJsons.length,
      },
      'DBDesign service propose completed'
    );

    return {
      session: mapSession(updatedSession),
      databaseSchemaJson: mapSchemaJson(schemaRecord),
      screen: generated.draft.screen,
      screenJsonId: input.screenJsonId ?? null,
      dataBindings,
      activities: generated.activities,
      conversation: nextConversation,
    };
  };

  const listDrafts = async (userId: string) => {
    const rows = await repo.listSchemaJsonsForUser(userId);
    const ids = rows.map((row) => row.databaseSchemaJson.id);
    const [sandboxState, migrationRuns, sourceScreenRows] = await Promise.all([
      sandboxQueryService.state(),
      repo.listMigrationRunsBySchemaJsonIds(ids),
      repo.listSourceScreenJsonIdsBySchemaJsonIds(ids),
    ]);
    const appliedAtBySchemaId = historicalAppliedAtBySchemaId(migrationRuns);
    const sourceScreenBySchemaId = sourceScreenJsonIdBySchemaId(sourceScreenRows);
    return {
      drafts: rows.map(({ databaseSchemaJson }) => {
        const gap = detectDatabaseDraftGap(databaseSchemaJson.schema, sandboxState);
        const historicallyAppliedAt = appliedAtBySchemaId.get(databaseSchemaJson.id);
        return {
          id: databaseSchemaJson.id,
          designSessionId: databaseSchemaJson.designSessionId,
          title: databaseSchemaJson.schema.label || titleFromPrompt(databaseSchemaJson.prompt),
          prompt: databaseSchemaJson.prompt,
          source: sourceFromTrigger(databaseSchemaJson.trigger),
          createdAt: dateIso(databaseSchemaJson.createdAt),
          tableCount: databaseSchemaJson.schema.tables.length,
          sourceScreenJsonId: sourceScreenBySchemaId.get(databaseSchemaJson.id) ?? null,
          historicallyAppliedAt: historicallyAppliedAt ? dateIso(historicallyAppliedAt) : null,
          currentMatch: gap.currentMatch,
          gap,
        };
      }),
    };
  };

  const draftGap = async (userId: string, databaseSchemaJsonId: string) => {
    const found = await repo.findSchemaJsonById(userId, databaseSchemaJsonId);
    if (!found) throw new NotFoundError('DatabaseSchemaJSON not found');
    return {
      databaseSchemaJsonId,
      gap: detectDatabaseDraftGap(
        found.databaseSchemaJson.schema,
        await sandboxQueryService.state()
      ),
    };
  };

  return {
    applyMigration: async (userId: string, databaseSchemaJsonId: string) => {
      const found = await repo.findSchemaJsonById(userId, databaseSchemaJsonId);
      if (!found) throw new NotFoundError('DatabaseSchemaJSON not found');
      return mapMigrationRun(await migrationService.apply(found.databaseSchemaJson));
    },
    conversation,
    draftGap,
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
    listDrafts,
    propose,
    reproposal: async (
      userId: string,
      databaseSchemaJsonId: string,
      input: DatabaseDesignReproposalRequest
    ): Promise<DatabaseDesignResponse> => {
      const found = await repo.findSchemaJsonById(userId, databaseSchemaJsonId);
      if (!found) throw new NotFoundError('DatabaseSchemaJSON not found');
      const prompt =
        input.prompt?.trim() || '現在の SandboxDB をベースに下書きを再提案してください。';
      const sandboxState = await sandboxQueryService.state();
      const generated = await provider.propose({
        currentDatabaseSchema: null,
        currentSandboxState: sandboxState,
        prompt,
        selectedDraftPrompt: found.databaseSchemaJson.prompt,
        selectedDraftSchema: found.databaseSchemaJson.schema,
        source: 'reproposal',
      });
      const databaseSchema = validateDatabaseSchemaJson(generated.draft.databaseSchema);
      const draftBindings = validateDataBindingsForDatabaseSchema(
        databaseSchema,
        generated.draft.dataBindings
      );
      const version = await repo.nextSchemaVersion(found.session.id);
      const newDatabaseSchemaJsonId = randomUUID();
      const dataBindings = persistedDataBindings(draftBindings, {
        id: newDatabaseSchemaJsonId,
        version,
      });
      const schemaRecord = await repo.createSchemaJson({
        dataBindings,
        designSessionId: found.session.id,
        diffSummary: diffSummary(found.databaseSchemaJson, databaseSchema),
        id: newDatabaseSchemaJsonId,
        prompt,
        providerMeta: generated.providerMeta,
        schema: databaseSchema,
        trigger: 'db-reproposal',
        version,
      });
      const updatedSession = await repo.updateDesignSessionActive(found.session.id, {
        activeDatabaseSchemaJsonId: schemaRecord.id,
        activeScreenJsonId: found.session.activeScreenJsonId ?? null,
      });
      await repo.createMessages([
        {
          content: prompt,
          databaseSchemaJsonId: schemaRecord.id,
          designSessionId: found.session.id,
          metadata: { sourceDatabaseSchemaJsonId: databaseSchemaJsonId },
          role: 'user',
          screenJsonId: null,
        },
        {
          content: '現在の SandboxDB をベースに下書きを再提案しました。',
          databaseSchemaJsonId: schemaRecord.id,
          designSessionId: found.session.id,
          metadata: {
            checkpointDatabaseSchemaJsonId: schemaRecord.id,
            checkpointLabel,
            sourceDatabaseSchemaJsonId: databaseSchemaJsonId,
            trigger: 'db-reproposal',
          },
          role: 'assistant',
          screenJsonId: null,
        },
      ]);
      return {
        activities: generated.activities,
        conversation: await conversation(userId, found.session.id),
        dataBindings,
        databaseSchemaJson: mapSchemaJson(schemaRecord),
        screen: generated.draft.screen,
        screenJsonId: null,
        session: mapSession(updatedSession),
      };
    },
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
  createSandboxMigrationService(databaseDesignRepository),
  createSandboxQueryService(databaseDesignRepository)
);
