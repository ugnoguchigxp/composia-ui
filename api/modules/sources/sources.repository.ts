import { desc, eq, sql } from 'drizzle-orm';
import type { SourceKind } from '../../../shared/schemas/sources.schema';
import { db } from '../../db/client';
import { normalizedEntities, sourceDefinitions } from '../../db/schema';
import type { SourceAdapterItem, SourceAdapterSettings } from './adapters/source-adapter.types';

export type SourceRecord = typeof sourceDefinitions.$inferSelect;
export type NormalizedEntityRecord = typeof normalizedEntities.$inferSelect;

export type SourcesRepository = {
  createSource: (input: {
    kind: SourceKind;
    label: string;
    url?: string | null;
    entityType: string;
    settings?: SourceAdapterSettings | null;
  }) => Promise<SourceRecord>;
  createRssSource: (input: {
    label: string;
    url: string;
    entityType: string;
  }) => Promise<SourceRecord>;
  deleteSource: (id: string) => Promise<void>;
  findSourceById: (id: string) => Promise<SourceRecord | null>;
  findSourceByLabel: (label: string) => Promise<SourceRecord | null>;
  listItems: (sourceId: string) => Promise<NormalizedEntityRecord[]>;
  listSources: () => Promise<SourceRecord[]>;
  upsertItems: (
    source: SourceRecord,
    items: SourceAdapterItem[]
  ) => Promise<NormalizedEntityRecord[]>;
};

export const sourcesRepository: SourcesRepository = {
  createSource: async (input) => {
    const [source] = await db
      .insert(sourceDefinitions)
      .values({
        kind: input.kind,
        label: input.label,
        url: input.url ?? null,
        entityType: input.entityType,
        settings: input.settings ?? null,
      })
      .returning();
    if (!source) throw new Error('Source was not persisted');
    return source;
  },
  createRssSource: async (input) =>
    sourcesRepository.createSource({
      kind: 'rss',
      label: input.label,
      url: input.url,
      entityType: input.entityType,
      settings: null,
    }),
  deleteSource: async (id) => {
    await db.delete(sourceDefinitions).where(eq(sourceDefinitions.id, id));
  },
  findSourceById: async (id) => {
    const [source] = await db
      .select()
      .from(sourceDefinitions)
      .where(eq(sourceDefinitions.id, id))
      .limit(1);
    return source ?? null;
  },
  findSourceByLabel: async (label) => {
    const [source] = await db
      .select()
      .from(sourceDefinitions)
      .where(eq(sourceDefinitions.label, label))
      .limit(1);
    return source ?? null;
  },
  listItems: async (sourceId) =>
    db
      .select()
      .from(normalizedEntities)
      .where(eq(normalizedEntities.sourceDefinitionId, sourceId))
      .orderBy(desc(normalizedEntities.publishedAt), desc(normalizedEntities.createdAt)),
  listSources: async () => db.select().from(sourceDefinitions).orderBy(sourceDefinitions.label),
  upsertItems: async (source, items) => {
    if (items.length === 0) return [];

    return db
      .insert(normalizedEntities)
      .values(
        items.map((item) => ({
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
          publishedAt: item.publishedAt ?? null,
          sourceUpdatedAt: item.sourceUpdatedAt ?? null,
          raw: item.raw,
        }))
      )
      .onConflictDoUpdate({
        target: [normalizedEntities.sourceDefinitionId, normalizedEntities.externalId],
        set: {
          title: sql`excluded.title`,
          body: sql`excluded.body`,
          summary: sql`excluded.summary`,
          url: sql`excluded.url`,
          author: sql`excluded.author`,
          tags: sql`excluded.tags`,
          publishedAt: sql`excluded.published_at`,
          sourceUpdatedAt: sql`excluded.source_updated_at`,
          raw: sql`excluded.raw`,
          updatedAt: new Date(),
        },
      })
      .returning();
  },
};
