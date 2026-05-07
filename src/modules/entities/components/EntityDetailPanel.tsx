import type { EntityMetadata, EntityRow } from '../../../../shared/schemas/entities.schema';

export function EntityDetailPanel({
  metadata,
  row,
}: {
  metadata?: EntityMetadata;
  row?: EntityRow | null;
}) {
  const fields = metadata?.views.detail ?? [];

  return (
    <section className="rounded-lg border border-border bg-card p-[var(--ui-card-padding)]">
      <h2 className="text-lg font-semibold">Entity detail</h2>
      <p className="mt-1 text-muted-foreground text-sm">
        {metadata ? metadata.label : 'Select an entity row'}
      </p>
      {row && metadata ? (
        <dl className="mt-4 grid gap-3">
          {fields.map((field) => (
            <div className="rounded-md border border-border bg-background p-3" key={field}>
              <dt className="text-muted-foreground text-xs">
                {metadata.fields.find((item) => item.name === field)?.label ?? field}
              </dt>
              <dd className="mt-1 break-words text-sm">{formatValue(row[field])}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-4 text-muted-foreground text-sm">No row selected.</p>
      )}
    </section>
  );
}

function formatValue(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}
