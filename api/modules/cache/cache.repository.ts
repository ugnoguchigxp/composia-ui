import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { cacheEntries } from '../../db/schema';

export type CacheEntryRecord = typeof cacheEntries.$inferSelect;

export type CacheRepository = {
  deleteAll: () => Promise<void>;
  deleteByNamespace: (namespace: string) => Promise<void>;
  deleteByNamespaceAndKey: (namespace: string, key: string) => Promise<void>;
  findByNamespaceAndKey: (namespace: string, key: string) => Promise<CacheEntryRecord | null>;
  list: () => Promise<CacheEntryRecord[]>;
  set: (input: {
    namespace: string;
    key: string;
    value: unknown;
    expiresAt?: Date | null;
  }) => Promise<CacheEntryRecord>;
};

export const cacheRepository: CacheRepository = {
  deleteAll: async () => {
    await db.delete(cacheEntries);
  },
  deleteByNamespace: async (namespace) => {
    await db.delete(cacheEntries).where(eq(cacheEntries.namespace, namespace));
  },
  deleteByNamespaceAndKey: async (namespace, key) => {
    await db
      .delete(cacheEntries)
      .where(and(eq(cacheEntries.namespace, namespace), eq(cacheEntries.key, key)));
  },
  findByNamespaceAndKey: async (namespace, key) => {
    const [entry] = await db
      .select()
      .from(cacheEntries)
      .where(and(eq(cacheEntries.namespace, namespace), eq(cacheEntries.key, key)))
      .limit(1);
    return entry ?? null;
  },
  list: async () => db.select().from(cacheEntries),
  set: async (input) => {
    const [entry] = await db
      .insert(cacheEntries)
      .values({
        namespace: input.namespace,
        key: input.key,
        value: input.value,
        expiresAt: input.expiresAt,
      })
      .onConflictDoUpdate({
        target: [cacheEntries.namespace, cacheEntries.key],
        set: {
          value: input.value,
          expiresAt: input.expiresAt,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!entry) {
      throw new Error('Cache entry was not persisted');
    }
    return entry;
  },
};
