import { randomUUID } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import type { SourceAdapterItem } from './source-adapter.types';

export type RssAdapterItem = SourceAdapterItem;

const parser = new XMLParser({
  attributeNamePrefix: '@_',
  ignoreAttributes: false,
  textNodeName: '#text',
});

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function textValue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const text = String(value).trim();
    return text.length > 0 ? text : undefined;
  }
  if (typeof value === 'object' && '#text' in value) {
    return textValue((value as { '#text'?: unknown })['#text']);
  }
  return undefined;
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const text = textValue(value);
    if (text) return text;
  }
  return undefined;
}

function parseDate(value: unknown): Date | undefined {
  const text = textValue(value);
  if (!text) return undefined;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function linkFromAtom(link: unknown): string | undefined {
  for (const item of asArray(link)) {
    if (typeof item === 'string') return item;
    if (typeof item === 'object' && item !== null) {
      const attrs = item as { '@_href'?: unknown; '@_rel'?: unknown };
      if (!attrs['@_rel'] || attrs['@_rel'] === 'alternate') {
        return textValue(attrs['@_href']);
      }
    }
  }
  return undefined;
}

function itemCategories(item: Record<string, unknown>) {
  return asArray(item.category)
    .map((category) => textValue(category))
    .filter((category): category is string => Boolean(category));
}

function normalizeRssItem(item: Record<string, unknown>): RssAdapterItem {
  const url = firstText(item.link);
  const externalId = firstText(item.guid, url, item.title) ?? randomUUID();
  return {
    externalId,
    title: firstText(item.title),
    body: firstText(item['content:encoded'], item.description),
    summary: firstText(item.description),
    url,
    author: firstText(item.author, item['dc:creator']),
    tags: itemCategories(item),
    publishedAt: parseDate(item.pubDate),
    sourceUpdatedAt: parseDate(item['atom:updated']),
    raw: item,
  };
}

function normalizeAtomItem(item: Record<string, unknown>): RssAdapterItem {
  const url = linkFromAtom(item.link);
  const externalId = firstText(item.id, url, item.title) ?? randomUUID();
  return {
    externalId,
    title: firstText(item.title),
    body: firstText(item.content, item.summary),
    summary: firstText(item.summary),
    url,
    author:
      typeof item.author === 'object' && item.author !== null
        ? firstText((item.author as { name?: unknown }).name)
        : firstText(item.author),
    tags: itemCategories(item),
    publishedAt: parseDate(item.published),
    sourceUpdatedAt: parseDate(item.updated),
    raw: item,
  };
}

export async function fetchRssItems(url: string): Promise<RssAdapterItem[]> {
  const response = await fetch(url, {
    headers: {
      Accept:
        'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1',
    },
  });
  if (!response.ok) {
    throw new Error(`RSS fetch failed with status ${response.status}`);
  }

  const parsed = parser.parse(await response.text()) as Record<string, unknown>;
  const rssChannel = (parsed.rss as { channel?: unknown } | undefined)?.channel;
  if (typeof rssChannel === 'object' && rssChannel !== null) {
    const items = asArray((rssChannel as { item?: unknown }).item);
    return items
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map(normalizeRssItem);
  }

  const feed = parsed.feed;
  if (typeof feed === 'object' && feed !== null) {
    const entries = asArray((feed as { entry?: unknown }).entry);
    return entries
      .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
      .map(normalizeAtomItem);
  }

  return [];
}
