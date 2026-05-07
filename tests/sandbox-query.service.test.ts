import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseDesignRepository } from '../api/modules/database-design/database-design.repository';
import { createSandboxQueryService } from '../api/modules/database-design/sandbox-query.service';

const sandboxSqlMock = vi.hoisted(() => ({
  unsafe: vi.fn(),
}));

vi.mock('../api/modules/database-design/sandbox-client', () => ({
  getSandboxSql: () => sandboxSqlMock,
}));

function createRepository(): DatabaseDesignRepository {
  return {
    createDesignMessage: vi.fn(),
    createDesignSession: vi.fn(),
    createMigrationRun: vi.fn(),
    createSchemaJson: vi.fn(),
    createScreenJson: vi.fn(),
    deleteSchemaJson: vi.fn(),
    findDesignSessionById: vi.fn(),
    findSchemaJsonById: vi.fn(),
    findScreenJsonById: vi.fn(),
    latestAppliedSchemaJson: vi.fn(),
    latestSchemaJsonForSession: vi.fn(),
    listBoundScreenJsonsBySchemaJsonIds: vi.fn(),
    listDesignMessages: vi.fn(),
    listManagedObjects: vi.fn(async () => [
      {
        createdAt: new Date('2026-05-07T00:00:00.000Z'),
        databaseSchemaJsonId: '33333333-3333-4333-8333-333333333333',
        id: '11111111-1111-4111-8111-111111111111',
        migrationRunId: '22222222-2222-4222-8222-222222222222',
        objectKey: 'table:products',
        objectName: 'products',
        objectType: 'table',
        parentObjectName: null,
        status: 'active',
        updatedAt: new Date('2026-05-07T00:00:00.000Z'),
      },
      {
        createdAt: new Date('2026-05-07T00:00:00.000Z'),
        databaseSchemaJsonId: '33333333-3333-4333-8333-333333333333',
        id: '44444444-4444-4444-8444-444444444444',
        migrationRunId: '22222222-2222-4222-8222-222222222222',
        objectKey: 'index:products_name_idx',
        objectName: 'products_name_idx',
        objectType: 'index',
        parentObjectName: 'products',
        status: 'active',
        updatedAt: new Date('2026-05-07T00:00:00.000Z'),
      },
      {
        createdAt: new Date('2026-05-07T00:00:00.000Z'),
        databaseSchemaJsonId: '33333333-3333-4333-8333-333333333333',
        id: '55555555-5555-4555-8555-555555555555',
        migrationRunId: '22222222-2222-4222-8222-222222222222',
        objectKey: 'enum:product_status',
        objectName: 'product_status',
        objectType: 'enum',
        parentObjectName: 'products',
        status: 'active',
        updatedAt: new Date('2026-05-07T00:00:00.000Z'),
      },
      {
        createdAt: new Date('2026-05-07T00:00:00.000Z'),
        databaseSchemaJsonId: '33333333-3333-4333-8333-333333333333',
        id: '66666666-6666-4666-8666-666666666666',
        migrationRunId: '22222222-2222-4222-8222-222222222222',
        objectKey: 'table:orders',
        objectName: 'orders',
        objectType: 'table',
        parentObjectName: null,
        status: 'active',
        updatedAt: new Date('2026-05-07T00:00:00.000Z'),
      },
    ]),
    listMigrationRunsBySchemaJsonIds: vi.fn(),
    listSchemaJsons: vi.fn(),
    listSchemaJsonsForUser: vi.fn(),
    listSourceScreenJsonIdsBySchemaJsonIds: vi.fn(),
    markAppliedMigrationRunsReverted: vi.fn(),
    markManagedObjectsDropped: vi.fn(),
    nextSchemaVersion: vi.fn(),
    nextScreenJsonVersion: vi.fn(),
    replaceManagedObjects: vi.fn(),
    updateDesignSessionActive: vi.fn(),
    updateMigrationRun: vi.fn(),
    updatePromptSessionActiveScreenJson: vi.fn(),
  } as unknown as DatabaseDesignRepository;
}

describe('sandbox query service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('drops a table and marks its managed objects as dropped', async () => {
    sandboxSqlMock.unsafe.mockResolvedValue([]);
    const repo = createRepository();
    const service = createSandboxQueryService(repo);

    await expect(service.dropTable('products')).resolves.toEqual({ success: true });

    expect(sandboxSqlMock.unsafe).toHaveBeenCalledWith(
      [
        'DROP INDEX IF EXISTS "products_name_idx";',
        'DROP TABLE IF EXISTS "products" CASCADE;',
        'DROP TYPE IF EXISTS "product_status" CASCADE;',
      ].join('\n')
    );
    expect(repo.markManagedObjectsDropped).toHaveBeenCalledWith([
      '11111111-1111-4111-8111-111111111111',
      '44444444-4444-4444-8444-444444444444',
      '55555555-5555-4555-8555-555555555555',
    ]);
  });

  it('inspects rows from a public table without requiring managed ownership', async () => {
    sandboxSqlMock.unsafe
      .mockResolvedValueOnce([{ '?column?': 1 }])
      .mockResolvedValueOnce([{ id: '77777777-7777-4777-8777-777777777777', name: 'Keyboard' }]);
    const service = createSandboxQueryService(createRepository());

    await expect(service.inspectRows('products', 25)).resolves.toEqual({
      table: 'products',
      rows: [{ id: '77777777-7777-4777-8777-777777777777', name: 'Keyboard' }],
    });

    expect(sandboxSqlMock.unsafe).toHaveBeenNthCalledWith(2, 'SELECT * FROM "products" LIMIT 25');
  });
});
