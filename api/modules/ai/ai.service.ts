import { createHash } from 'node:crypto';
import type { Logger } from 'pino';
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
import {
  appCatalogVersion,
  normalizeAppUiSchemaCatalog,
} from '../../../shared/schemas/app-catalog.schema';
import type { SourceDefinition } from '../../../shared/schemas/sources.schema';
import { type AppUiSchema, appUiSchemaSchema } from '../../../shared/schemas/ui-schema.schema';
import { config } from '../../config';
import { AppError, ValidationError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { cacheService } from '../cache/cache.service';
import { entitiesRepository } from '../entities/entities.repository';
import { entityMetadataList } from '../entities/entity-metadata';
import {
  readSourceRefreshRuntimeState,
  resolveSourceRefreshStatus,
} from '../sources/source-refresh-state';
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

export type AiTraceContext = {
  logger?: Logger;
  requestId?: string;
  userId?: string;
};

type ActiveProviderMeta = {
  model?: string;
  provider: 'anthropic' | 'azure-openai' | 'google-ai' | 'mock' | 'openai';
};

const cacheNamespace = 'ai-layout';
const componentRegistryVersion = `component-registry-v2:${layoutSystemContextVersion}:${appCatalogVersion}`;

function cacheKeyForPrompt(prompt: string, context?: AiSourceContext) {
  return createHash('sha256')
    .update(JSON.stringify({ prompt, context, componentRegistryVersion }))
    .digest('hex');
}

function dateIso(value: Date | null | undefined) {
  return value ? value.toISOString() : undefined;
}

function mapSource(
  source: SourceRecord,
  options?: {
    itemCount?: number;
    lastError?: string;
    lastRefreshedAt?: string;
    lastStatus?: SourceDefinition['lastStatus'];
  }
): SourceDefinition {
  return {
    id: source.id,
    kind: source.kind as SourceDefinition['kind'],
    label: source.label,
    url: source.url ?? undefined,
    entityType: source.entityType,
    settings: source.settings as SourceDefinition['settings'],
    enabled: source.enabled,
    itemCount: options?.itemCount,
    lastError: options?.lastError,
    lastRefreshedAt: options?.lastRefreshedAt,
    lastStatus: options?.lastStatus,
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
      const [sources, entities] = await Promise.all([
        sourcesRepository.listSources().then((rows) =>
          Promise.all(
            rows.slice(0, 8).map(async (source) => {
              const [runtimeState, items] = await Promise.all([
                readSourceRefreshRuntimeState(cacheService, source.id),
                sourcesRepository.listItems(source.id),
              ]);
              const status = resolveSourceRefreshStatus(runtimeState);
              return {
                source: mapSource(source, {
                  itemCount: items.length,
                  lastError: runtimeState?.lastError,
                  lastRefreshedAt: runtimeState?.lastRefreshedAt,
                  lastStatus: status,
                }),
                items: status === 'failed' ? [] : items.slice(0, 8).map(mapEntity),
              };
            })
          )
        ),
        Promise.all(
          entityMetadataList.slice(0, 8).map(async (metadata) => ({
            metadata,
            rows: (
              await entitiesRepository.list(
                metadata.name as Parameters<typeof entitiesRepository.list>[0]
              )
            ).slice(0, 8),
          }))
        ),
      ]);
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
      status: source.source.lastStatus ?? 'idle',
      lastRefreshedAt: source.source.lastRefreshedAt ?? null,
      items: (source.source.lastStatus === 'failed' ? [] : source.items).map((item) => ({
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

function activeProviderMeta(): ActiveProviderMeta {
  if (
    config.AZURE_OPENAI_API_KEY &&
    config.AZURE_OPENAI_ENDPOINT &&
    config.AZURE_OPENAI_DEPLOYMENT_NAME
  ) {
    return {
      provider: 'azure-openai',
      model: config.AZURE_OPENAI_DEPLOYMENT_NAME,
    };
  }

  if (config.OPENAI_API_KEY) {
    return {
      provider: 'openai',
      model: config.OPENAI_MODEL,
    };
  }

  if (config.ANTHROPIC_API_KEY) {
    return {
      provider: 'anthropic',
      model: config.ANTHROPIC_MODEL,
    };
  }

  if (config.GOOGLE_AI_API_KEY) {
    return {
      provider: 'google-ai',
      model: config.GOOGLE_AI_MODEL,
    };
  }

  return { provider: 'mock' };
}

function traceFields(trace?: AiTraceContext) {
  const fields: Record<string, string> = {};
  if (trace?.requestId) fields.requestId = trace.requestId;
  if (trace?.userId) fields.userId = trace.userId;
  return fields;
}

function traceLogger(trace?: AiTraceContext) {
  return trace?.logger ?? logger;
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

function stripProviderNullObjectProperties(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripProviderNullObjectProperties);
  }

  if (typeof value !== 'object' || value === null) return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, child]) => child !== null)
      .map(([key, child]) => [key, stripProviderNullObjectProperties(child)])
  );
}

function safeParseProviderSchema(value: unknown) {
  return appUiSchemaSchema.safeParse(stripProviderNullObjectProperties(value));
}

function normalizeTableCellValue(value: unknown): string | number | boolean | null {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map(normalizeTableCellValue)
      .filter((item) => item !== null)
      .join(', ');
  }

  if (typeof value === 'object' && value !== null) {
    for (const key of ['name', 'title', 'label', 'value', 'id']) {
      const candidate = (value as Record<string, unknown>)[key];
      if (
        typeof candidate === 'string' ||
        typeof candidate === 'number' ||
        typeof candidate === 'boolean'
      ) {
        return String(candidate);
      }
    }

    return JSON.stringify(value);
  }

  return String(value);
}

