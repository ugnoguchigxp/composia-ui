import type {
  DatabaseTable,
  SandboxRelationAttachRequest,
  SandboxRowResponse,
  SandboxRowsResponse,
  SandboxStateResponse,
} from '../../../shared/schemas/database-design.schema';
import { NotFoundError, ValidationError } from '../../lib/errors';
import type { DatabaseDesignRepository } from './database-design.repository';
import { createRuntimeInsertSchema, createRuntimeUpdateSchema } from './runtime-zod.service';
import { getSandboxSql } from './sandbox-client';

function quoteIdent(identifier: string) {
  return `"${identifier.replace(/"/g, '""')}"`;
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

async function tableRowCount(table: string) {
  const rows = await getSandboxSql().unsafe(
    `SELECT count(*)::int AS count FROM ${quoteIdent(table)}`
  );
  const count = rows[0]?.count;
  return typeof count === 'number' ? count : Number(count ?? 0);
}

export function createSandboxQueryService(repo: DatabaseDesignRepository) {
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
      const schema = await activeSchema();
      const objects = await repo.listManagedObjects();
      const tables = objects.filter(
        (object) => object.objectType === 'table' && object.status === 'active'
      );
      return {
        appliedDatabaseSchemaJsonId: schema?.id ?? null,
        appliedVersion: schema?.version ?? null,
        tables: await Promise.all(
          tables.map(async (table) => ({
            name: table.objectName,
            rowCount: await tableRowCount(table.objectName).catch(() => 0),
            managed: true,
          }))
        ),
      };
    },
    listRows: async (table: string, limit = 50): Promise<SandboxRowsResponse> => {
      await assertManagedTable(table);
      const boundedLimit = Math.min(Math.max(limit, 1), 200);
      const rows = await getSandboxSql().unsafe(
        `SELECT * FROM ${quoteIdent(table)} ORDER BY created_at DESC LIMIT ${boundedLimit}`
      );
      return { table, rows: rows as Record<string, unknown>[] };
    },
    getRow: async (table: string, id: string): Promise<SandboxRowResponse> => {
      await assertManagedTable(table);
      const rows = await getSandboxSql().unsafe(
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
      const rows = await getSandboxSql().unsafe(
        `INSERT INTO ${quoteIdent(table)} (${columns}) VALUES (${values}) RETURNING *`
      );
      return { table, row: rows[0] as Record<string, unknown> };
    },
    updateRow: async (
      table: string,
      id: string,
      value: Record<string, unknown>
    ): Promise<SandboxRowResponse> => {
      const { schema, tableSchema } = await assertManagedTable(table);
      const parsed = createRuntimeUpdateSchema(schema.schema, table).parse(value);
      const assignments = Object.keys(parsed)
        .filter((key) => key !== 'id')
        .map((key) => `${quoteIdent(key)} = ${sqlValue(tableSchema, key, parsed[key])}`)
        .join(', ');
      if (!assignments) throw new ValidationError('Row payload is empty');
      const rows = await getSandboxSql().unsafe(
        `UPDATE ${quoteIdent(table)} SET ${assignments} WHERE id = ${quoteLiteral(id)} RETURNING *`
      );
      return { table, row: rows[0] as Record<string, unknown> };
    },
    deleteRow: async (table: string, id: string) => {
      await assertManagedTable(table);
      await getSandboxSql().unsafe(
        `DELETE FROM ${quoteIdent(table)} WHERE id = ${quoteLiteral(id)}`
      );
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
      const rows = await getSandboxSql().unsafe(
        `INSERT INTO ${quoteIdent(relation.joinTable)}
          (${quoteIdent(relation.leftForeignKeyColumn)}, ${quoteIdent(
            relation.rightForeignKeyColumn
          )})
        VALUES (${quoteLiteral(input.leftId)}, ${quoteLiteral(input.rightId)})
        RETURNING *`
      );
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
      await getSandboxSql().unsafe(
        `DELETE FROM ${quoteIdent(relation.joinTable)}
        WHERE ${quoteIdent(relation.leftForeignKeyColumn)} = ${quoteLiteral(input.leftId)}
          AND ${quoteIdent(relation.rightForeignKeyColumn)} = ${quoteLiteral(input.rightId)}`
      );
      return { success: true };
    },
  };
}

export type SandboxQueryService = ReturnType<typeof createSandboxQueryService>;
