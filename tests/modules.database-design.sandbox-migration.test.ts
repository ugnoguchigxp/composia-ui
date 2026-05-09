import { describe, expect, it, vi } from 'vitest';
import { createSandboxMigrationService } from '../api/modules/database-design/sandbox-migration.service';

describe('sandbox-migration service', () => {
  it('previews migration sql', async () => {
    const mockRepo = {} as any;
    const service = createSandboxMigrationService(mockRepo, {} as any);
    const result = await service.preview({
      id: 'schema-1',
      version: 1,
      schema: { tables: [], relations: [] },
    } as any);

    expect(result.databaseSchemaJsonId).toBe('schema-1');
    expect(result.sql).toBeDefined();
  });

  it('applies migration and updates repository', async () => {
    const mockRepo = {
      createMigrationRun: vi.fn(async (input) => ({ id: 'run-1', ...input })),
      updateMigrationRun: vi.fn(async (id, input) => ({ id, ...input })),
      replaceManagedObjects: vi.fn(async () => []),
    } as any;

    const mockSql = {
      unsafe: vi.fn(async () => []),
    } as any;

    const service = createSandboxMigrationService(mockRepo, mockSql);
    const result = await service.apply({
      id: 'schema-1',
      version: 1,
      schema: { tables: [], relations: [] },
    } as any);

    expect(result.status).toBe('applied');
    expect(mockSql.unsafe).toHaveBeenCalled();
    expect(mockRepo.replaceManagedObjects).toHaveBeenCalled();
  });

  it('handles migration failure', async () => {
    const mockRepo = {
      createMigrationRun: vi.fn(async (input) => ({ id: 'run-1', ...input })),
      updateMigrationRun: vi.fn(async (id, input) => ({ id, ...input })),
    } as any;

    const mockSql = {
      unsafe: vi.fn(async () => {
        throw new Error('DB Error');
      }),
    } as any;

    const service = createSandboxMigrationService(mockRepo, mockSql);
    const result = await service.apply({
      id: 'schema-1',
      version: 1,
      schema: { tables: [], relations: [] },
    } as any);

    expect(result.status).toBe('failed');
    expect(result.errorMessage).toBe('DB Error');
  });
});
