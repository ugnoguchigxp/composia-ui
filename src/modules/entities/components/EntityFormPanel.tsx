import type { EntityMetadata, EntityRow } from '../../../../shared/schemas/entities.schema';

export function EntityFormPanel({
  metadata,
  row,
}: {
  metadata?: EntityMetadata;
  row?: EntityRow | null;
}) {
  const fields = metadata?.views.form ?? metadata?.views.detail ?? [];
  const isReadonly = metadata?.mode !== 'readwrite';

  return (
    <section className="rounded-lg border border-border bg-card p-[var(--ui-card-padding)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Entity form</h2>
          <p className="mt-1 text-muted-foreground text-sm">
            {isReadonly
              ? 'Readonly metadata is displayed without write actions.'
              : 'Edit entity row'}
          </p>
        </div>
        <span className="rounded-md border border-border px-2 py-1 text-muted-foreground text-xs">
          {metadata?.mode ?? 'none'}
        </span>
      </div>
      <div className="mt-4 grid gap-3">
        {metadata && row ? (
          fields.map((field) => (
            <label className="grid gap-1 text-sm" key={field}>
              <span className="text-muted-foreground">
                {metadata.fields.find((item) => item.name === field)?.label ?? field}
              </span>
              <input
                className="rounded-md border border-input bg-background px-3 py-2"
                disabled={isReadonly}
                readOnly={isReadonly}
                value={formatValue(row[field])}
              />
            </label>
          ))
        ) : (
          <p className="text-muted-foreground text-sm">Select a row to populate the form.</p>
        )}
      </div>
    </section>
  );
}

function formatValue(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