function normalizeTableRows(rows: unknown) {
  if (!Array.isArray(rows)) return rows;

  return rows.map((row) => {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) return row;
    return Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, normalizeTableCellValue(value)])
    );
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type ActionAnchor = {
  label: string;
  target: string;
};

function actionAnchorLabel(value: Record<string, unknown>, fallback: string) {
  for (const key of ['label', 'title', 'name']) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return fallback;
}

function collectActionAnchors(value: unknown): ActionAnchor[] {
  if (Array.isArray(value)) return value.flatMap(collectActionAnchors);
  if (!isRecord(value)) return [];

  const href = value.href;
  const ownAnchors =
    typeof href === 'string' && href.trim()
      ? [{ label: actionAnchorLabel(value, href.trim()), target: href.trim() }]
      : [];

  return [
    ...ownAnchors,
    ...Object.entries(value).flatMap(([key, child]) =>
      key === 'href' ? [] : collectActionAnchors(child)
    ),
  ];
}

function sectionActionMatchesAnchor(
  action: NonNullable<AppUiSchema['sections'][number]['actions']>[number],
  anchors: ActionAnchor[]
) {
  return anchors.some((anchor) => action.target === anchor.target || action.label === anchor.label);
}

function removeOrphanSectionActions<T extends AppUiSchema['sections'][number]>(section: T): T {
  if (!section.actions?.length) return section;

  const anchors = collectActionAnchors(section.props);
  const actions = section.actions.filter((action) => sectionActionMatchesAnchor(action, anchors));
  if (actions.length === section.actions.length) return section;
  if (actions.length === 0) {
    const { actions: _actions, ...sectionWithoutActions } = section;
    return sectionWithoutActions as T;
  }

  return { ...section, actions };
}

function normalizeChartHeight(value: unknown) {
  if (value === undefined) return value;
  if (typeof value === 'number') {
    if (value <= 260) return 'sm';
    if (value >= 360) return 'lg';
    return 'md';
  }

  if (typeof value !== 'string') return 'md';
  const normalized = value.trim().toLowerCase();
  if (['sm', 'md', 'lg'].includes(normalized)) return normalized;

  const numeric = Number.parseInt(normalized, 10);
  if (Number.isFinite(numeric)) return normalizeChartHeight(numeric);

  if (['small', 'short', 'compact', 'low'].includes(normalized)) return 'sm';
  if (['large', 'tall', 'high', 'xl', 'wide'].includes(normalized)) return 'lg';
  return 'md';
}

