import type { SourceAdapterItem, SourceAdapterSettings } from './source-adapter.types';

function parseFrontmatter(text: string) {
  if (!text.startsWith('---')) return { body: text.trim(), metadata: {} as Record<string, string> };

  const closing = text.indexOf('\n---', 3);
  if (closing === -1) return { body: text.trim(), metadata: {} as Record<string, string> };

  const frontmatter = text.slice(3, closing).trim();
  const body = text.slice(closing + 4).trim();
  const metadata = Object.fromEntries(
    frontmatter
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf(':');
        if (separator === -1) return [line, ''];
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
      })
  );

  return { body, metadata };
}

function firstHeading(body: string) {
  const heading = body
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('# '));
  return heading?.replace(/^#\s+/, '').trim();
}

function parseDate(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseTags(value?: string) {
  if (!value) return undefined;
  return value
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .split(',')
    .map((tag) => tag.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

export async function fetchMarkdownItems(
  url: string,
  settings: SourceAdapterSettings = {}
): Promise<SourceAdapterItem[]> {
  const response = await fetch(url, {
    headers: { Accept: 'text/markdown, text/plain;q=0.9, */*;q=0.1' },
  });
  if (!response.ok) {
    throw new Error(`Markdown source fetch failed with status ${response.status}`);
  }

  const markdown = await response.text();
  const { body, metadata } = parseFrontmatter(markdown);
  const title = metadata[settings.titleField ?? 'title'] ?? firstHeading(body) ?? url;
  const summary =
    metadata[settings.summaryField ?? 'summary'] ??
    body
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith('#'));

  return [
    {
      externalId: metadata.id ?? url,
      title,
      body,
      summary,
      url,
      author: metadata[settings.authorField ?? 'author'],
      tags: parseTags(metadata[settings.tagsField ?? 'tags']),
      publishedAt: parseDate(metadata[settings.publishedAtField ?? 'publishedAt']),
      sourceUpdatedAt: parseDate(metadata[settings.updatedAtField ?? 'updatedAt']),
      raw: { metadata, markdown },
    },
  ];
}
