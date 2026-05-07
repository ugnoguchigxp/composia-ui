import { randomUUID } from 'node:crypto';
import type { EntityRow } from '../../../../shared/schemas/entities.schema';
import type { EntitiesRepository, EntityTableName } from '../../entities/entities.repository';
import { isEntityTableName } from '../../entities/entities.repository';
import type { SourceAdapterItem, SourceAdapterSettings } from './source-adapter.types';

function textField(row: EntityRow, field?: string): string | undefined {
  if (!field) return undefined;
  const value = row[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'object') return JSON.stringify(value);
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

function firstText(row: EntityRow, fields: string[]) {
  for (const field of fields) {
    const text = textField(row, field);
    if (text) return text;
  }
  return undefined;
}

function parseTags(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value.map((tag) => String(tag).trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  return undefined;
}

function parseDate(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export async function fetchPostgresItems(
  entity: string | undefined,
  repo: Pick<EntitiesRepository, 'list'>,
  settings: SourceAdapterSettings = {}
): Promise<SourceAdapterItem[]> {
  const entityName = entity ?? settings.entity;
  if (!entityName || !isEntityTableName(entityName)) {
    throw new Error('PostgreSQL source requires an allowlisted entity name');
  }

  const rows = await repo.list(entityName as EntityTableName);
  return rows.map((row) => {
    const title = firstText(row, [settings.titleField ?? 'title', 'name', 'label', 'key', 'email']);
    return {
      externalId: firstText(row, ['id', 'externalId', 'key']) ?? randomUUID(),
      title,
      body: firstText(row, [settings.bodyField ?? 'body', 'content', 'description', 'value']),
      summary: firstText(row, [settings.summaryField ?? 'summary', 'description']),
      url: firstText(row, [settings.urlField ?? 'url', 'href', 'link']),
      author: firstText(row, [settings.authorField ?? 'author', 'creator']),
      tags: parseTags(row[settings.tagsField ?? 'tags']),
      publishedAt: parseDate(
        firstText(row, [settings.publishedAtField ?? 'publishedAt', 'createdAt'])
      ),
      sourceUpdatedAt: parseDate(firstText(row, [settings.updatedAtField ?? 'updatedAt'])),
      raw: row,
    };
  });
}