const quickActionIcons = new Set([
  'play',
  'download',
  'refresh-cw',
  'settings',
  'shield',
  'users',
  'database',
  'file-text',
  'bar-chart',
  'package',
  'dollar-sign',
]);

function normalizeQuickActionIcon(value: unknown) {
  if (value === undefined) return value;
  if (typeof value !== 'string') return 'settings';

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
  if (quickActionIcons.has(normalized)) return normalized;

  if (
    ['user', 'people', 'team', 'employee', 'employees', 'customer', 'customers'].includes(
      normalized
    )
  ) {
    return 'users';
  }
  if (['db', 'data', 'table', 'server', 'storage'].includes(normalized)) return 'database';
  if (['file', 'document', 'report', 'invoice', 'receipt', 'receipt-text'].includes(normalized)) {
    return 'file-text';
  }
  if (
    ['chart', 'analytics', 'bar-chart-2', 'bar-chart-3', 'line-chart', 'pie-chart'].includes(
      normalized
    )
  ) {
    return 'bar-chart';
  }
  if (['box', 'inventory', 'product', 'products'].includes(normalized)) return 'package';
  if (
    ['money', 'yen', 'dollar', 'payment', 'payments', 'revenue', 'finance'].includes(normalized)
  ) {
    return 'dollar-sign';
  }
  if (['run', 'start', 'launch', 'open'].includes(normalized)) return 'play';
  if (['export', 'import'].includes(normalized)) return 'download';
  if (['refresh', 'sync', 'reload', 'update'].includes(normalized)) return 'refresh-cw';
  if (['security', 'risk', 'compliance', 'approval', 'guard'].includes(normalized)) return 'shield';
  return 'settings';
}

function normalizeQuickActionItems(items: unknown) {
  if (!Array.isArray(items)) return items;

  return items.map((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return item;
    return {
      ...item,
      icon: normalizeQuickActionIcon((item as Record<string, unknown>).icon),
    };
  });
}

function normalizeNotificationLevel(value: unknown) {
  if (value === undefined) return value;
  if (typeof value !== 'string') return 'info';

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
  if (['info', 'success', 'warning', 'danger'].includes(normalized)) return normalized;
  if (['warn', 'caution', 'attention', 'notice'].includes(normalized)) return 'warning';
  if (['critical', 'error', 'failed', 'failure', 'urgent', 'alert', 'high'].includes(normalized)) {
    return 'danger';
  }
  if (['ok', 'resolved', 'complete', 'completed', 'healthy'].includes(normalized)) return 'success';
  return 'info';
}

function normalizeNotificationItems(items: unknown) {
  if (!Array.isArray(items)) return items;

  return items.map((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return item;
    return {
      ...item,
      level: normalizeNotificationLevel((item as Record<string, unknown>).level),
    };
  });
}

function normalizeProviderSchema(schema: AppUiSchema): AppUiSchema {
  const dedupedSections = dedupeGeneratedSections(schema.sections);
  return {
    ...schema,
    sections: dedupedSections.map((providerSection) => {
      const section = removeOrphanSectionActions(providerSection);

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

      if (section.component === 'ChartSection') {
        return {
          ...section,
          props: {
            ...section.props,
            height: normalizeChartHeight(section.props.height),
          },
        };
      }

      if (section.component === 'DataTableSection') {
        return {
          ...section,
          props: {
            ...section.props,
            rows: normalizeTableRows(section.props.rows),
          },
        };
      }

      if (section.component === 'NotificationCenterSection') {
        return {
          ...section,
          props: {
            ...section.props,
            items: normalizeNotificationItems(section.props.items),
          },
        };
      }

      if (section.component === 'QuickActionsSection') {
        return {
          ...section,
          props: {
            ...section.props,
            items: normalizeQuickActionItems(section.props.items),
          },
        };
      }

      return section;
    }),
  };
}

