import { describe, expect, it, vi } from 'vitest';
import type { EntitiesRepository } from '../api/modules/entities/entities.repository';
import { createEntitiesService } from '../api/modules/entities/entities.service';
import type { EntityRow } from '../shared/schemas/entities.schema';

function createFakeRepository(rows: Record<string, EntityRow[]> = {}) {
  const repo: EntitiesRepository = {
    findById: vi.fn(async (entity, id) => rows[entity]?.find((row) => row.id === id) ?? null),
    list: vi.fn(async (entity) => rows[entity] ?? []),
  };
  return repo;
}

describe('entities service', () => {
  it('lists readonly entity metadata for generated data context', async () => {
    const service = createEntitiesService(createFakeRepository());

    await expect(service.listMetadata()).resolves.toEqual({
      entities: expect.arrayContaining([
        expect.objectContaining({
          name: 'source-definitions',
          mode: 'readonly',
        }),
        expect.objectContaining({
          name: 'normalized-entities',
          mode: 'readonly',
        }),
        expect.objectContaining({
          name: 'cache-entries',
          mode: 'readonly',
        }),
      ]),
    });
  });

  it('lists rows through the entity repository only after metadata validation', async () => {
    const repo = createFakeRepository({
      'cache-entries': [
        {
          id: 'cache-1',
          namespace: 'ai-layout',
          key: 'prompt-a',
        },
      ],
    });
    const service = createEntitiesService(repo);

    await expect(service.list('cache-entries')).resolves.toEqual({
      metadata: expect.objectContaining({ name: 'cache-entries' }),
      rows: [
        {
          id: 'cache-1',
          namespace: 'ai-layout',
          key: 'prompt-a',
        },
      ],
    });
    expect(repo.list).toHaveBeenCalledWith('cache-entries');
  });

  it('rejects generic writes against readonly entities', async () => {
    const service = createEntitiesService(createFakeRepository());

    await expect(service.create('cache-entries')).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
  });
});
