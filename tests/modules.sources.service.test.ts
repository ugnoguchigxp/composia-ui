import { describe, expect, it, vi } from 'vitest';
import type { RssAdapterItem } from '../api/modules/sources/adapters/rss.adapter';
import type {
  NormalizedEntityRecord,
  SourceRecord,
  SourcesRepository,
} from '../api/modules/sources/sources.repository';
import { createSourcesService } from '../api/modules/sources/sources.service';

const createdAt = new Date('2026-01-01T00:00:00.000Z');
const updatedAt = new Date('2026-01-01T00:01:00.000Z');

function sourceRecord(input: Partial<SourceRecord> = {}): SourceRecord {
  return {
    id: input.id ?? crypto.randomUUID(),
    createdAt: input.createdAt ?? createdAt,
    updatedAt: input.updatedAt ?? updatedAt,
    kind: input.kind ?? 'rss',
    label: input.label ?? 'Product feed',
    url: input.url ?? 'https://example.com/feed.xml',
    entityType: input.entityType ?? 'article',
    settings: input.settings ?? null,
    enabled: input.enabled ?? true,
  };
}

function entityRecord(source: SourceRecord, item: RssAdapterItem): NormalizedEntityRecord {
  return {
    id: crypto.randomUUID(),
    createdAt,
    updatedAt,
    sourceDefinitionId: source.id,
    source: source.kind,
    entityType: source.entityType,
    externalId: item.externalId,
    title: item.title ?? null,
    body: item.body ?? null,
    summary: item.summary ?? null,
    url: item.url ?? null,
    author: item.author ?? null,
    tags: item.tags ?? null,
    status: null,
    publishedAt: item.publishedAt ?? null,
    sourceUpdatedAt: item.sourceUpdatedAt ?? null,
    raw: item.raw,
  };
}

function createFakeRepository(initialSources: SourceRecord[] = []) {
  const sources = new Map(initialSources.map((source) => [source.id, source]));
  const items = new Map<string, NormalizedEntityRecord[]>();

  const repo: SourcesRepository = {
    createSource: async (input) => {
      const source = sourceRecord(input);
      sources.set(source.id, source);
      return source;
    },
    createRssSource: async (input) => {
      const source = sourceRecord(input);
      sources.set(source.id, source);
      return source;
    },
    deleteSource: async (id) => {
      sources.delete(id);
      items.delete(id);
    },
    findSourceById: async (id) => sources.get(id) ?? null,
    findSourceByLabel: async (label) =>
      Array.from(sources.values()).find((source) => source.label === label) ?? null,
    listItems: async (sourceId) => items.get(sourceId) ?? [],
    listSources: async () => Array.from(sources.values()),
    upsertItems: async (source, fetchedItems) => {
      const saved = fetchedItems.map((item) => entityRecord(source, item));
      items.set(source.id, saved);
      return saved;
    },
  };

  return repo;
}

function createFakeCache() {
  const entries = new Map<string, unknown>();
  return {
    get: async (namespace: string, key: string) => ({
      entry: entries.has(`${namespace}:${key}`)
        ? { value: entries.get(`${namespace}:${key}`) }
        : null,
    }),
    set: async (input: { namespace: string; key: string; value: unknown }) => {
      entries.set(`${input.namespace}:${input.key}`, input.value);
      return { entry: { value: input.value } };
    },
  };
}

