import type { AppUiSchema } from '../../../../shared/schemas/ui-schema.schema';
import { appUiSchemaSchema } from '../../../../shared/schemas/ui-schema.schema';

const sampleSchemas: Record<string, AppUiSchema> = {
  sample: appUiSchemaSchema.parse({
    page: 'Generated Screen Sample',
    intent: 'A fixed App UI Schema rendered through the json-render catalog and registry.',
    layout: 'dashboard',
    density: 'normal',
    tone: 'neutral',
    sections: [
      {
        component: 'KpiSummarySection',
        source: 'summary',
        props: {
          title: 'Registry coverage',
          items: [
            {
              label: 'Catalog components',
              value: 13,
              description: 'High-level components are exposed to schema generation.',
            },
            {
              label: 'Render path',
              value: 'Validated',
              description: 'Props are checked before json-render receives the spec.',
            },
            {
              label: 'Theme source',
              value: 'Root CSS',
              description: 'Tokens and themes no longer depend on designSystem imports.',
            },
          ],
        },
      },
      {
        component: 'InsightPanel',
        source: 'summary',
        visualIntent: {
          tone: 'primary',
          emphasis: 'medium',
        },
        props: {
          title: 'App UI Schema boundary',
          body: 'The app keeps a higher-level schema and converts it into the json-render flat spec only after catalog and props validation.',
          action: {
            label: 'View plan',
            href: '/history',
          },
        },
      },
      {
        component: 'ImageSection',
        source: 'app',
        props: {
          title: 'Image-capable schema',
          description: 'Images are validated as catalog props before rendering.',
          image: {
            src: 'https://picsum.photos/seed/composia-ai-sample/1200/720',
            alt: 'Abstract workspace preview',
            caption: 'Remote image rendered from an allowlisted URL.',
            credit: 'Image source: picsum.photos',
          },
          aspectRatio: 'wide',
        },
      },
      {
        component: 'DataTableSection',
        source: 'postgres',
        props: {
          title: 'Entity preview',
          description: 'A sample table rendered by a catalog section component.',
          columns: [
            { key: 'name', label: 'Entity' },
            { key: 'source', label: 'Source' },
            { key: 'mode', label: 'Mode' },
          ],
          rows: [
            { name: 'users', source: 'postgres', mode: 'readwrite' },
            { name: 'rss items', source: 'rss', mode: 'readonly' },
            { name: 'layout decisions', source: 'cache', mode: 'readonly' },
          ],
        },
      },
    ],
  }),
};

export const uiSchemaPreviewRepository = {
  getPreview: async (pageId: string) => sampleSchemas[pageId] ?? sampleSchemas.sample,
};
