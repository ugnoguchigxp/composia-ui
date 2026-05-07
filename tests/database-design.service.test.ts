import { describe, expect, it, vi } from 'vitest';
import type { DatabaseDesignProvider } from '../api/modules/database-design/database-design.provider';
import type { DatabaseDesignRepository } from '../api/modules/database-design/database-design.repository';
import { createDatabaseDesignService } from '../api/modules/database-design/database-design.service';
import type { DataBindingDraft } from '../shared/schemas/data-binding.schema';
import type { DatabaseSchemaJson } from '../shared/schemas/database-design.schema';
import type { AppUiSchema } from '../shared/schemas/ui-schema.schema';

const userId = '11111111-1111-4111-8111-111111111111';
const designSessionId = '22222222-2222-4222-8222-222222222222';
const sourceScreenJsonId = '33333333-3333-4333-8333-333333333333';
const boundScreenJsonId = '44444444-4444-4444-8444-444444444444';
const promptSessionId = '66666666-6666-4666-8666-666666666666';
const now = new Date('2026-05-07T00:00:00.000Z');

function screenSchema(dataBindingId?: string): AppUiSchema {
  return {
    page: 'Products',
    intent: 'Manage products',
    layout: 'entity-list',
    sections: [
      {
        component: 'DataTableSection',
        dataBindingId,
        source: dataBindingId ? 'postgres' : 'api',
        props: {
          title: 'Products',
          columns: [{ key: 'name', label: 'Name' }],
        },
      },
    ],
  };
}

function databaseSchema(): DatabaseSchemaJson {
  return {
    name: 'products_schema',
    label: 'Products',
    purpose: 'Manage products',
    tables: [
      {
        name: 'products',
        label: 'Products',
        columns: [
          {
            name: 'id',
            label: 'ID',
            type: 'uuid',
            nullable: false,
            primaryKey: true,
            unique: true,
            default: { kind: 'uuid' },
            validation: { required: true },
            ui: {
              filterable: false,
              formVisible: false,
              listVisible: false,
              sortable: false,
            },
          },
          {
            name: 'name',
            label: 'Name',
            type: 'text',
            nullable: false,
            primaryKey: false,
            unique: false,
            validation: { required: true },
            ui: {
              filterable: true,
              formVisible: true,
              listVisible: true,
              sortable: true,
            },
          },
        ],
        indexes: [],
        ui: { defaultSortDirection: 'asc', displayField: 'name' },
      },
    ],
    relations: [],
    uiHints: {
      defaultNavigation: ['products'],
      primaryTables: ['products'],
      suggestedScreens: [{ name: 'Products', operation: 'list', table: 'products' }],
    },
  };
}

