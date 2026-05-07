import type { SourceDefinition } from '../../../../shared/schemas/sources.schema';

export function SourceList({
  isBusy,
  onRefresh,
  onSelect,
  selectedSourceId,
  sources,
}: {
  isBusy?: boolean;
  onRefresh: (sourceId: string) => void;
  onSelect?: (sourceId: string) => void;
  selectedSourceId?: string | null;
  sources: SourceDefinition[];
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-[var(--ui-card-padding)]">
      <h2 className="text-lg font-semibold">Sources</h2>
      <div className="mt-4 grid gap-3">
        {sources.length ? (
          sources.map((source) => (
            <article
              className={
                selectedSourceId === source.id
                  ? 'rounded-md border border-primary bg-primary/5 p-4'
                  : 'rounded-md border border-border bg-background p-4'
              }
              key={source.id}
            >
              <div className="flex items-start justify-between gap-4">
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => onSelect?.(source.id)}
                  type="button"
                >
                  <h3 className="truncate font-medium">{source.label}</h3>
                  <p className="mt-1 truncate text-muted-foreground text-sm">{source.url}</p>
                  <p className="mt-2 text-muted-foreground text-xs">
                    {source.kind} / {source.entityType}
                  </p>
                </button>
                <button
                  className="inline-flex h-ui shrink-0 items-center rounded-md border border-border px-ui-button text-sm hover:bg-secondary disabled:opacity-50"
                  disabled={isBusy}
                  onClick={() => onRefresh(source.id)}
                  type="button"
                >
                  Refresh
                </button>
              </div>
            </article>
          ))
        ) : (
          <p className="text-muted-foreground text-sm">No sources registered.</p>
        )}
      </div>
    </section>
  );
}
