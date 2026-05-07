import type {
  CacheEntry,
  CacheInvalidateRequest,
  CacheSetRequest,
  CacheStatus,
} from '../../../shared/schemas/cache.schema';
import type { CacheEntryRecord, CacheRepository } from './cache.repository';
import { cacheRepository } from './cache.repository';

function toIso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function mapEntry(entry: CacheEntryRecord): CacheEntry {
  return {
    namespace: entry.namespace,
    key: entry.key,
    value: entry.value,
    expiresAt: toIso(entry.expiresAt),
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

function isExpired(entry: CacheEntryRecord, now = new Date()) {
  return Boolean(entry.expiresAt && entry.expiresAt.getTime() <= now.getTime());
}

export function createCacheService(repo: CacheRepository) {
  return {
    delete: async (namespace: string, key: string) => {
      await repo.deleteByNamespaceAndKey(namespace, key);
      return { success: true };
    },
    get: async (namespace: string, key: string): Promise<{ entry: CacheEntry | null }> => {
      const entry = await repo.findByNamespaceAndKey(namespace, key);
      if (!entry) return { entry: null };
      if (isExpired(entry)) {
        await repo.deleteByNamespaceAndKey(namespace, key);
        return { entry: null };
      }
      return { entry: mapEntry(entry) };
    },
    invalidate: async (input: CacheInvalidateRequest) => {
      if (input.namespace && input.key) {
        await repo.deleteByNamespaceAndKey(input.namespace, input.key);
      } else if (input.namespace) {
        await repo.deleteByNamespace(input.namespace);
      } else {
        await repo.deleteAll();
      }
      return { success: true };
    },
    rebuild: async () => {
      const entries = await repo.list();
      await Promise.all(
        entries
          .filter((entry) => isExpired(entry))
          .map((entry) => repo.deleteByNamespaceAndKey(entry.namespace, entry.key))
      );
      return { success: true };
    },
    set: async (input: CacheSetRequest): Promise<{ entry: CacheEntry }> => {
      const entry = await repo.set({
        namespace: input.namespace,
        key: input.key,
        value: input.value,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      });
      return { entry: mapEntry(entry) };
    },
    status: async (): Promise<CacheStatus> => {
      const entries = (await repo.list()).filter((entry) => !isExpired(entry));
      const namespaceCounts = new Map<string, number>();
      for (const entry of entries) {
        namespaceCounts.set(entry.namespace, (namespaceCounts.get(entry.namespace) ?? 0) + 1);
      }

      return {
        totalEntries: entries.length,
        namespaces: Array.from(namespaceCounts.entries())
          .map(([namespace, count]) => ({ namespace, entries: count }))
          .sort((a, b) => a.namespace.localeCompare(b.namespace)),
      };
    },
  };
}

export const cacheService = createCacheService(cacheRepository);
