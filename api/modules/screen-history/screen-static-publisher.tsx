import type { ComponentType, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { collectSectionRenderableActions } from '../../../shared/schemas/ui-action-collector';
import type { AppUiLayout, AppUiSchema } from '../../../shared/schemas/ui-schema.schema';
import { appUiSchemaSchema } from '../../../shared/schemas/ui-schema.schema';
import { AppActionRenderProvider } from '../../../src/modules/component-registry/components/AppActionControl';
import { appJsonRenderComponentMap } from '../../../src/modules/component-registry/components/registry';
import { assertAppUiSchemaCatalog } from '../../../src/modules/component-registry/services/registry.service';

type DirectComponentProps = {
  children?: ReactNode;
  props: Record<string, unknown>;
};

type DirectComponent = ComponentType<DirectComponentProps>;
type AppJsonRenderComponentName = keyof typeof appJsonRenderComponentMap;

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

function getDirectComponent(name: AppJsonRenderComponentName): DirectComponent {
  return appJsonRenderComponentMap[name] as DirectComponent;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function PublishedScreen({ schema }: { schema: AppUiSchema }) {
  const pageVisualIntent = {
    density: schema.density,
    tone: schema.tone,
  };
  const PageComponent = getDirectComponent(layoutComponentMap[schema.layout]);

  return (
    <AppActionRenderProvider>
      <PageComponent
        props={{
          title: schema.page,
          navigation: schema.navigation?.items ?? [],
          visualIntent: pageVisualIntent,
        }}
      >
        {schema.sections.map((section, index) => {
          const SectionComponent = getDirectComponent(
            section.component as AppJsonRenderComponentName
          );
          return (
            <SectionComponent
              key={`${section.component}-${section.source}-${section.dataBindingId ?? 'static'}-${index}`}
              props={{
                ...section.props,
                actions: collectSectionRenderableActions(section, index),
                dataBindingId: section.dataBindingId,
                visualIntent: section.visualIntent ?? pageVisualIntent,
              }}
            />
          );
        })}
      </PageComponent>
    </AppActionRenderProvider>
  );
}

export function renderPublishedScreenHtml(input: AppUiSchema) {
  const schema = appUiSchemaSchema.parse(input);
  assertAppUiSchemaCatalog(schema);
  const body = renderToStaticMarkup(<PublishedScreen schema={schema} />);
  const title = escapeHtml(schema.page);

  return [
    '<!doctype html>',
    '<html lang="ja">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="generator" content="composia-ui static publisher">',
    `<title>${title}</title>`,
    '<style>body{margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#fff;color:#111827}a{color:inherit}</style>',
    '</head>',
    '<body>',
    `<main data-composia-static-screen="true">${body}</main>`,
    '</body>',
    '</html>',
  ].join('');
}
