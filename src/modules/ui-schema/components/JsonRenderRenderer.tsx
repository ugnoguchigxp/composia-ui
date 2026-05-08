import {
  type ComponentType,
  memo,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { collectSectionRenderableActions } from '../../../../shared/schemas/ui-action-collector';
import type {
  AppAction,
  AppUiLayout,
  AppUiSchema,
} from '../../../../shared/schemas/ui-schema.schema';
import { appUiSchemaSchema } from '../../../../shared/schemas/ui-schema.schema';
import { logRenderPerf, measureRenderTask, renderPerfStart } from '../../../lib/render-performance';
import { AppActionRenderProvider } from '../../component-registry/components/AppActionControl';
import { appJsonRenderComponentMap } from '../../component-registry/components/registry';
import { assertAppUiSchemaCatalog } from '../../component-registry/services/registry.service';

type JsonRenderRendererProps = {
  bindingRows?: Record<string, Record<string, unknown>[]>;
  onAction?: (action: AppAction) => void;
  onSubmitBinding?: (dataBindingId: string, value: Record<string, unknown>) => void;
  pendingBindingId?: string | null;
  pendingActionId?: string | null;
  schema: AppUiSchema;
  selectedActionId?: string | null;
};

type DirectComponentProps = {
  children?: ReactNode;
  props: Record<string, unknown>;
};

type DirectComponent = ComponentType<DirectComponentProps>;
type AppJsonRenderComponentName = keyof typeof appJsonRenderComponentMap;
type SectionStage = {
  count: number;
  schema: AppUiSchema;
};

const layoutComponentMap: Record<AppUiLayout, AppJsonRenderComponentName> = {
  dashboard: 'DashboardPage',
  'entity-list': 'EntityListPage',
  'entity-detail': 'EntityDetailPage',
  form: 'EditableFormPage',
  'article-feed': 'ArticleFeedPage',
  admin: 'DashboardPage',
  screen: 'DashboardPage',
  sidebar: 'SidebarPage',
};
const stagedInitialSectionCount = 1;
const stagedSectionDelayMs = 24;

function RendererError({ title, description }: { title: string; description?: string }) {
  return (
    <section className="mx-auto max-w-4xl rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-foreground">
      <h2 className="text-lg font-semibold">{title}</h2>
      {description ? <p className="mt-2 text-sm text-muted-foreground">{description}</p> : null}
    </section>
  );
}

function getDirectComponent(name: AppJsonRenderComponentName): DirectComponent {
  return appJsonRenderComponentMap[name] as DirectComponent;
}

function initialVisibleSectionCount(sectionCount: number) {
  if (typeof window === 'undefined' || sectionCount <= stagedInitialSectionCount) {
    return sectionCount;
  }
  return stagedInitialSectionCount;
}

function useVisibleSectionCount(schema: AppUiSchema) {
  const sectionCount = schema.sections.length;
  const initialCount = initialVisibleSectionCount(sectionCount);
  const [stage, setStage] = useState<SectionStage>(() => ({
    count: initialCount,
    schema,
  }));
  const visibleCount = stage.schema === schema ? Math.min(stage.count, sectionCount) : initialCount;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let cancelled = false;
    let timeoutId: number | undefined;
    setStage((current) =>
      current.schema === schema && current.count === initialCount
        ? current
        : { count: initialCount, schema }
    );
    if (initialCount >= sectionCount) return;

    const scheduleNext = (nextCount: number) => {
      timeoutId = window.setTimeout(() => {
        if (cancelled) return;
        const count = Math.min(nextCount, sectionCount);
        setStage({ count, schema });
        if (count < sectionCount) {
          scheduleNext(count + 1);
        }
      }, stagedSectionDelayMs);
    };

    const frameId = window.requestAnimationFrame(() => {
      scheduleNext(initialCount + 1);
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [initialCount, schema, sectionCount]);

  return visibleCount;
}

function SectionCommitProbe({
  children,
  component,
  index,
  visibleSectionCount,
}: {
  children: ReactNode;
  component: string;
  index: number;
  visibleSectionCount: number;
}) {
  const renderStartedAt = renderPerfStart();
  const lastLoggedVisibleCountRef = useRef<number | null>(null);

  useEffect(() => {
    if (index !== visibleSectionCount - 1) return;
    if (lastLoggedVisibleCountRef.current === visibleSectionCount) return;
    lastLoggedVisibleCountRef.current = visibleSectionCount;
    logRenderPerf(`JsonRenderRenderer.section.${index}.${component}.commit`, renderStartedAt);
  }, [component, index, renderStartedAt, visibleSectionCount]);

  return <>{children}</>;
}

function renderDirectPreview({
  bindingRows,
  schema,
  visibleSectionCount,
}: {
  bindingRows?: Record<string, Record<string, unknown>[]>;
  schema: AppUiSchema;
  visibleSectionCount: number;
}) {
  const pageVisualIntent = {
    density: schema.density,
    tone: schema.tone,
  };
  const PageComponent = getDirectComponent(layoutComponentMap[schema.layout]);
  const pageProps = {
    title: schema.page,
    navigation: schema.navigation?.items ?? [],
    visualIntent: pageVisualIntent,
  };

  return (
    <PageComponent props={pageProps}>
      {schema.sections.slice(0, visibleSectionCount).map((section, index) => {
        const SectionComponent = getDirectComponent(
          section.component as AppJsonRenderComponentName
        );
        const rows = section.dataBindingId ? bindingRows?.[section.dataBindingId] : undefined;
        const sectionProps = {
          ...section.props,
          ...(rows && section.component === 'DataTableSection' ? { rows } : {}),
          dataBindingId: section.dataBindingId,
          actions: collectSectionRenderableActions(section, index),
          visualIntent: section.visualIntent ?? pageVisualIntent,
        };

        return (
          <SectionCommitProbe
            component={section.component}
            key={`${section.component}-${section.source}-${section.dataBindingId ?? 'static'}-${index}`}
            index={index}
            visibleSectionCount={visibleSectionCount}
          >
            <SectionComponent props={sectionProps} />
          </SectionCommitProbe>
        );
      })}
    </PageComponent>
  );
}

function JsonRenderRendererInner({
  bindingRows,
  onAction,
  onSubmitBinding,
  pendingBindingId,
  pendingActionId,
  schema,
  selectedActionId,
}: JsonRenderRendererProps) {
  const renderStartedAt = renderPerfStart();
  const validation = useMemo<{ schema: AppUiSchema | null; error: string | null }>(() => {
    const parseStartedAt = renderPerfStart();
    const parsed = appUiSchemaSchema.safeParse(schema);
    logRenderPerf('JsonRenderRenderer.schemaParse', parseStartedAt);
    if (!parsed.success) {
      return {
        schema: null,
        error: parsed.error.issues.map((issue) => issue.message).join('\n'),
      };
    }

    try {
      assertAppUiSchemaCatalog(parsed.data);
      return {
        schema: parsed.data,
        error: null,
      };
    } catch (error) {
      return {
        schema: null,
        error: error instanceof Error ? error.message : 'Invalid UI schema',
      };
    }
  }, [schema]);
  const stagedSchema = validation.schema ?? schema;
  const visibleSectionCount = useVisibleSectionCount(stagedSchema);
  const result = useMemo<{ content: ReactNode | null; error: string | null }>(() => {
    return measureRenderTask(
      'JsonRenderRenderer.preparePreview',
      () => {
        if (!validation.schema) {
          return {
            content: null,
            error: validation.error,
          };
        }

        const previewStartedAt = renderPerfStart();
        const content = renderDirectPreview({
          bindingRows,
          schema: validation.schema,
          visibleSectionCount,
        });
        logRenderPerf('JsonRenderRenderer.directPreviewTree', previewStartedAt);
        return {
          content,
          error: null,
        };
      },
      (prepared) => ({
        hasError: Boolean(prepared.error),
      })
    );
  }, [bindingRows, validation.error, validation.schema, visibleSectionCount]);

  useEffect(() => {
    logRenderPerf('JsonRenderRenderer.commit', renderStartedAt);
  });

  if (result.error) {
    return <RendererError description={result.error} title="UI schema validation failed" />;
  }

  return (
    <AppActionRenderProvider
      onAction={onAction}
      onSubmitBinding={onSubmitBinding}
      pendingActionId={pendingActionId}
      pendingBindingId={pendingBindingId}
      selectedActionId={selectedActionId}
    >
      {result.content}
    </AppActionRenderProvider>
  );
}

export const JsonRenderRenderer = memo(JsonRenderRendererInner);
JsonRenderRenderer.displayName = 'JsonRenderRenderer';
