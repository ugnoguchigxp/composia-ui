import type { Spec } from '@json-render/react';
import type { AppUiLayout, AppUiSchema } from '../../../../shared/schemas/ui-schema.schema';
import { appUiSchemaSchema } from '../../../../shared/schemas/ui-schema.schema';
import { assertAppUiSchemaCatalog } from '../../component-registry/services/registry.service';

export type AppUiSchemaToJsonRenderOptions = {
  bindingRows?: Record<string, Record<string, unknown>[]>;
};

const layoutComponentMap: Record<AppUiLayout, string> = {
  dashboard: 'DashboardPage',
  'entity-list': 'EntityListPage',
  'entity-detail': 'EntityDetailPage',
  form: 'EditableFormPage',
  'article-feed': 'ArticleFeedPage',
  admin: 'DashboardPage',
  screen: 'DashboardPage',
  sidebar: 'SidebarPage',
};

function elementKey(prefix: string, value: string, index?: number) {
  const safe = slugifyAscii(value);
  return [prefix, safe || 'element', index].filter((part) => part !== undefined).join('-');
}

function slugifyAscii(value: string) {
  let output = '';
  let pendingSeparator = false;

  for (const char of value.toLowerCase()) {
    const isAsciiLetter = char >= 'a' && char <= 'z';
    const isAsciiNumber = char >= '0' && char <= '9';

    if (isAsciiLetter || isAsciiNumber) {
      if (pendingSeparator && output) {
        output += '-';
      }
      output += char;
      pendingSeparator = false;
      continue;
    }

    pendingSeparator = true;
  }

  return output;
}

export function appUiSchemaToJsonRenderSpec(
  input: AppUiSchema,
  options: AppUiSchemaToJsonRenderOptions = {}
): Spec {
  const schema = appUiSchemaSchema.parse(input);
  assertAppUiSchemaCatalog(schema);

  const root = elementKey('page', schema.page);
  const childKeys = schema.sections.map((section, index) =>
    elementKey('section', section.component, index)
  );
  const pageVisualIntent = {
    density: schema.density,
    tone: schema.tone,
  };

  return {
    root,
    elements: {
      [root]: {
        type: layoutComponentMap[schema.layout],
        props: {
          title: schema.page,
          description: schema.intent,
          navigation: schema.navigation?.items ?? [],
          visualIntent: pageVisualIntent,
        },
        children: childKeys,
      },
      ...Object.fromEntries(
        schema.sections.map((section, index) => {
          const key = childKeys[index];
          const rows = section.dataBindingId
            ? options.bindingRows?.[section.dataBindingId]
            : undefined;
          return [
            key,
            {
              type: section.component,
              props: {
                ...section.props,
                ...(rows && section.component === 'DataTableSection' ? { rows } : {}),
                dataBindingId: section.dataBindingId,
                actions: section.actions ?? [],
                visualIntent: section.visualIntent ?? pageVisualIntent,
              },
              children: [],
            },
          ];
        })
      ),
    },
    state: {},
  };
}