function createRepository(): DatabaseDesignRepository {
  const designSession = {
    id: designSessionId,
    title: 'Products',
    createdBy: userId,
    activeDatabaseSchemaJsonId: null,
    activeScreenJsonId: sourceScreenJsonId,
    createdAt: now,
    updatedAt: now,
  };
  const promptSession = {
    id: promptSessionId,
    title: 'Products UI',
    createdBy: userId,
    activeScreenJsonId: sourceScreenJsonId,
    createdAt: now,
    updatedAt: now,
  };
  const sourceScreenJson = {
    id: sourceScreenJsonId,
    sessionId: promptSessionId,
    version: 1,
    prompt: 'Products UI',
    trigger: 'initial-prompt',
    inferredIntent: 'Manage products',
    action: null,
    schema: screenSchema(),
    databaseSchemaJsonId: null,
    dataBindings: [],
    contextSnapshot: {},
    providerMeta: { provider: 'mock' as const, componentRegistryVersion: 'test' },
    createdAt: now,
    updatedAt: now,
  };
  const state = {
    boundScreenJson: null as typeof sourceScreenJson | null,
    messages: [] as Awaited<ReturnType<DatabaseDesignRepository['createMessages']>>,
    schemaJson: null as Awaited<ReturnType<DatabaseDesignRepository['createSchemaJson']>> | null,
  };

  return {
    createDesignSession: vi.fn(async () => designSession),
    createMessages: vi.fn(async (input) => {
      const rows = input.map((message, index) => ({
        id: `77777777-7777-4777-8777-77777777777${index}`,
        createdAt: now,
        updatedAt: now,
        ...message,
        databaseSchemaJsonId: message.databaseSchemaJsonId ?? null,
        metadata: message.metadata ?? {},
        screenJsonId: message.screenJsonId ?? null,
      }));
      state.messages.push(...rows);
      return rows;
    }),
    createMigrationRun: vi.fn(async () => {
      throw new Error('createMigrationRun should not be called');
    }),
    createSchemaJson: vi.fn(async (input) => {
      state.schemaJson = {
        createdAt: now,
        updatedAt: now,
        ...input,
        dataBindings: input.dataBindings ?? [],
      };
      return state.schemaJson;
    }),
    createScreenJson: vi.fn(async (input) => {
      state.boundScreenJson = {
        id: boundScreenJsonId,
        createdAt: now,
        updatedAt: now,
        ...input,
        action: input.action ?? null,
        dataBindings: input.dataBindings ?? [],
        databaseSchemaJsonId: input.databaseSchemaJsonId ?? null,
      };
      return state.boundScreenJson;
    }),
    deleteScreenJsonsAfterVersion: vi.fn(async () => undefined),
    findDesignSessionById: vi.fn(async () => designSession),
    findSchemaJsonById: vi.fn(async () => null),
    findScreenJsonById: vi.fn(async () => ({
      screenJson: sourceScreenJson,
      session: promptSession,
    })),
    latestAppliedSchemaJson: vi.fn(async () => null),
    latestSchemaJsonForSession: vi.fn(async () => null),
    nextSchemaVersion: vi.fn(async () => 1),
    nextScreenJsonVersion: vi.fn(async () => 2),
    listBoundScreenJsonsBySchemaJsonIds: vi.fn(async (ids) =>
      state.boundScreenJson?.databaseSchemaJsonId &&
      ids.includes(state.boundScreenJson.databaseSchemaJsonId)
        ? [
            {
              databaseSchemaJsonId: state.boundScreenJson.databaseSchemaJsonId,
              promptSessionId: state.boundScreenJson.sessionId,
              screenJsonId: state.boundScreenJson.id,
            },
          ]
        : []
    ),
    listDesignMessages: vi.fn(async () => state.messages),
    listMigrationRunsBySchemaJsonIds: vi.fn(async () => []),
    listManagedObjects: vi.fn(async () => []),
    listSchemaJsons: vi.fn(async () => (state.schemaJson ? [state.schemaJson] : [])),
    listSchemaJsonsForUser: vi.fn(async () =>
      state.schemaJson ? [{ databaseSchemaJson: state.schemaJson, session: designSession }] : []
    ),
    listSourceScreenJsonIdsBySchemaJsonIds: vi.fn(async () => []),
    markAppliedMigrationRunsReverted: vi.fn(async () => undefined),
    markManagedObjectsDropped: vi.fn(async () => undefined),
    replaceManagedObjects: vi.fn(async () => []),
    updateDesignSessionActive: vi.fn(async (_id, input) => ({
      ...designSession,
      activeDatabaseSchemaJsonId: input.activeDatabaseSchemaJsonId ?? null,
      activeScreenJsonId: input.activeScreenJsonId ?? null,
    })),
    updateMigrationRun: vi.fn(async () => {
      throw new Error('updateMigrationRun should not be called');
    }),
    updatePromptSessionActiveScreenJson: vi.fn(async (_sessionId, screenJsonId) => ({
      ...promptSession,
      activeScreenJsonId: screenJsonId,
    })),
  };
}

