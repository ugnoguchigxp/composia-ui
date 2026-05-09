import { describe, expect, it, vi } from 'vitest';
import { createSandboxQueryService } from '../api/modules/database-design/sandbox-query.service';

describe('sandbox-query service', () => {
  it('lists rows from a managed table', async () => {
    const mockRepo = {
      latestAppliedSchemaJson: vi.fn(async () => ({
        id: 'schema-1',
        schema: { tables: [{ name: 'users', columns: [] }] },
      })),
      listManagedObjects: vi.fn(async () => [
        { objectType: 'table', objectName: 'users', status: 'active' },
      ]),
    } as any;

    const mockSql = {
      unsafe: vi.fn(async () => [{ id: '1', name: 'John' }]),
    } as any;

    const service = createSandboxQueryService(mockRepo, mockSql);
    const result = await service.listRows('users', 10);

    expect(result.table).toBe('users');
    expect(result.rows).toHaveLength(1);
    expect(mockSql.unsafe).toHaveBeenCalledWith(
      expect.stringContaining('SELECT * FROM "users" LIMIT 10')
    );
  });

  it('throws NotFoundError if table is not managed', async () => {
    const mockRepo = {
      latestAppliedSchemaJson: vi.fn(async () => ({
        id: 'schema-1',
        schema: { tables: [] },
      })),
      listManagedObjects: vi.fn(async () => []),
    } as any;

    const mockSql = {
      unsafe: vi.fn(),
    } as any;

    const service = createSandboxQueryService(mockRepo, mockSql);
    await expect(service.listRows('unknown', 10)).rejects.toThrow('is not managed');
  });

  it('inserts a row into a managed table', async () => {
    const mockRepo = {
      latestAppliedSchemaJson: vi.fn(async () => ({
        id: 'schema-1',
        schema: {
          tables: [
            {
              name: 'users',
              columns: [
                { name: 'id', type: 'uuid', validation: {} },
                { name: 'name', type: 'text', validation: {} },
              ],
            },
          ],
        },
      })),
      listManagedObjects: vi.fn(async () => [
        { objectType: 'table', objectName: 'users', status: 'active' },
      ]),
    } as any;

    const mockSql = {
      unsafe: vi.fn(async () => [{ id: '1', name: 'John' }]),
    } as any;

    const service = createSandboxQueryService(mockRepo, mockSql);
    const result = await service.insertRow('users', {
      id: '00000000-0000-0000-0000-000000000000',
      name: 'John',
    });

    expect(result.row.name).toBe('John');
    expect(mockSql.unsafe).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO "users" ("id", "name") VALUES')
    );
  });
});
