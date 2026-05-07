import type {
  EntityMetadata,
  EntityRow,
  NormalizedEntity,
} from '../../../../shared/schemas/entities.schema';
import type { AppUiSchema } from '../../../../shared/schemas/ui-schema.schema';
import { JsonRenderRenderer } from './JsonRenderRenderer';

export function DynamicDataPreview({
  entityMetadata,
  entityRows,
  sourceItems,
}: {
  entityMetadata?: EntityMetadata;
  entityRows: EntityRow[];
  sourceItems: NormalizedEntity[];
}) {
  const schema = buildPreviewSchema({ entityMetadata, entityRows, sourceItems });
  return (
    <section className="rounded-lg border border-border bg-card p-[var(--ui-card-padding)]">
      <h2 className="text-lg font-semibold">Dynamic page preview</h2>
      <div className="mt-4 overflow-hidden rounded-md border border-border">
        <JsonRenderRenderer schema={schema} />
      </div>
    </section>
  );
}

function buildPreviewSchema({
  entityMetadata,
  entityRows,
  sourceItems,
}: {
  entityMetadata?: EntityMetadata;
  entityRows: EntityRow[];
  sourceItems: NormalizedEntity[];
}): AppUiSchema {
  if (sourceItems.length > 0) {
    const firstSource = sourceItems[0]?.source;
    if (firstSource === 'postgres' || firstSource === 'api') {
      return {
        page: 'Source item preview',
        intent: 'Preview normalized source items through App UI Schema',
        layout: 'entity-list',
        sections: [
          {
            component: 'DataTableSection',
            source: firstSource,
            props: {
              title: 'Source items',
              columns: [
                { key: 'title', label: 'Title' },
                { key: 'entityType', label: 'Entity Type' },
                { key: 'updatedAt', label: 'Updated' },
              ],
              rows: sourceItems.slice(0, 8),
            },
          },
        ],
      };
    }

    return {
      page: 'Source item preview',
      intent: 'Preview normalized source items through App UI Schema',
      layout: 'article-feed',
      sections: [
        {
          component: 'TimelineSection',
          source: firstSource === 'markdown' ? 'markdown' : 'rss',
          props: {
            title: 'Latest source items',
            items: sourceItems.slice(0, 6).map((item) => ({
              title: item.title ?? item.id,
              timestamp: item.publishedAt ?? item.updatedAt,
              description: item.summary ?? item.body,
            })),
          },
        },
      ],
    };
  }

  return {
    page: entityMetadata ? `${entityMetadata.label} preview` : 'Entity preview',
    intent: 'Preview entity rows through App UI Schema',
    layout: 'entity-list',
    sections: [
      {
        component: 'DataTableSection',
        source: 'postgres',
        props: {
          title: entityMetadata?.label ?? 'Entity rows',
          columns: (entityMetadata?.views.list ?? []).map((field) => ({
            key: field,
            label: entityMetadata?.fields.find((item) => item.name === field)?.label ?? field,
          })),
          rows: entityRows.slice(0, 8),
        },
      },
    ],
  };
}
