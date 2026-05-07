import type { NormalizedEntity } from '../../../../shared/schemas/entities.schema';
import type { SourceDefinition } from '../../../../shared/schemas/sources.schema';

export function SourceItemsPanel({
  items,
  source,
}: {
  items: NormalizedEntity[];
  source?: SourceDefinition;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-[var(--ui-card-padding)]">
      <h2 className="text-lg font-semibold">Source items</h2>
      <p className="mt-1 text-muted-foreground text-sm">
        {source ? `${source.label} / ${source.kind}` : 'Select a source'}
      </p>
      <div className="mt-4 grid gap-3">
        {items.length ? (
          items.slice(0, 6).map((item) => (
            <article className="rounded-md border border-border bg-background p-3" key={item.id}>
              <h3 className="line-clamp-1 font-medium text-sm">{item.title ?? item.id}</h3>
              {item.summary ? (
                <p className="mt-1 line-clamp-2 text-muted-foreground text-sm">{item.summary}</p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2 text-muted-foreground text-xs">
                <span>{item.entityType}</span>
                {item.publishedAt ? (
                  <span>{new Date(item.publishedAt).toLocaleString()}</span>
                ) : null}
              </div>
            </article>
          ))
        ) : (
          <p className="text-muted-foreground text-sm">No source items.</p>
        )}
      </div>
    </section>
  );
}
