import { desc, eq } from 'drizzle-orm';
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
    const saved: NormalizedEntityRecord[] = [];
    for (const item of items) {
      const [entity] = await db
        .insert(normalizedEntities)
        .values({
          sourceDefinitionId: source.id,
          source: source.kind,
          entityType: source.entityType,
          externalId: item.externalId,
          title: item.title,
          body: item.body,
          summary: item.summary,
          url: item.url,
          author: item.author,
          tags: item.tags,
          publishedAt: item.publishedAt,
          sourceUpdatedAt: item.sourceUpdatedAt,
          raw: item.raw,
        })
        .onConflictDoUpdate({
          target: [normalizedEntities.sourceDefinitionId, normalizedEntities.externalId],
          set: {
            title: item.title,
            body: item.body,
            summary: item.summary,
            url: item.url,
            author: item.author,
            tags: item.tags,
            publishedAt: item.publishedAt,
            sourceUpdatedAt: item.sourceUpdatedAt,
            raw: item.raw,
            updatedAt: new Date(),
          },
        })
        .returning();
      if (entity) saved.push(entity);
    }
    return saved;
  },
};
