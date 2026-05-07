import type { ComponentRenderProps, Spec } from '@json-render/react';
import { JSONUIProvider, Renderer } from '@json-render/react';
import { useMemo } from 'react';
import type { AppAction, AppUiSchema } from '../../../../shared/schemas/ui-schema.schema';
import { appUiSchemaSchema } from '../../../../shared/schemas/ui-schema.schema';
import { AppActionRenderProvider } from '../../component-registry/components/AppActionControl';
import { appJsonRenderRegistry } from '../../component-registry/components/registry';
import { appUiSchemaToJsonRenderSpec } from '../services/ui-schema-to-json-render.service';

type JsonRenderRendererProps = {
  onAction?: (action: AppAction) => void;
  pendingActionId?: string | null;
  schema: AppUiSchema;
};

function RendererError({ title, description }: { title: string; description?: string }) {
  return (
    <section className="mx-auto max-w-4xl rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-foreground">
      <h2 className="text-lg font-semibold">{title}</h2>
      {description ? <p className="mt-2 text-sm text-muted-foreground">{description}</p> : null}
    </section>
  );
}

function UnknownComponentFallback({ element }: ComponentRenderProps) {
  return (
    <RendererError
      description={`Component "${element.type}" is not registered in the app catalog.`}
      title="Unknown renderer component"
    />
  );
}

export function JsonRenderRenderer({ onAction, pendingActionId, schema }: JsonRenderRendererProps) {
  const result = useMemo<{ spec: Spec | null; error: string | null }>(() => {
    const parsed = appUiSchemaSchema.safeParse(schema);
    if (!parsed.success) {
      return { spec: null, error: parsed.error.issues.map((issue) => issue.message).join('\n') };
    }

    try {
      return {
        spec: appUiSchemaToJsonRenderSpec(parsed.data),
        error: null,
      };
    } catch (error) {
      return { spec: null, error: error instanceof Error ? error.message : 'Invalid UI schema' };
    }
  }, [schema]);

  if (result.error) {
    return <RendererError description={result.error} title="UI schema validation failed" />;
  }

  return (
    <AppActionRenderProvider onAction={onAction} pendingActionId={pendingActionId}>
      <JSONUIProvider initialState={result.spec?.state ?? {}} registry={appJsonRenderRegistry}>
        <Renderer
          fallback={UnknownComponentFallback}
          registry={appJsonRenderRegistry}
          spec={result.spec}
        />
      </JSONUIProvider>
    </AppActionRenderProvider>
  );
}
