import type { CacheStatus } from '../../../../shared/schemas/cache.schema';

export function CacheStatusPanel({
  cache,
  isBusy,
  onInvalidate,
  onRebuild,
}: {
  cache?: CacheStatus;
  isBusy?: boolean;
  onInvalidate: () => void;
  onRebuild: () => void;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-[var(--ui-card-padding)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Cache</h2>
          <p className="mt-1 text-muted-foreground text-sm">
            {cache ? `${cache.totalEntries} active entries` : 'Loading cache status'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="inline-flex h-ui items-center rounded-md border border-border px-ui-button text-sm hover:bg-secondary disabled:opacity-50"
            disabled={isBusy}
            onClick={onRebuild}
            type="button"
          >
            Rebuild
          </button>
          <button
            className="inline-flex h-ui items-center rounded-md bg-destructive px-ui-button text-destructive-foreground text-sm hover:bg-destructive/90 disabled:opacity-50"
            disabled={isBusy}
            onClick={onInvalidate}
            type="button"
          >
            Invalidate
          </button>
        </div>
      </div>
      <div className="mt-4 grid gap-2">
        {cache?.namespaces.length ? (
          cache.namespaces.map((namespace) => (
            <div
              className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm"
              key={namespace.namespace}
            >
              <span className="font-medium">{namespace.namespace}</span>
              <span className="text-muted-foreground">{namespace.entries}</span>
            </div>
          ))
        ) : (
          <p className="text-muted-foreground text-sm">No cache entries.</p>
        )}
      </div>
    </section>
  );
}
