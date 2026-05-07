import type { NormalizedEntity } from '../../../shared/schemas/entities.schema';
import type {
  CreateApiSourceRequest,
  CreateMarkdownSourceRequest,
  CreatePostgresSourceRequest,
  CreateRssSourceRequest,
  SourceDefinition,
  SourceKind,
  SourceSettings,
} from '../../../shared/schemas/sources.schema';
import { NotFoundError, ValidationError } from '../../lib/errors';
import { type EntitiesRepository, entitiesRepository } from '../entities/entities.repository';
import { fetchApiItems } from './adapters/api.adapter';
import { fetchMarkdownItems } from './adapters/markdown.adapter';
import { fetchPostgresItems } from './adapters/postgres.adapter';
import { fetchRssItems } from './adapters/rss.adapter';
import type { SourceAdapterItem, SourceAdapterSettings } from './adapters/source-adapter.types';
import type { NormalizedEntityRecord, SourceRecord, SourcesRepository } from './sources.repository';
import { sourcesRepository } from './sources.repository';

type SourceFetchers = {
  api: typeof fetchApiItems;
  markdown: typeof fetchMarkdownItems;
  rss: typeof fetchRssItems;
};

type SourceServiceDependencies = {
  entityRepository?: Pick<EntitiesRepository, 'list'>;
  fetchers?: Partial<SourceFetchers>;
};

function dateIso(value: Date | null | undefined) {
  return value ? value.toISOString() : undefined;
}

function mapSource(source: SourceRecord): SourceDefinition {
  return {
    id: source.id,
    kind: source.kind as SourceDefinition['kind'],
    label: source.label,
    url: source.url ?? undefined,
    entityType: source.entityType,
    settings: source.settings ? (source.settings as SourceSettings) : undefined,
    enabled: source.enabled,
    createdAt: source.createdAt.toISOString(),
    updatedAt: source.updatedAt.toISOString(),
  };
}

function mapEntity(entity: NormalizedEntityRecord): NormalizedEntity {
  return {
    id: entity.id,
    source: entity.source as NormalizedEntity['source'],
    entityType: entity.entityType,
    title: entity.title ?? undefined,
    body: entity.body ?? undefined,
    summary: entity.summary ?? undefined,
    url: entity.url ?? undefined,
    author: entity.author ?? undefined,
    tags: entity.tags ?? undefined,
    status: entity.status ?? undefined,
    publishedAt: dateIso(entity.publishedAt),
    updatedAt: dateIso(entity.sourceUpdatedAt ?? entity.updatedAt),
    raw: entity.raw,
  };
}

export function createSourcesService(
  repo: SourcesRepository,
  dependencies: SourceServiceDependencies = {}
) {
  const fetchers = {
    api: fetchApiItems,
    markdown: fetchMarkdownItems,
    rss: fetchRssItems,
    ...dependencies.fetchers,
  };
  const entityRepository = dependencies.entityRepository ?? entitiesRepository;

  const createSource = async (input: {
    kind: SourceKind;
    label: string;
    url?: string | null;
    entityType: string;
    settings?: SourceAdapterSettings | null;
  }) => {
    const existing = await repo.findSourceByLabel(input.label);
    if (existing) {
      throw new ValidationError('Source label already exists');
    }

    const source = await repo.createSource(input);
    return { source: mapSource(source) };
  };

  const refreshItems = async (source: SourceRecord): Promise<SourceAdapterItem[]> => {
    const settings = (source.settings ?? {}) as SourceAdapterSettings;
    switch (source.kind) {
      case 'rss':
        if (!source.url) throw new ValidationError('RSS source requires a URL');
        return fetchers.rss(source.url);
      case 'api':
        if (!source.url) throw new ValidationError('API source requires a URL');
        return fetchers.api(source.url, settings);
      case 'markdown':
        if (!source.url) throw new ValidationError('Markdown source requires a URL');
        return fetchers.markdown(source.url, settings);
      case 'postgres':
        return fetchPostgresItems(source.url ?? settings.entity, entityRepository, settings);
      default:
        throw new ValidationError('Unsupported source kind');
    }
  };

  return {
    createApiSource: async (input: CreateApiSourceRequest) =>
      createSource({
        kind: 'api',
        label: input.label,
        url: input.url,
        entityType: input.entityType,
        settings: input.settings ?? null,
      }),
    createMarkdownSource: async (input: CreateMarkdownSourceRequest) =>
      createSource({
        kind: 'markdown',
        label: input.label,
        url: input.url,
        entityType: input.entityType,
        settings: input.settings ?? null,
      }),
    createPostgresSource: async (input: CreatePostgresSourceRequest) =>
      createSource({
        kind: 'postgres',
        label: input.label,
        url: input.entity,
        entityType: input.entityType,
        settings: { ...input.settings, entity: input.entity },
      }),
    createRssSource: async (input: CreateRssSourceRequest) =>
      createSource({
        kind: 'rss',
        label: input.label,
        url: input.url,
        entityType: input.entityType,
        settings: null,
      }),
    deleteSource: async (sourceId: string) => {
      await repo.deleteSource(sourceId);
      return { success: true };
    },
    getSource: async (sourceId: string) => {
      const source = await repo.findSourceById(sourceId);
      if (!source) throw new NotFoundError('Source not found');
      return { source: mapSource(source) };
    },
    listItems: async (sourceId: string) => {
      const source = await repo.findSourceById(sourceId);
      if (!source) throw new NotFoundError('Source not found');
      const items = await repo.listItems(sourceId);
      return { source: mapSource(source), items: items.map(mapEntity) };
    },
    listSources: async () => {
      const sources = await repo.listSources();
      return { sources: sources.map(mapSource) };
    },
    refreshSource: async (sourceId: string) => {
      const source = await repo.findSourceById(sourceId);
      if (!source) throw new NotFoundError('Source not found');

      const fetched = await refreshItems(source);
      const saved = await repo.upsertItems(source, fetched);
      return {
        source: mapSource(source),
        items: saved.map(mapEntity),
        refreshedAt: new Date().toISOString(),
      };
    },
  };
}

export const sourcesService = createSourcesService(sourcesRepository);
