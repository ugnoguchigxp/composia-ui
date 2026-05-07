import { randomUUID } from 'node:crypto';
import type { SourceAdapterItem, SourceAdapterSettings } from './source-adapter.types';

function valueAtPath(value: unknown, path?: string): unknown {
  if (!path) return value;
  return path.split('.').reduce<unknown>((current, segment) => {
    if (typeof current !== 'object' || current === null) return undefined;
    return (current as Record<string, unknown>)[segment];
  }, value);
}

function textField(record: Record<string, unknown>, field?: string): string | undefined {
  const value = field ? valueAtPath(record, field) : undefined;
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

function firstText(record: Record<string, unknown>, fields: string[]) {
  for (const field of fields) {
    const text = textField(record, field);
    if (text) return text;
  }
  return undefined;
}

function tagsField(record: Record<string, unknown>, field?: string): string[] | undefined {
  const value = field ? valueAtPath(record, field) : record.tags;
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return undefined;
}

function dateField(record: Record<string, unknown>, field?: string): Date | undefined {
  const text = textField(record, field);
  if (!text) return undefined;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function recordsFromPayload(payload: unknown, itemPath?: string) {
  const value = valueAtPath(payload, itemPath);
  if (Array.isArray(value)) return value;
  if (typeof value === 'object' && value !== null) {
    const object = value as { items?: unknown; data?: unknown; results?: unknown };
    if (Array.isArray(object.items)) return object.items;
    if (Array.isArray(object.data)) return object.data;
    if (Array.isArray(object.results)) return object.results;
    return [value];
  }
  return [];
}

export async function fetchApiItems(
  url: string,
  settings: SourceAdapterSettings = {}
): Promise<SourceAdapterItem[]> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`API source fetch failed with status ${response.status}`);
  }

  const payload = await response.json();
  return recordsFromPayload(payload, settings.itemPath)
    .filter(
      (record): record is Record<string, unknown> => typeof record === 'object' && record !== null
    )
    .map((record) => {
      const title = firstText(record, [settings.titleField ?? 'title', 'name', 'label', 'key']);
      const urlValue = firstText(record, [settings.urlField ?? 'url', 'href', 'link']);
      return {
        externalId:
          firstText(record, ['externalId', 'id', 'uuid', settings.urlField ?? 'url', 'title']) ??
          randomUUID(),
        title,
        body: firstText(record, [settings.bodyField ?? 'body', 'content', 'description']),
        summary: firstText(record, [settings.summaryField ?? 'summary', 'description', 'excerpt']),
        url: urlValue,
        author: firstText(record, [settings.authorField ?? 'author', 'creator']),
        tags: tagsField(record, settings.tagsField),
        publishedAt: dateField(record, settings.publishedAtField ?? 'publishedAt'),
        sourceUpdatedAt: dateField(record, settings.updatedAtField ?? 'updatedAt'),
        raw: record,
      };
    });
}
