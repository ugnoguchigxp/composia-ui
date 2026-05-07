import type { EntityMetadata, EntityRow } from '../../../../shared/schemas/entities.schema';

export function EntityTable({
  metadata,
  onSelectRow,
  rows,
  selectedRowId,
}: {
  metadata?: EntityMetadata;
  onSelectRow?: (row: EntityRow) => void;
  rows: EntityRow[];
  selectedRowId?: string | null;
}) {
  const fields = metadata?.views.list ?? [];

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card p-[var(--ui-card-padding)]">
      <h2 className="text-lg font-semibold">{metadata?.label ?? 'Entity rows'}</h2>
      <div className="mt-4 overflow-x-auto rounded-md border border-border bg-background">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              {fields.map((field) => (
                <th className="px-ui py-ui font-medium" key={field}>
                  {metadata?.fields.find((item) => item.name === field)?.label ?? field}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const rowId = String(row.id ?? index);
              return (
                <tr
                  className={
                    selectedRowId === rowId
                      ? 'cursor-pointer border-t border-primary bg-primary/5'
                      : 'cursor-pointer border-t border-border hover:bg-secondary/50'
                  }
                  key={rowId}
                  onClick={() => onSelectRow?.(row)}
                >
                  {fields.map((field) => (
                    <td className="max-w-xs truncate px-ui py-ui" key={field}>
                      {formatValue(row[field])}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className="border-t border-border px-ui py-ui text-muted-foreground text-sm">
            No rows.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function formatValue(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
