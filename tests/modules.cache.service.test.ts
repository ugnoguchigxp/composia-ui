import { describe, expect, it } from 'vitest';
import type { CacheEntryRecord, CacheRepository } from '../api/modules/cache/cache.repository';
import { createCacheService } from '../api/modules/cache/cache.service';

function cacheEntry(input: Partial<CacheEntryRecord> = {}): CacheEntryRecord {
  return {
    id: input.id ?? crypto.randomUUID(),
    createdAt: input.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: input.updatedAt ?? new Date('2026-01-01T00:00:00.000Z'),
    namespace: input.namespace ?? 'ai-layout',
    key: input.key ?? 'prompt-a',
    value: input.value ?? { ok: true },
    expiresAt: input.expiresAt ?? null,
  };
}

function createFakeRepository(initialEntries: CacheEntryRecord[] = []) {
  const entries = new Map<string, CacheEntryRecord>();
  const idFor = (namespace: string, key: string) => `${namespace}:${key}`;
  for (const entry of initialEntries) {
    entries.set(idFor(entry.namespace, entry.key), entry);
  }

  const repo: CacheRepository = {
    deleteAll: async () => {
      entries.clear();
    },
    deleteByNamespace: async (namespace) => {
      for (const entry of entries.values()) {
        if (entry.namespace === namespace) entries.delete(idFor(entry.namespace, entry.key));
      }
    },
    deleteByNamespaceAndKey: async (namespace, key) => {
      entries.delete(idFor(namespace, key));
    },
    findByNamespaceAndKey: async (namespace, key) => entries.get(idFor(namespace, key)) ?? null,
    list: async () => Array.from(entries.values()),
    set: async (input) => {
      const existing = entries.get(idFor(input.namespace, input.key));
      const entry = cacheEntry({
        ...existing,
        namespace: input.namespace,
        key: input.key,
        value: input.value,
        expiresAt: input.expiresAt ?? null,
        updatedAt: new Date('2026-01-01T00:01:00.000Z'),
      });
      entries.set(idFor(entry.namespace, entry.key), entry);
      return entry;
    },
  };

  return repo;
}

describe('cache service', () => {
  it('sets cache entries and reports active namespace counts', async () => {
    const service = createCacheService(createFakeRepository());

    await service.set({
      namespace: 'ai-layout',
      key: 'prompt-a',
      value: { sections: [] },
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    await expect(service.status()).resolves.toEqual({
      totalEntries: 1,
      namespaces: [{ namespace: 'ai-layout', entries: 1 }],
    });
  });

  it('returns null and removes expired entries on read', async () => {
    const repo = createFakeRepository([
      cacheEntry({
        key: 'expired',
        expiresAt: new Date(Date.now() - 60_000),
      }),
    ]);
    const service = createCacheService(repo);

    await expect(service.get('ai-layout', 'expired')).resolves.toEqual({ entry: null });
    await expect(repo.findByNamespaceAndKey('ai-layout', 'expired')).resolves.toBeNull();
  });

  it('invalidates a namespace without deleting other namespaces', async () => {
    const service = createCacheService(
      createFakeRepository([
        cacheEntry({ namespace: 'ai-layout', key: 'a' }),
        cacheEntry({ namespace: 'sources', key: 'feed' }),
      ])
    );

    await service.invalidate({ namespace: 'ai-layout' });

    await expect(service.status()).resolves.toEqual({
      totalEntries: 1,
      namespaces: [{ namespace: 'sources', entries: 1 }],
    });
  });
});
