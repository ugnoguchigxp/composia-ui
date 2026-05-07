import { desc, eq } from 'drizzle-orm';
import type { EntityRow } from '../../../shared/schemas/entities.schema';
import { db } from '../../db/client';
import { cacheEntries, normalizedEntities, sourceDefinitions } from '../../db/schema';

export type EntityTableName = 'source-definitions' | 'normalized-entities' | 'cache-entries';

const tableMap = {
  'source-definitions': sourceDefinitions,
  'normalized-entities': normalizedEntities,
  'cache-entries': cacheEntries,
} as const;

function toPlainRow(row: Record<string, unknown>): EntityRow {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      value instanceof Date ? value.toISOString() : value,
    ])
  );
}

export type EntitiesRepository = {
  findById: (entity: EntityTableName, id: string) => Promise<EntityRow | null>;
  list: (entity: EntityTableName) => Promise<EntityRow[]>;
};

export const entitiesRepository: EntitiesRepository = {
  findById: async (entity, id) => {
    const table = tableMap[entity];
    const [row] = await db.select().from(table).where(eq(table.id, id)).limit(1);
    return row ? toPlainRow(row) : null;
  },
  list: async (entity) => {
    const table = tableMap[entity];
    const rows = await db.select().from(table).orderBy(desc(table.updatedAt)).limit(50);
    return rows.map((row) => toPlainRow(row));
  },
};

export function isEntityTableName(value: string): value is EntityTableName {
  return value in tableMap;
}
