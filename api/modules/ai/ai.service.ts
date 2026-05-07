import { createHash } from 'node:crypto';
import type {
  AiClassificationRequest,
  AiClassificationResponse,
  AiLayoutRequest,
  AiLayoutResponse,
  AiNavigationRequest,
  AiNavigationResponse,
  AiSourceContext,
  AiSummaryResponse,
  AiTextRequest,
} from '../../../shared/schemas/ai.schema';
import {
  aiClassificationResponseSchema,
  aiNavigationResponseSchema,
  aiSummaryResponseSchema,
} from '../../../shared/schemas/ai.schema';
import { assertAppUiSchemaCatalog } from '../../../shared/schemas/app-catalog.schema';
import type { SourceDefinition } from '../../../shared/schemas/sources.schema';
import { type AppUiSchema, appUiSchemaSchema } from '../../../shared/schemas/ui-schema.schema';
import { AppError, ValidationError } from '../../lib/errors';
import { cacheService } from '../cache/cache.service';
import { entitiesRepository } from '../entities/entities.repository';
import { entityMetadataList } from '../entities/entity-metadata';
import {
  type NormalizedEntityRecord,
  type SourceRecord,
  sourcesRepository,
} from '../sources/sources.repository';
import {
  type AiLayoutProvider,
  createDefaultAiLayoutProvider,
  layoutSystemContextVersion,
} from './ai.provider';

type AiLayoutCache = {
  get: (namespace: string, key: string) => Promise<{ entry: { value: unknown } | null }>;
  set: (input: {
    namespace: string;
    key: string;
    value: unknown;
    expiresAt?: string | null;
  }) => Promise<unknown>;
};

export type AiContextReader = {
  getLayoutContext: () => Promise<AiSourceContext>;
};

const cacheNamespace = 'ai-layout';
const componentRegistryVersion = `component-registry-v2:${layoutSystemContextVersion}`;

function cacheKeyForPrompt(prompt: string, context?: AiSourceContext) {
  return createHash('sha256')
    .update(JSON.stringify({ prompt, context, componentRegistryVersion }))
    .digest('hex');
}

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
    settings: source.settings as SourceDefinition['settings'],
    enabled: source.enabled,
    createdAt: source.createdAt.toISOString(),
    updatedAt: source.updatedAt.toISOString(),
  };
}