describe('sources service', () => {
  it('rejects duplicate source labels before creating a source', async () => {
    const source = sourceRecord({ label: 'Product feed' });
    const service = createSourcesService(createFakeRepository([source]), {
      cache: createFakeCache(),
    });

    await expect(
      service.createRssSource({
        label: 'Product feed',
        url: 'https://example.com/other.xml',
        entityType: 'article',
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('refreshes an RSS source through the injected fetcher and normalizes items', async () => {
    const source = sourceRecord();
    const fetchItems = vi.fn(async () => [
      {
        externalId: 'https://example.com/posts/1',
        title: 'First post',
        summary: 'Short summary',
        url: 'https://example.com/posts/1',
        tags: ['release'],
        publishedAt: new Date('2026-01-02T00:00:00.000Z'),
        sourceUpdatedAt: new Date('2026-01-02T01:00:00.000Z'),
        raw: { guid: 'post-1' },
      },
    ]);
    const service = createSourcesService(createFakeRepository([source]), {
      cache: createFakeCache(),
      fetchers: { rss: fetchItems },
    });

    const result = await service.refreshSource(source.id);

    expect(fetchItems).toHaveBeenCalledWith('https://example.com/feed.xml');
    expect(result.source).toMatchObject({
      id: source.id,
      kind: 'rss',
      label: 'Product feed',
      entityType: 'article',
      itemCount: 1,
      lastStatus: 'success',
    });
    expect(result.items).toEqual([
      expect.objectContaining({
        source: 'rss',
        entityType: 'article',
        title: 'First post',
        summary: 'Short summary',
        url: 'https://example.com/posts/1',
        tags: ['release'],
        publishedAt: '2026-01-02T00:00:00.000Z',
        updatedAt: '2026-01-02T01:00:00.000Z',
        raw: { guid: 'post-1' },
      }),
    ]);
    expect(result.refreshedAt).toEqual(expect.any(String));
  });

  it('refreshes a PostgreSQL source from the injected entity repository', async () => {
    const source = sourceRecord({
      kind: 'postgres',
      label: 'Normalized rows',
      url: 'normalized-entities',
      entityType: 'entity-row',
      settings: { entity: 'normalized-entities' },
    });
    const service = createSourcesService(createFakeRepository([source]), {
      cache: createFakeCache(),
      entityRepository: {
        list: async () => [
          {
            id: 'row-1',
            title: 'Stored entity',
            summary: 'Already normalized.',
            updatedAt: '2026-01-03T00:00:00.000Z',
          },
        ],
      },
    });

    const result = await service.refreshSource(source.id);

    expect(result.items).toEqual([
      expect.objectContaining({
        source: 'postgres',
        entityType: 'entity-row',
        title: 'Stored entity',
        summary: 'Already normalized.',
      }),
    ]);
    expect(result.source.lastStatus).toBe('success');
    expect(result.source.itemCount).toBe(1);
  });

  it('stores failed refresh metadata and exposes it from listSources', async () => {
    const source = sourceRecord({ label: 'Failing feed' });
    const service = createSourcesService(createFakeRepository([source]), {
      cache: createFakeCache(),
      fetchers: {
        rss: vi.fn(async () => {
          throw new Error('RSS timeout');
        }),
      },
    });

    await expect(service.refreshSource(source.id)).rejects.toThrow('RSS timeout');
    const listed = await service.listSources();

    expect(listed.sources).toEqual([
      expect.objectContaining({
        id: source.id,
        label: 'Failing feed',
        itemCount: 0,
        lastError: 'RSS timeout',
        lastStatus: 'failed',
      }),
    ]);
  });

  it('continues refreshSource even when runtime state cache write fails', async () => {
    const source = sourceRecord();
    const service = createSourcesService(createFakeRepository([source]), {
      cache: {
        get: async () => ({ entry: null }),
        set: async () => {
          throw new Error('cache write failed');
        },
      },
      fetchers: {
        rss: async () => [
          {
            externalId: 'https://example.com/posts/1',
            title: 'First post',
            raw: { guid: 'post-1' },
          },
        ],
      },
    });

    await expect(service.refreshSource(source.id)).resolves.toEqual(
      expect.objectContaining({
        source: expect.objectContaining({
          id: source.id,
          itemCount: 1,
          lastStatus: 'success',
        }),
      })
    );
  });

  it('continues listSources even when runtime state cache read fails', async () => {
    const source = sourceRecord();
    const service = createSourcesService(createFakeRepository([source]), {
      cache: {
        get: async () => {
          throw new Error('cache read failed');
        },
        set: async () => ({ entry: null }),
      },
    });

    await expect(service.listSources()).resolves.toEqual({
      sources: [
        expect.objectContaining({
          id: source.id,
          lastStatus: 'idle',
        }),
      ],
    });
  });
});
