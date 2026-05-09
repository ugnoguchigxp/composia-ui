import type postgres from 'postgres';
import type {
  DatabaseScalarType,
  DatabaseTable,
  SandboxRelationAttachRequest,
  SandboxRowResponse,
  SandboxRowsResponse,
  SandboxStateResponse,
  SandboxTableState,
} from '../../../shared/schemas/database-design.schema';
import { NotFoundError, ValidationError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import type { DatabaseDesignRepository } from './database-design.repository';
import { createRuntimeInsertSchema, createRuntimeUpdateSchema } from './runtime-zod.service';
import { getSandboxSql } from './sandbox-client';

function quoteIdent(identifier: string) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function durationMs(startedAt: number) {
  return Date.now() - startedAt;
}

function quoteLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlValue(tableSchema: DatabaseTable, field: string, value: unknown) {
  const column = tableSchema.columns.find((candidate) => candidate.name === field);
  if (!column) throw new ValidationError(`Column "${field}" is not in the active schema`);
  if (value === null) return 'NULL';
  if (column.type === 'jsonb') return `${quoteLiteral(JSON.stringify(value))}::jsonb`;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return quoteLiteral(String(value));
}

async function assertPublicTable(sandboxSql: postgres.Sql, table: string) {
  const rows = await sandboxSql.unsafe(
    `SELECT 1
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND c.relname = ${quoteLiteral(table)}
     LIMIT 1`
  );
  if (!rows[0]) throw new NotFoundError(`Sandbox table "${table}" was not found`);
}

type IntrospectionColumnRow = {
  default_value: string | null;
  is_enum: boolean;
  name: string;
  nullable: boolean;
  primary_key: boolean;
  table_name: string;
  type: string;
};

type IntrospectionTableRow = {
  name: string;
  row_count: number | string | null;
};

type IntrospectionIndexRow = {
  columns: string[] | string;
  name: string;
  table_name: string;
  unique: boolean;
};

type IntrospectionForeignKeyRow = {
  column: string;
  name: string;
  on_delete: string | null;
  references_column: string;
  references_table: string;
  table_name: string;
};

function scalarType(type: string, isEnum: boolean): DatabaseScalarType {
  if (isEnum) return 'enum';
  const normalized = type.toLowerCase();
  if (normalized === 'uuid') return 'uuid';
  if (normalized === 'text') return 'text';
  if (normalized === 'character varying' || normalized.startsWith('character varying(')) {
    return 'varchar';
  }
  if (normalized === 'varchar' || normalized.startsWith('varchar(')) return 'varchar';
  if (normalized === 'integer') return 'integer';
  if (normalized === 'bigint') return 'bigint';
  if (normalized === 'numeric' || normalized.startsWith('numeric(')) return 'numeric';
  if (normalized === 'boolean') return 'boolean';
  if (normalized === 'date') return 'date';
  if (normalized.startsWith('timestamp')) return 'timestamp';
  if (normalized === 'jsonb') return 'jsonb';
  return 'text';
}

async function introspectSandboxTables(
  repo: DatabaseDesignRepository,
  sandboxSql: postgres.Sql
): Promise<SandboxTableState[]> {
  const startedAt = Date.now();
  const tableRowsStartedAt = Date.now();
  const tableRows = (await sandboxSql.unsafe(
    `SELECT
       c.relname AS name,
       GREATEST(COALESCE(s.n_live_tup, c.reltuples, 0), 0)::int AS row_count
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
     ORDER BY c.relname`
  )) as IntrospectionTableRow[];
  const tableRowsDurationMs = durationMs(tableRowsStartedAt);
  const tableNames = tableRows.map((table) => table.name);
  if (tableNames.length === 0) {
    logger.debug(
      {
        durationMs: durationMs(startedAt),
        tableCount: 0,
        tableRowsDurationMs,
      },
      'SandboxDB table introspection completed'
    );
    return [];
  }

  const detailStartedAt = Date.now();
  const [columns, indexes, foreignKeys, managedObjects] = await Promise.all([
    sandboxSql.unsafe(
      `SELECT
         c.relname AS table_name,
         a.attname AS name,
         format_type(a.atttypid, a.atttypmod) AS type,
         t.typtype = 'e' AS is_enum,
         NOT a.attnotnull AS nullable,
         pg_get_expr(ad.adbin, ad.adrelid) AS default_value,
         EXISTS (
           SELECT 1
           FROM pg_index i
           WHERE i.indrelid = c.oid
             AND i.indisprimary
             AND a.attnum = ANY(i.indkey)
         ) AS primary_key
       FROM pg_attribute a
       JOIN pg_class c ON c.oid = a.attrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_type t ON t.oid = a.atttypid
       LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
       WHERE n.nspname = 'public'
         AND c.relkind = 'r'
         AND a.attnum > 0
         AND NOT a.attisdropped
       ORDER BY c.relname, a.attnum`
    ) as Promise<IntrospectionColumnRow[]>,
    sandboxSql.unsafe(
      `SELECT
         table_class.relname AS table_name,
         index_class.relname AS name,
         idx.indisunique AS unique,
         array_agg(attribute.attname ORDER BY keys.ordinality) AS columns
       FROM pg_index idx
       JOIN pg_class table_class ON table_class.oid = idx.indrelid
       JOIN pg_namespace namespace ON namespace.oid = table_class.relnamespace
       JOIN pg_class index_class ON index_class.oid = idx.indexrelid
       JOIN LATERAL unnest(idx.indkey) WITH ORDINALITY AS keys(attnum, ordinality) ON true
       JOIN pg_attribute attribute
         ON attribute.attrelid = table_class.oid
        AND attribute.attnum = keys.attnum
       WHERE namespace.nspname = 'public'
         AND table_class.relkind = 'r'
         AND NOT idx.indisprimary
       GROUP BY table_class.relname, index_class.relname, idx.indisunique
       ORDER BY table_class.relname, index_class.relname`
    ) as Promise<IntrospectionIndexRow[]>,
    sandboxSql.unsafe(
      `SELECT
         constraint_row.conname AS name,
         child_table.relname AS table_name,
         child_attribute.attname AS column,
         parent_table.relname AS references_table,
         parent_attribute.attname AS references_column,
         CASE constraint_row.confdeltype
           WHEN 'a' THEN 'no action'
           WHEN 'r' THEN 'restrict'
           WHEN 'c' THEN 'cascade'
           WHEN 'n' THEN 'set null'
           WHEN 'd' THEN 'set default'
           ELSE NULL
         END AS on_delete
       FROM pg_constraint constraint_row
       JOIN pg_class child_table ON child_table.oid = constraint_row.conrelid
       JOIN pg_namespace namespace ON namespace.oid = child_table.relnamespace
       JOIN pg_class parent_table ON parent_table.oid = constraint_row.confrelid
       JOIN LATERAL unnest(constraint_row.conkey) WITH ORDINALITY AS child_keys(attnum, ordinality)
         ON true
       JOIN LATERAL unnest(constraint_row.confkey) WITH ORDINALITY AS parent_keys(attnum, ordinality)
         ON parent_keys.ordinality = child_keys.ordinality
       JOIN pg_attribute child_attribute
         ON child_attribute.attrelid = child_table.oid
        AND child_attribute.attnum = child_keys.attnum
       JOIN pg_attribute parent_attribute
         ON parent_attribute.attrelid = parent_table.oid
        AND parent_attribute.attnum = parent_keys.attnum
       WHERE namespace.nspname = 'public'
         AND constraint_row.contype = 'f'
       ORDER BY child_table.relname, constraint_row.conname, child_keys.ordinality`
    ) as Promise<IntrospectionForeignKeyRow[]>,
    repo.listManagedObjects(),
  ]);
  const detailDurationMs = durationMs(detailStartedAt);

  logger.debug(
    {
      columnCount: columns.length,
      detailDurationMs,
      durationMs: durationMs(startedAt),
      foreignKeyCount: foreignKeys.length,
      indexCount: indexes.length,
      managedObjectCount: managedObjects.length,
      tableCount: tableRows.length,
      tableRowsDurationMs,
    },
    'SandboxDB table introspection completed'
  );

  const managedTables = new Set(
    managedObjects
      .filter((object) => object.objectType === 'table' && object.status === 'active')
      .map((object) => object.objectName)
  );

  const columnsByTable = new Map<string, IntrospectionColumnRow[]>();
  for (const column of columns) {
    columnsByTable.set(column.table_name, [
      ...(columnsByTable.get(column.table_name) ?? []),
      column,
    ]);
  }

  const indexesByTable = new Map<string, IntrospectionIndexRow[]>();
  for (const index of indexes) {
    indexesByTable.set(index.table_name, [...(indexesByTable.get(index.table_name) ?? []), index]);
  }

  const foreignKeysByTable = new Map<string, IntrospectionForeignKeyRow[]>();
  for (const foreignKey of foreignKeys) {
    foreignKeysByTable.set(foreignKey.table_name, [
      ...(foreignKeysByTable.get(foreignKey.table_name) ?? []),
      foreignKey,
    ]);
  }

  return tableRows.map((table) => ({
    columns: (columnsByTable.get(table.name) ?? []).map((column) => ({
      defaultValue: column.default_value ?? null,
      name: column.name,
      nullable: column.nullable,
      primaryKey: column.primary_key,
      scalarType: scalarType(column.type, column.is_enum),
      type: column.type,
    })),
    foreignKeys: (foreignKeysByTable.get(table.name) ?? []).map((foreignKey) => ({
      column: foreignKey.column,
      name: foreignKey.name,
      onDelete: foreignKey.on_delete,
      referencesColumn: foreignKey.references_column,
      referencesTable: foreignKey.references_table,
    })),
    indexes: (indexesByTable.get(table.name) ?? []).map((index) => ({
      columns: Array.isArray(index.columns) ? index.columns : [],
      name: index.name,
      unique: index.unique,
    })),
    managed: managedTables.has(table.name),
    name: table.name,
    rowCount: Number(table.row_count ?? 0),
  }));
}

type SandboxStateCacheEntry = {
  expiresAt: number;
  generation: number;
  promise?: Promise<SandboxStateResponse>;
  value?: SandboxStateResponse;
};

const sandboxStateCacheTtlMs = 1_000;
const sandboxStateCacheByRepo = new WeakMap<DatabaseDesignRepository, SandboxStateCacheEntry>();
let sandboxStateCacheGeneration = 0;

export function invalidateSandboxStateCache(repo?: DatabaseDesignRepository) {
  sandboxStateCacheGeneration += 1;
  if (repo) sandboxStateCacheByRepo.delete(repo);
}

async function cachedSandboxState(
  repo: DatabaseDesignRepository,
  load: () => Promise<SandboxStateResponse>
) {
  const now = Date.now();
  const cached = sandboxStateCacheByRepo.get(repo);
  if (
    cached?.value &&
    cached.expiresAt > now &&
    cached.generation === sandboxStateCacheGeneration
  ) {
    logger.debug({ tableCount: cached.value.tables.length }, 'SandboxDB state cache hit');
    return cached.value;
  }
  if (cached?.promise && cached.generation === sandboxStateCacheGeneration) {
    logger.debug('SandboxDB state in-flight request reused');
    return cached.promise;
  }

  const generation = sandboxStateCacheGeneration;
  const promise = load()
    .then((value) => {
      if (generation === sandboxStateCacheGeneration) {
        sandboxStateCacheByRepo.set(repo, {
          expiresAt: Date.now() + sandboxStateCacheTtlMs,
          generation,
          value,
        });
      }
      return value;
    })
    .catch((error) => {
      sandboxStateCacheByRepo.delete(repo);
      throw error;
    });
  sandboxStateCacheByRepo.set(repo, { expiresAt: 0, generation, promise });
  return promise;
}

export function createSandboxQueryService(
  repo: DatabaseDesignRepository,
  sandboxSql: postgres.Sql = getSandboxSql()
) {
  const activeSchema = async () => {
    const schema = await repo.latestAppliedSchemaJson();
    if (!schema) return null;
    return schema;
  };

  const assertManagedTable = async (table: string) => {
    const schema = await activeSchema();
    const object = (await repo.listManagedObjects()).find(
      (candidate) =>
        candidate.objectType === 'table' &&
        candidate.objectName === table &&
        candidate.status === 'active'
    );
    if (!schema || !object) {
      throw new NotFoundError(`Sandbox table "${table}" is not managed`);
    }
    const tableSchema = schema.schema.tables.find((candidate) => candidate.name === table);
    if (!tableSchema) {
      throw new NotFoundError(`Sandbox table "${table}" is not in the active schema`);
    }
    return { schema, tableSchema };
  };

  return {
    state: async (): Promise<SandboxStateResponse> => {
      return cachedSandboxState(repo, async () => {
        const [schema, tables] = await Promise.all([
          activeSchema(),
          introspectSandboxTables(repo, sandboxSql),
        ]);
        return {
          appliedDatabaseSchemaJsonId: schema?.id ?? null,
          appliedVersion: schema?.version ?? null,
          tables,
        };
      });
    },
    listRows: async (table: string, limit = 50): Promise<SandboxRowsResponse> => {
      await assertManagedTable(table);
      const boundedLimit = Math.min(Math.max(limit, 1), 200);
      const rows = await sandboxSql.unsafe(
        `SELECT * FROM ${quoteIdent(table)} LIMIT ${boundedLimit}`
      );
      return { table, rows: rows as Record<string, unknown>[] };
    },
    inspectRows: async (table: string, limit = 100): Promise<SandboxRowsResponse> => {
      await assertPublicTable(sandboxSql, table);
      const boundedLimit = Math.min(Math.max(limit, 1), 200);
      const rows = await sandboxSql.unsafe(
        `SELECT * FROM ${quoteIdent(table)} LIMIT ${boundedLimit}`
      );
      return { table, rows: rows as Record<string, unknown>[] };
    },
    getRow: async (table: string, id: string): Promise<SandboxRowResponse> => {
      await assertManagedTable(table);
      const rows = await sandboxSql.unsafe(
        `SELECT * FROM ${quoteIdent(table)} WHERE id = ${quoteLiteral(id)} LIMIT 1`
      );
      if (!rows[0]) throw new NotFoundError(`Sandbox row "${id}" was not found`);
      return { table, row: rows[0] as Record<string, unknown> };
    },
    insertRow: async (
      table: string,
      value: Record<string, unknown>
    ): Promise<SandboxRowResponse> => {
      const { schema, tableSchema } = await assertManagedTable(table);
      const parsed = createRuntimeInsertSchema(schema.schema, table).parse(value);
      const keys = Object.keys(parsed);
      if (keys.length === 0) throw new ValidationError('Row payload is empty');
      const columns = keys.map(quoteIdent).join(', ');
      const values = keys.map((key) => sqlValue(tableSchema, key, parsed[key])).join(', ');
      const rows = await sandboxSql.unsafe(
        `INSERT INTO ${quoteIdent(table)} (${columns}) VALUES (${values}) RETURNING *`
      );
      invalidateSandboxStateCache(repo);
      return { table, row: rows[0] as Record<string, unknown> };
    },
    updateRow: async (
      table: string,
      id: string,
      value: Record<string, unknown>
    ): Promise<SandboxRowResponse> => {
      const { schema, tableSchema } = await assertManagedTable(table);
      const parsed = createRuntimeUpdateSchema(schema.schema, table).parse(value);
      const userFields = Object.keys(parsed).filter((key) => key !== 'id' && key !== 'updated_at');
      if (userFields.length === 0) throw new ValidationError('Row payload is empty');
      const assignments = [
        ...userFields.map(
          (key) => `${quoteIdent(key)} = ${sqlValue(tableSchema, key, parsed[key])}`
        ),
        ...(tableSchema.columns.some((column) => column.name === 'updated_at')
          ? [`${quoteIdent('updated_at')} = now()`]
          : []),
      ].join(', ');
      const rows = await sandboxSql.unsafe(
        `UPDATE ${quoteIdent(table)} SET ${assignments} WHERE id = ${quoteLiteral(id)} RETURNING *`
      );
      invalidateSandboxStateCache(repo);
      return { table, row: rows[0] as Record<string, unknown> };
    },
    deleteRow: async (table: string, id: string) => {
      await assertManagedTable(table);
      await sandboxSql.unsafe(`DELETE FROM ${quoteIdent(table)} WHERE id = ${quoteLiteral(id)}`);
      invalidateSandboxStateCache(repo);
      return { success: true };
    },
    dropTable: async (table: string) => {
      const managedObjects = (await repo.listManagedObjects()).filter(
        (object) =>
          object.status === 'active' &&
          (object.objectName === table || object.parentObjectName === table)
      );
      const indexes = managedObjects.filter((object) => object.objectType === 'index');
      const enums = managedObjects.filter((object) => object.objectType === 'enum');
      const statements = [
        ...indexes.map((object) => `DROP INDEX IF EXISTS ${quoteIdent(object.objectName)};`),
        `DROP TABLE IF EXISTS ${quoteIdent(table)} CASCADE;`,
        ...enums.map((object) => `DROP TYPE IF EXISTS ${quoteIdent(object.objectName)} CASCADE;`),
      ].join('\n');

      await sandboxSql.unsafe(statements);
      await repo.markManagedObjectsDropped(managedObjects.map((object) => object.id));
      invalidateSandboxStateCache(repo);
      return { success: true };
    },
    attachRelation: async (
      relationName: string,
      input: SandboxRelationAttachRequest
    ): Promise<SandboxRowResponse> => {
      const schema = await activeSchema();
      if (!schema) throw new NotFoundError('No applied sandbox schema found');
      const relation = schema.schema.relations.find(
        (candidate) => candidate.name === relationName && candidate.kind === 'many-to-many'
      );
      if (!relation || relation.kind !== 'many-to-many') {
        throw new NotFoundError(`Sandbox relation "${relationName}" is not managed`);
      }
      await assertManagedTable(relation.joinTable);
      const rows = await sandboxSql.unsafe(
        `INSERT INTO ${quoteIdent(relation.joinTable)}
          (${quoteIdent(relation.leftForeignKeyColumn)}, ${quoteIdent(
            relation.rightForeignKeyColumn
          )})
        VALUES (${quoteLiteral(input.leftId)}, ${quoteLiteral(input.rightId)})
        RETURNING *`
      );
      invalidateSandboxStateCache(repo);
      return { table: relation.joinTable, row: rows[0] as Record<string, unknown> };
    },
    detachRelation: async (relationName: string, input: SandboxRelationAttachRequest) => {
      const schema = await activeSchema();
      if (!schema) throw new NotFoundError('No applied sandbox schema found');
      const relation = schema.schema.relations.find(
        (candidate) => candidate.name === relationName && candidate.kind === 'many-to-many'
      );
      if (!relation || relation.kind !== 'many-to-many') {
        throw new NotFoundError(`Sandbox relation "${relationName}" is not managed`);
      }
      await assertManagedTable(relation.joinTable);
      await sandboxSql.unsafe(
        `DELETE FROM ${quoteIdent(relation.joinTable)}
        WHERE ${quoteIdent(relation.leftForeignKeyColumn)} = ${quoteLiteral(input.leftId)}
          AND ${quoteIdent(relation.rightForeignKeyColumn)} = ${quoteLiteral(input.rightId)}`
      );
      invalidateSandboxStateCache(repo);
      return { success: true };
    },
  };
}

export type SandboxQueryService = ReturnType<typeof createSandboxQueryService>;