describe('database design service', () => {
  it('persists a provider-returned bound ScreenJSON without applying migration', async () => {
    const repo = createRepository();
    const bindings: DataBindingDraft[] = [
      {
        id: 'products_list',
        table: 'products',
        operation: 'list',
        fields: ['name'],
        relations: [],
        filters: [],
        sort: [],
        limit: 50,
      },
    ];
    const provider: DatabaseDesignProvider = {
      propose: vi.fn(async () => ({
        activities: [],
        draft: {
          databaseSchema: databaseSchema(),
          dataBindings: bindings,
          rationale: { databaseChanges: [], uiBindings: [] },
          screen: screenSchema('products_list'),
        },
        providerMeta: { provider: 'mock', componentRegistryVersion: 'test' },
      })),
    };
    const migrationService = {
      apply: vi.fn(),
      preview: vi.fn(),
      reset: vi.fn(),
    };
    const sandboxQueryService = {
      state: vi.fn(async () => ({
        appliedDatabaseSchemaJsonId: null,
        appliedVersion: null,
        tables: [],
      })),
    };
    const service = createDatabaseDesignService(
      repo,
      provider,
      migrationService,
      sandboxQueryService as never
    );

    const result = await service.propose(userId, {
      prompt: 'Products に binding を付けてください',
      source: 'screen',
      screenJsonId: sourceScreenJsonId,
    });
    const persistedSchemaId = result.databaseSchemaJson.id;

    expect(result.screenJsonId).toBe(boundScreenJsonId);
    expect(repo.createScreenJson).toHaveBeenCalledWith(
      expect.objectContaining({
        databaseSchemaJsonId: persistedSchemaId,
        dataBindings: [
          expect.objectContaining({
            id: 'products_list',
            databaseSchemaJsonId: persistedSchemaId,
            databaseSchemaVersion: 1,
          }),
        ],
        schema: expect.objectContaining({
          sections: [expect.objectContaining({ dataBindingId: 'products_list' })],
        }),
        sessionId: promptSessionId,
        trigger: 'chat-edit',
        version: 2,
      })
    );
    expect(repo.updatePromptSessionActiveScreenJson).toHaveBeenCalledWith(
      promptSessionId,
      boundScreenJsonId
    );
    expect(repo.updateDesignSessionActive).toHaveBeenCalledWith(
      designSessionId,
      expect.objectContaining({
        activeDatabaseSchemaJsonId: persistedSchemaId,
        activeScreenJsonId: boundScreenJsonId,
      })
    );
    expect(repo.createMessages).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          metadata: expect.objectContaining({
            checkpointDatabaseSchemaJsonId: persistedSchemaId,
            checkpointScreenJsonId: boundScreenJsonId,
            databaseSchemaVersion: 1,
            screenVersion: 2,
          }),
          screenJsonId: boundScreenJsonId,
        }),
      ])
    );
    expect(migrationService.apply).not.toHaveBeenCalled();
  });

  it('keeps the source ScreenJSON when the provider omits a bound screen', async () => {
    const repo = createRepository();
    const provider: DatabaseDesignProvider = {
      propose: vi.fn(async () => ({
        activities: [],
        draft: {
          databaseSchema: databaseSchema(),
          dataBindings: [],
          rationale: { databaseChanges: [], uiBindings: [] },
        },
        providerMeta: { provider: 'mock', componentRegistryVersion: 'test' },
      })),
    };
    const migrationService = {
      apply: vi.fn(),
      preview: vi.fn(),
      reset: vi.fn(),
    };
    const sandboxQueryService = {
      state: vi.fn(async () => ({
        appliedDatabaseSchemaJsonId: null,
        appliedVersion: null,
        tables: [],
      })),
    };
    const service = createDatabaseDesignService(
      repo,
      provider,
      migrationService,
      sandboxQueryService as never
    );

    const result = await service.propose(userId, {
      prompt: 'Products の DB だけ提案してください',
      source: 'screen',
      screenJsonId: sourceScreenJsonId,
    });

    expect(result.screenJsonId).toBe(sourceScreenJsonId);
    expect(repo.createScreenJson).not.toHaveBeenCalled();
    expect(repo.updatePromptSessionActiveScreenJson).not.toHaveBeenCalled();
    expect(repo.updateDesignSessionActive).toHaveBeenCalledWith(
      designSessionId,
      expect.objectContaining({
        activeDatabaseSchemaJsonId: result.databaseSchemaJson.id,
        activeScreenJsonId: sourceScreenJsonId,
      })
    );
    expect(migrationService.apply).not.toHaveBeenCalled();
  });

  it('rejects provider screens that reference missing data bindings', async () => {
    const repo = createRepository();
    const provider: DatabaseDesignProvider = {
      propose: vi.fn(async () => ({
        activities: [],
        draft: {
          databaseSchema: databaseSchema(),
          dataBindings: [],
          rationale: { databaseChanges: [], uiBindings: [] },
          screen: screenSchema('missing_list'),
        },
        providerMeta: { provider: 'mock', componentRegistryVersion: 'test' },
      })),
    };
    const migrationService = {
      apply: vi.fn(),
      preview: vi.fn(),
      reset: vi.fn(),
    };
    const sandboxQueryService = {
      state: vi.fn(async () => ({
        appliedDatabaseSchemaJsonId: null,
        appliedVersion: null,
        tables: [],
      })),
    };
    const service = createDatabaseDesignService(
      repo,
      provider,
      migrationService,
      sandboxQueryService as never
    );

    await expect(
      service.propose(userId, {
        prompt: 'Products に binding を付けてください',
        source: 'screen',
        screenJsonId: sourceScreenJsonId,
      })
    ).rejects.toThrow('Screen data binding proposal is invalid');
    expect(repo.createSchemaJson).not.toHaveBeenCalled();
    expect(repo.createScreenJson).not.toHaveBeenCalled();
  });

  it('exposes persisted bound ScreenJSON metadata in draft summaries', async () => {
    const repo = createRepository();
    const provider: DatabaseDesignProvider = {
      propose: vi.fn(async () => ({
        activities: [],
        draft: {
          databaseSchema: databaseSchema(),
          dataBindings: [
            {
              id: 'products_list',
              table: 'products',
              operation: 'list',
              fields: ['name'],
              relations: [],
              filters: [],
              sort: [],
              limit: 50,
            },
          ],
          rationale: { databaseChanges: [], uiBindings: [] },
          screen: screenSchema('products_list'),
        },
        providerMeta: { provider: 'mock', componentRegistryVersion: 'test' },
      })),
    };
    const migrationService = {
      apply: vi.fn(),
      preview: vi.fn(),
      reset: vi.fn(),
    };
    const sandboxQueryService = {
      state: vi.fn(async () => ({
        appliedDatabaseSchemaJsonId: null,
        appliedVersion: null,
        tables: [],
      })),
    };
    const service = createDatabaseDesignService(
      repo,
      provider,
      migrationService,
      sandboxQueryService as never
    );

    const result = await service.propose(userId, {
      prompt: 'Products に binding を付けてください',
      source: 'screen',
      screenJsonId: sourceScreenJsonId,
    });
    const drafts = await service.listDrafts(userId);

    expect(drafts.drafts).toEqual([
      expect.objectContaining({
        id: result.databaseSchemaJson.id,
        boundPromptSessionId: promptSessionId,
        boundScreenJsonId,
      }),
    ]);
  });
});
