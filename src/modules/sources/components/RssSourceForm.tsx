import { type FormEvent, useState } from 'react';
import type {
  CreateApiSourceRequest,
  CreateMarkdownSourceRequest,
  CreatePostgresSourceRequest,
  CreateRssSourceRequest,
  SourceKind,
} from '../../../../shared/schemas/sources.schema';

export type SourceFormInput =
  | ({ kind: 'rss' } & CreateRssSourceRequest)
  | ({ kind: 'api' } & CreateApiSourceRequest)
  | ({ kind: 'markdown' } & CreateMarkdownSourceRequest)
  | ({ kind: 'postgres' } & CreatePostgresSourceRequest);

export function RssSourceForm({
  isPending,
  onSubmit,
}: {
  isPending?: boolean;
  onSubmit: (input: SourceFormInput) => void;
}) {
  const [kind, setKind] = useState<SourceKind>('rss');
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [entityType, setEntityType] = useState('rss-item');
  const [entity, setEntity] = useState('normalized-entities');
  const [itemPath, setItemPath] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (kind === 'postgres') {
      onSubmit({
        kind,
        label,
        entity: entity as CreatePostgresSourceRequest['entity'],
        entityType,
      });
      return;
    }
    const settings = itemPath.trim() ? { itemPath: itemPath.trim() } : undefined;
    onSubmit({ kind, label, url, entityType, settings } as SourceFormInput);
  };

  return (
    <section className="rounded-lg border border-border bg-card p-[var(--ui-card-padding)]">
      <h2 className="text-lg font-semibold">Add source</h2>
      <form className="mt-4 grid gap-3" onSubmit={handleSubmit}>
        <select
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          onChange={(event) => {
            const nextKind = event.target.value as SourceKind;
            setKind(nextKind);
            setEntityType(
              nextKind === 'rss' ? 'rss-item' : nextKind === 'postgres' ? 'entity-row' : nextKind
            );
          }}
          value={kind}
        >
          <option value="rss">RSS</option>
          <option value="api">API JSON</option>
          <option value="markdown">Markdown</option>
          <option value="postgres">PostgreSQL entity</option>
        </select>
        <input
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Label"
          required
          value={label}
        />
        {kind === 'postgres' ? (
          <select
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            onChange={(event) => setEntity(event.target.value)}
            value={entity}
          >
            <option value="source-definitions">Source definitions</option>
            <option value="normalized-entities">Normalized entities</option>
            <option value="cache-entries">Cache entries</option>
          </select>
        ) : (
          <input
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/feed.xml"
            required
            type="url"
            value={url}
          />
        )}
        <input
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          onChange={(event) => setEntityType(event.target.value)}
          placeholder="rss-item"
          required
          value={entityType}
        />
        {kind === 'api' ? (
          <input
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            onChange={(event) => setItemPath(event.target.value)}
            placeholder="Optional item path, e.g. data.items"
            value={itemPath}
          />
        ) : null}
        <button
          className="inline-flex h-ui items-center justify-center rounded-md bg-primary px-ui-button text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          disabled={isPending}
          type="submit"
        >
          Add {kind} source
        </button>
      </form>
    </section>
  );
}