function dedupeGeneratedSections(sections: AppUiSchema['sections']): AppUiSchema['sections'] {
  const hasMainSearch = sections.some(
    (section) => section.component === 'MainSearchNavigationSection'
  );
  const result: AppUiSchema['sections'] = [];

  for (const section of sections) {
    if (hasMainSearch && section.component === 'NavigationPanel') {
      continue;
    }

    const duplicate = result.some((existing) => isSemanticallyDuplicateSection(existing, section));
    if (duplicate) continue;
    result.push(section);
  }

  return result;
}

function normalizedText(value: string | undefined) {
  return (value ?? '').trim().toLowerCase();
}

function readPropString(section: AppUiSchema['sections'][number], key: string): string | undefined {
  const raw = (section.props as Record<string, unknown> | undefined)?.[key];
  return typeof raw === 'string' ? raw : undefined;
}

function isSemanticallyDuplicateSection(
  a: AppUiSchema['sections'][number],
  b: AppUiSchema['sections'][number]
) {
  if (a.component !== b.component) return false;
  if (a.component === 'MainSearchNavigationSection') return true;
  if (a.component === 'NavigationPanel') return true;

  if (a.component === 'FormSection' && b.component === 'FormSection') {
    const aTitle = normalizedText(readPropString(a, 'title'));
    const bTitle = normalizedText(readPropString(b, 'title'));
    if (aTitle && bTitle && aTitle === bTitle) return true;
  }

  if (a.component === 'CardGridSection' && b.component === 'CardGridSection') {
    const aTitle = normalizedText(readPropString(a, 'title'));
    const bTitle = normalizedText(readPropString(b, 'title'));
    if (aTitle && bTitle && aTitle === bTitle) return true;
  }

  return false;
}

