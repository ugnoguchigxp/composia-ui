import type { EntityMetadata } from '../../../../shared/schemas/entities.schema';

export function EntityMetadataList({
  entities,
  onSelect,
  selected,
}: {
  entities: EntityMetadata[];
  onSelect: (entity: string) => void;
  selected?: string | null;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-[var(--ui-card-padding)]">
      <h2 className="text-lg font-semibold">Entities</h2>
      <div className="mt-4 grid gap-2">
        {entities.map((entity) => (
          <button
            className={
              selected === entity.name
                ? 'rounded-md border border-primary bg-primary/10 px-3 py-2 text-left text-sm'
                : 'rounded-md border border-border bg-background px-3 py-2 text-left text-sm hover:bg-secondary'
            }
            key={entity.name}
            onClick={() => onSelect(entity.name)}
            type="button"
          >
            <div className="font-medium">{entity.label}</div>
            <div className="mt-1 text-muted-foreground text-xs">
              {entity.source} / {entity.mode}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
