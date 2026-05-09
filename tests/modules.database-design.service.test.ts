import { describe, expect, it, vi } from 'vitest';
import { createDatabaseDesignService } from '../api/modules/database-design/database-design.service';

describe('database-design service', () => {
  it('lists drafts for a user', async () => {
    const mockRepo = {
      listSchemaJsonsForUser: vi.fn(async () => [
        {
          databaseSchemaJson: {
            id: 'schema-1',
            designSessionId: 'session-1',
            prompt: 'test prompt',
            version: 1,
            schema: { label: 'Test Label', tables: [], relations: [] },
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          session: {
            id: 'session-1',
            title: 'Session',
            prompt: 'test prompt',
            createdBy: 'user-1',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
      ]),
      listMigrationRunsBySchemaJsonIds: vi.fn(async () => []),
      listSourceScreenJsonIdsBySchemaJsonIds: vi.fn(async () => []),
      listBoundScreenJsonsBySchemaJsonIds: vi.fn(async () => []),
    } as any;

    const service = createDatabaseDesignService(
      mockRepo,
      {} as any,
      {} as any,
      { state: vi.fn(async () => ({ tables: [] })) } as any
    );

    const result = await service.listDrafts('user-1');
    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0].id).toBe('schema-1');
  });

  it('retrieves conversation for a session', async () => {
    const mockRepo = {
      findDesignSessionById: vi.fn(async () => ({
        id: 'session-1',
        title: 'Session',
        createdBy: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      listDesignMessages: vi.fn(async () => [
        {
          id: 'msg-1',
          role: 'user',
          content: 'hello',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
      listSchemaJsons: vi.fn(async () => []),
    } as any;

    const service = createDatabaseDesignService(
      mockRepo,
      {} as any,
      {} as any,
      { state: vi.fn(async () => ({ tables: [] })) } as any
    );

    const result = await service.conversation('user-1', 'session-1');
    expect(result.session.id).toBe('session-1');
    expect(result.messages).toHaveLength(1);
  });
});