export function createAiService(
  provider: AiLayoutProvider,
  cache?: AiLayoutCache,
  contextReader?: AiContextReader
) {
  return {
    classify: async (
      input: AiClassificationRequest,
      trace?: AiTraceContext
    ): Promise<AiClassificationResponse> => {
      if (!provider.classify) providerUnavailable('Classification');
      const aiLogger = traceLogger(trace);
      const providerMeta = activeProviderMeta();
      const startedAt = Date.now();
      aiLogger.info(
        {
          ...traceFields(trace),
          provider: providerMeta.provider,
          model: providerMeta.model,
          textChars: input.text.length,
        },
        'AI classify started'
      );
      const parsed = aiClassificationResponseSchema.safeParse(await provider.classify?.(input));
      const durationMs = Date.now() - startedAt;
      if (!parsed.success) {
        aiLogger.warn(
          {
            ...traceFields(trace),
            provider: providerMeta.provider,
            model: providerMeta.model,
            durationMs,
            validationResult: 'failed',
            issueCount: parsed.error.issues.length,
          },
          'AI classify validation failed'
        );
        throw new ValidationError('AI returned an invalid classification', parsed.error.flatten());
      }
      aiLogger.info(
        {
          ...traceFields(trace),
          provider: providerMeta.provider,
          model: providerMeta.model,
          durationMs,
          validationResult: 'valid',
        },
        'AI classify completed'
      );
      return {
        ...parsed.data,
        activities: [
          completedActivity('provider-response', 'AI provider response', `${durationMs}ms`),
          completedActivity('classification-validation', 'Classification validation'),
        ],
      };
    },
    generateLayout: async (
      { context: inputContext, prompt }: AiLayoutRequest,
      trace?: AiTraceContext
    ): Promise<AiLayoutResponse> => {
      const aiLogger = traceLogger(trace);
      const providerMeta = activeProviderMeta();
      const context =
        inputContext ?? (await contextReader?.getLayoutContext().catch(() => undefined));
      aiLogger.info(
        {
          ...traceFields(trace),
          provider: providerMeta.provider,
          model: providerMeta.model,
          contextEntityCount: context?.entities.length ?? 0,
          contextSourceCount: context?.sources.length ?? 0,
          promptChars: prompt.length,
        },
        'AI layout generation started'
      );
      const cacheKey = cacheKeyForPrompt(prompt, context);
      if (cache) {
        const cached = await cache.get(cacheNamespace, cacheKey);
        const schemaValidationStartedAt = Date.now();
        const parsedCached = cached.entry ? safeParseProviderSchema(cached.entry.value) : null;
        const schemaValidationMs = Date.now() - schemaValidationStartedAt;
        if (parsedCached?.success) {
          try {
            const renderPreparationStartedAt = Date.now();
            const normalizedSchema = normalizeProviderSchema(parsedCached.data);
            const renderPreparationMs = Date.now() - renderPreparationStartedAt;
            const catalogValidationStartedAt = Date.now();
            const cachedSchema = normalizeAppUiSchemaCatalog(normalizedSchema);
            const catalogValidationMs = Date.now() - catalogValidationStartedAt;
            const totalDurationMs = schemaValidationMs + renderPreparationMs + catalogValidationMs;
            aiLogger.info(
              {
                ...traceFields(trace),
                cache: 'hit',
                cacheKey,
                catalogValidationMs,
                durationMs: totalDurationMs,
                model: providerMeta.model,
                provider: providerMeta.provider,
                renderPreparationMs,
                schemaSectionCount: cachedSchema.sections.length,
                schemaValidationMs,
                validationResult: 'valid',
              },
              'AI layout completed from cache'
            );
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
                  detail: `${cachedSchema.sections.length} sections / ${schemaValidationMs}ms`,
                },
                {
                  id: 'catalog-validation',
                  label: 'Component catalog validation',
                  status: 'completed',
                  detail: `${catalogValidationMs}ms`,
                },
                {
                  id: 'render-preparation',
                  label: 'Render preparation',
                  status: 'completed',
                  detail: `${renderPreparationMs}ms`,
                },
              ],
            };
          } catch {
            // Invalid stale cache entry; regenerate below.
            aiLogger.warn(
              {
                ...traceFields(trace),
                cacheKey,
                provider: providerMeta.provider,
                model: providerMeta.model,
              },
              'AI layout cache entry invalid, regenerating'
            );
          }
        }
      }

      const startedAt = Date.now();
      aiLogger.info(
        {
          ...traceFields(trace),
          cache: cache ? 'miss' : 'disabled',
          cacheKey,
          model: providerMeta.model,
          provider: providerMeta.provider,
        },
        'AI layout cache miss, generating'
      );
      const providerStartedAt = Date.now();
      const generated = await provider.generateLayout(promptWithContext(prompt, context));
      const providerElapsedMs = Date.now() - providerStartedAt;
      const schemaValidationStartedAt = Date.now();
      const parsed = safeParseProviderSchema(generated);
      const schemaValidationMs = Date.now() - schemaValidationStartedAt;
      if (!parsed.success) {
        aiLogger.warn(
          {
            ...traceFields(trace),
            durationMs: Date.now() - startedAt,
            model: providerMeta.model,
            provider: providerMeta.provider,
            schemaValidationMs,
            validationResult: 'failed',
          },
          'AI layout schema validation failed'
        );
        throw new ValidationError('AI returned an invalid UI schema', {
          ...parsed.error.flatten(),
          issues: parsed.error.issues,
        });
      }
      let schema: AppUiSchema;
      const renderPreparationStartedAt = Date.now();
      const normalizedProvider = normalizeProviderSchema(parsed.data);
      const renderPreparationMs = Date.now() - renderPreparationStartedAt;
      const catalogValidationStartedAt = Date.now();

      try {
        schema = normalizeAppUiSchemaCatalog(normalizedProvider);
      } catch (error) {
        aiLogger.warn(
          {
            ...traceFields(trace),
            durationMs: Date.now() - startedAt,
            model: providerMeta.model,
            provider: providerMeta.provider,
            renderPreparationMs,
            validationResult: 'failed',
          },
          'AI layout catalog validation failed'
        );
        throw new ValidationError('AI returned a schema outside the component catalog', {
          reason: error instanceof Error ? error.message : 'Unknown catalog validation error',
        });
      }
      const catalogValidationMs = Date.now() - catalogValidationStartedAt;

      await cache?.set({
        namespace: cacheNamespace,
        key: cacheKey,
        value: schema,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
      const durationMs = Date.now() - startedAt;
      aiLogger.info(
        {
          ...traceFields(trace),
          catalogValidationMs,
          durationMs,
          model: providerMeta.model,
          provider: providerMeta.provider,
          providerDurationMs: providerElapsedMs,
          renderPreparationMs,
          schemaSectionCount: schema.sections.length,
          schemaValidationMs,
          validationResult: 'valid',
        },
        'AI layout generation completed'
      );

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
            detail: `${schema.sections.length} sections / ${schemaValidationMs}ms`,
          },
          {
            id: 'catalog-validation',
            label: 'Component catalog validation',
            status: 'completed',
            detail: `${catalogValidationMs}ms`,
          },
          {
            id: 'render-preparation',
            label: 'Render preparation',
            status: 'completed',
            detail: `${renderPreparationMs}ms`,
          },
        ],
      };
    },
    generateNavigation: async (
      input: AiNavigationRequest,
      trace?: AiTraceContext
    ): Promise<AiNavigationResponse> => {
      if (!provider.generateNavigation) providerUnavailable('Navigation');
      const aiLogger = traceLogger(trace);
      const providerMeta = activeProviderMeta();
      const context =
        input.context ?? (await contextReader?.getLayoutContext().catch(() => undefined));
      const startedAt = Date.now();
      aiLogger.info(
        {
          ...traceFields(trace),
          contextEntityCount: context?.entities.length ?? 0,
          contextSourceCount: context?.sources.length ?? 0,
          model: providerMeta.model,
          promptChars: input.prompt.length,
          provider: providerMeta.provider,
        },
        'AI navigation generation started'
      );
      const parsed = aiNavigationResponseSchema.safeParse(
        await provider.generateNavigation?.(promptWithContext(input.prompt, context))
      );
      const durationMs = Date.now() - startedAt;
      if (!parsed.success) {
        aiLogger.warn(
          {
            ...traceFields(trace),
            durationMs,
            model: providerMeta.model,
            provider: providerMeta.provider,
            validationResult: 'failed',
          },
          'AI navigation validation failed'
        );
        throw new ValidationError('AI returned invalid navigation', parsed.error.flatten());
      }
      aiLogger.info(
        {
          ...traceFields(trace),
          durationMs,
          linkCount: parsed.data.links.length,
          model: providerMeta.model,
          provider: providerMeta.provider,
          validationResult: 'valid',
        },
        'AI navigation generation completed'
      );
      return {
        ...parsed.data,
        activities: [
          completedActivity(
            'source-context',
            'Source context',
            context ? 'included' : 'not available'
          ),
          completedActivity('provider-response', 'AI provider response', `${durationMs}ms`),
          completedActivity('navigation-validation', 'Navigation validation'),
        ],
      };
    },
    summarize: async (input: AiTextRequest, trace?: AiTraceContext): Promise<AiSummaryResponse> => {
      if (!provider.summarize) providerUnavailable('Summary');
      const aiLogger = traceLogger(trace);
      const providerMeta = activeProviderMeta();
      const startedAt = Date.now();
      aiLogger.info(
        {
          ...traceFields(trace),
          model: providerMeta.model,
          provider: providerMeta.provider,
          textChars: input.text.length,
        },
        'AI summary started'
      );
      const parsed = aiSummaryResponseSchema.safeParse(await provider.summarize?.(input));
      const durationMs = Date.now() - startedAt;
      if (!parsed.success) {
        aiLogger.warn(
          {
            ...traceFields(trace),
            durationMs,
            model: providerMeta.model,
            provider: providerMeta.provider,
            validationResult: 'failed',
          },
          'AI summary validation failed'
        );
        throw new ValidationError('AI returned an invalid summary', parsed.error.flatten());
      }
      aiLogger.info(
        {
          ...traceFields(trace),
          durationMs,
          model: providerMeta.model,
          provider: providerMeta.provider,
          summaryChars: parsed.data.summary.length,
          validationResult: 'valid',
        },
        'AI summary completed'
      );
      return {
        ...parsed.data,
        activities: [
          completedActivity('provider-response', 'AI provider response', `${durationMs}ms`),
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