function mapEntity(entity: NormalizedEntityRecord) {
  return {
    id: entity.id,
    source: entity.source as 'rss' | 'postgres' | 'api' | 'markdown',
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

export function createDefaultAiLayoutContextReader(): AiContextReader {
  return {
    getLayoutContext: async () => {
      const sources = await Promise.all(
        (await sourcesRepository.listSources()).slice(0, 8).map(async (source) => ({
          source: mapSource(source),
          items: (await sourcesRepository.listItems(source.id)).slice(0, 8).map(mapEntity),
        }))
      );
      const entities = await Promise.all(
        entityMetadataList.slice(0, 8).map(async (metadata) => ({
          metadata,
          rows: (
            await entitiesRepository.list(
              metadata.name as Parameters<typeof entitiesRepository.list>[0]
            )
          ).slice(0, 8),
        }))
      );
      return { entities, sources };
    },
  };
}

function compactContext(context?: AiSourceContext) {
  if (!context) return '';
  return JSON.stringify({
    sources: context.sources.map((source) => ({
      label: source.source.label,
      kind: source.source.kind,
      entityType: source.source.entityType,
      items: source.items.map((item) => ({
        title: item.title,
        summary: item.summary,
        url: item.url,
        publishedAt: item.publishedAt,
      })),
    })),
    entities: context.entities.map((entity) => ({
      name: entity.metadata.name,
      label: entity.metadata.label,
      fields: entity.metadata.views.list,
      rows: entity.rows,
    })),
  });
}

function promptWithContext(prompt: string, context?: AiSourceContext) {
  const contextJson = compactContext(context);
  if (!contextJson) return prompt;
  return `${prompt}\n\nAvailable app data context JSON:\n${contextJson}`;
}

function providerUnavailable(task: string) {
  throw new AppError(503, 'AI_PROVIDER_NOT_CONFIGURED', `${task} provider is not configured`);
}

function completedActivity(id: string, label: string, detail?: string) {
  return { id, label, status: 'completed' as const, detail };
}

function normalizeOptionLikeValue(option: unknown) {
  if (typeof option === 'string') {
    const value = option.trim();
    return value ? { label: value, value } : option;
  }
  return option;
}

function normalizeProviderSchema(schema: AppUiSchema): AppUiSchema {
  return {
    ...schema,
    sections: schema.sections.map((section) => {
      if (section.component === 'FormSection') {
        const fields = Array.isArray(section.props.fields)
          ? section.props.fields.map((field) => {
              if (typeof field !== 'object' || field === null || !Array.isArray(field.options)) {
                return field;
              }

              return {
                ...field,
                options: field.options.map(normalizeOptionLikeValue),
              };
            })
          : section.props.fields;

        return {
          ...section,
          props: {
            ...section.props,
            fields,
          },
        };
      }

      if (section.component === 'FilterBarSection' && Array.isArray(section.props.filters)) {
        return {
          ...section,
          props: {
            ...section.props,
            filters: section.props.filters.map(normalizeOptionLikeValue),
          },
        };
      }

      return section;
    }),
  };
}

export function createAiService(
  provider: AiLayoutProvider,
  cache?: AiLayoutCache,
  contextReader?: AiContextReader
) {
  return {
    classify: async (input: AiClassificationRequest): Promise<AiClassificationResponse> => {
      if (!provider.classify) providerUnavailable('Classification');
      const startedAt = Date.now();
      const parsed = aiClassificationResponseSchema.safeParse(await provider.classify?.(input));
      if (!parsed.success) {
        throw new ValidationError('AI returned an invalid classification', parsed.error.flatten());
      }
      return {
        ...parsed.data,
        activities: [
          completedActivity(
            'provider-response',
            'AI provider response',
            `${Date.now() - startedAt}ms`
          ),
          completedActivity('classification-validation', 'Classification validation'),
        ],
      };
    },
    generateLayout: async ({
      context: inputContext,
      prompt,
    }: AiLayoutRequest): Promise<AiLayoutResponse> => {
      const context =
        inputContext ?? (await contextReader?.getLayoutContext().catch(() => undefined));
      const cacheKey = cacheKeyForPrompt(prompt, context);
      if (cache) {
        const cached = await cache.get(cacheNamespace, cacheKey);
        const parsedCached = cached.entry ? appUiSchemaSchema.safeParse(cached.entry.value) : null;
        if (parsedCached?.success) {
          const cachedSchema = normalizeProviderSchema(parsedCached.data);
          try {
            assertAppUiSchemaCatalog(cachedSchema);
            return {
              schema: cachedSchema,
              activities: [
                {
                  id: 'layout-cache',
                  label: 'Layout decision cache',
                  status: 'completed',
                  detail: 'hit',
                },
                {
                  id: 'schema-validation',
                  label: 'App UI Schema validation',
                  status: 'completed',
                  detail: `${cachedSchema.sections.length} sections`,
                },
                {
                  id: 'catalog-validation',
                  label: 'Component catalog validation',
                  status: 'completed',
                },
              ],
            };
          } catch {
            // Invalid stale cache entry; regenerate below.
          }
        }
      }

      const startedAt = Date.now();
      const generated = await provider.generateLayout(promptWithContext(prompt, context));
      const providerElapsedMs = Date.now() - startedAt;
      const parsed = appUiSchemaSchema.safeParse(generated);
      if (!parsed.success) {
        throw new ValidationError('AI returned an invalid UI schema', parsed.error.flatten());
      }
      const schema = normalizeProviderSchema(parsed.data);

      try {
        assertAppUiSchemaCatalog(schema);
      } catch (error) {
        throw new ValidationError('AI returned a schema outside the component catalog', {
          reason: error instanceof Error ? error.message : 'Unknown catalog validation error',
        });
      }

      await cache?.set({
        namespace: cacheNamespace,
        key: cacheKey,
        value: schema,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });

      return {
        schema,
        activities: [
          {
            id: 'layout-cache',
            label: 'Layout decision cache',
            status: 'completed',
            detail: cache ? 'miss' : 'not configured',
          },
          completedActivity(
            'source-context',
            'Source context',
            context
              ? `${context.sources.length} sources / ${context.entities.length} entities`
              : 'not available'
          ),
          {
            id: 'provider-response',
            label: 'AI provider response',
            status: 'completed',
            detail: `${providerElapsedMs}ms`,
          },
          {
            id: 'schema-validation',
            label: 'App UI Schema validation',
            status: 'completed',
            detail: `${schema.sections.length} sections`,
          },
          {
            id: 'catalog-validation',
            label: 'Component catalog validation',
            status: 'completed',
          },
        ],
      };
    },
    generateNavigation: async (input: AiNavigationRequest): Promise<AiNavigationResponse> => {
      if (!provider.generateNavigation) providerUnavailable('Navigation');
      const context =
        input.context ?? (await contextReader?.getLayoutContext().catch(() => undefined));
      const startedAt = Date.now();
      const parsed = aiNavigationResponseSchema.safeParse(
        await provider.generateNavigation?.(promptWithContext(input.prompt, context))
      );
      if (!parsed.success) {
        throw new ValidationError('AI returned invalid navigation', parsed.error.flatten());
      }
      return {
        ...parsed.data,
        activities: [
          completedActivity(
            'source-context',
            'Source context',
            context ? 'included' : 'not available'
          ),
          completedActivity(
            'provider-response',
            'AI provider response',
            `${Date.now() - startedAt}ms`
          ),
          completedActivity('navigation-validation', 'Navigation validation'),
        ],
      };
    },
    summarize: async (input: AiTextRequest): Promise<AiSummaryResponse> => {
      if (!provider.summarize) providerUnavailable('Summary');
      const startedAt = Date.now();
      const parsed = aiSummaryResponseSchema.safeParse(await provider.summarize?.(input));
      if (!parsed.success) {
        throw new ValidationError('AI returned an invalid summary', parsed.error.flatten());
      }
      return {
        ...parsed.data,
        activities: [
          completedActivity(
            'provider-response',
            'AI provider response',
            `${Date.now() - startedAt}ms`
          ),
          completedActivity('summary-validation', 'Summary validation'),
        ],
      };
    },
  };
}

export const aiService = createAiService(
  createDefaultAiLayoutProvider(),
  cacheService,
  createDefaultAiLayoutContextReader()
);
