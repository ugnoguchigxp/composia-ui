import { describe, expect, it, vi } from 'vitest';
import { createDatabaseDesignRepository } from '../api/modules/database-design/database-design.repository';

describe('database-design repository', () => {
  it('creates a design session', async () => {
    const mockSession = { id: 'session-1', title: 'Test Session' };
    const mockDb = {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(async () => [mockSession]),
        })),
      })),
    } as any;

    const repo = createDatabaseDesignRepository(mockDb);
    const result = await repo.createDesignSession({
      title: 'Test Session',
      createdBy: 'user-1',
    } as any);

    expect(result).toEqual(mockSession);
    expect(mockDb.insert).toHaveBeenCalled();
  });

  it('finds a design session by id', async () => {
    const mockSession = { id: 'session-1', title: 'Test Session', createdBy: 'user-1' };
    const mockDb = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [mockSession]),
          })),
        })),
      })),
    } as any;

    const repo = createDatabaseDesignRepository(mockDb);
    const result = await repo.findDesignSessionById('user-1', 'session-1');

    expect(result).toEqual(mockSession);
  });

  it('returns null when design session is not found', async () => {
    const mockDb = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => []),
          })),
        })),
      })),
    } as any;

    const repo = createDatabaseDesignRepository(mockDb);
    const result = await repo.findDesignSessionById('user-1', 'session-1');

    expect(result).toBeNull();
  });

  it('lists design messages', async () => {
    const mockMessages = [{ id: 'msg-1', content: 'hello' }];
    const mockDb = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(async () => mockMessages),
          })),
        })),
      })),
    } as any;

    const repo = createDatabaseDesignRepository(mockDb);
    const result = await repo.listDesignMessages('session-1');

    expect(result).toEqual(mockMessages);
  });

  it('deletes a schema json and updates session active id in a transaction', async () => {
    const mockTx = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => [{ id: 'session-1', activeDatabaseSchemaJsonId: 'schema-1' }]),
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => []),
            })),
          })),
        })),
      })),
      delete: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve()),
        })),
      })),
    } as any;

    const mockDb = {
      transaction: vi.fn(async (cb: any) => cb(mockTx)),
    } as any;

    const repo = createDatabaseDesignRepository(mockDb);
    await repo.deleteSchemaJson('session-1', 'schema-1');

    expect(mockDb.transaction).toHaveBeenCalled();
    expect(mockTx.delete).toHaveBeenCalled();
    expect(mockTx.update).toHaveBeenCalled();
  });

  it('finds schema json by id with session join', async () => {
    const mockDb = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          innerJoin: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(() => [
                { databaseSchemaJson: { id: 'schema-1' }, session: { id: 'session-1' } },
              ]),
            })),
          })),
        })),
      })),
    } as any;

    const repo = createDatabaseDesignRepository(mockDb);
    const result = await repo.findSchemaJsonById('user-1', 'schema-1');

    expect(result?.databaseSchemaJson.id).toBe('schema-1');
    expect(result?.session.id).toBe('session-1');
  });

  it('lists schema jsons for a user with session join and specific mapping', async () => {
    const mockDb = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          innerJoin: vi.fn(() => ({
            where: vi.fn(() => ({
              orderBy: vi.fn(() =>
                Promise.resolve([
                  {
                    databaseSchemaJson: { id: 'schema-1', version: 1 },
                    session: { id: 'session-1' },
                  },
                ])
              ),
            })),
          })),
        })),
      })),
    } as any;

    const repo = createDatabaseDesignRepository(mockDb);
    const result = await repo.listSchemaJsonsForUser('user-1');

    expect(result).toHaveLength(1);
    expect(result[0].databaseSchemaJson.id).toBe('schema-1');
    expect(result[0].session.id).toBe('session-1');
  });
});
