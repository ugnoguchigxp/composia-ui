import { z } from 'zod';
import type {
  DatabaseColumn,
  DatabaseSchemaJson,
  DatabaseTable,
} from '../../../shared/schemas/database-design.schema';
import { NotFoundError } from '../../lib/errors';

function scalarSchema(column: DatabaseColumn) {
  let schema: z.ZodType;
  switch (column.type) {
    case 'uuid':
      schema = z.string().uuid();
      break;
    case 'integer':
    case 'bigint':
      schema = z.coerce.number().int();
      break;
    case 'numeric':
      schema = z.coerce.number();
      break;
    case 'boolean':
      schema = z.coerce.boolean();
      break;
    case 'date':
      schema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
      break;
    case 'timestamp':
      schema = z.string().datetime();
      break;
    case 'jsonb':
      schema = z.unknown();
      break;
    case 'enum':
      schema =
        column.enumValues && column.enumValues.length > 0
          ? z.enum(column.enumValues as [string, ...string[]])
          : z.string().min(1);
      break;
    default:
      schema = z.string();
      if (column.validation.minLength !== undefined) {
        schema = (schema as z.ZodString).min(column.validation.minLength);
      }
      if (column.validation.maxLength !== undefined) {
        schema = (schema as z.ZodString).max(column.validation.maxLength);
      }
      if (column.validation.pattern) {
        schema = (schema as z.ZodString).regex(new RegExp(column.validation.pattern));
      }
      break;
  }

  if (column.type === 'integer' || column.type === 'bigint' || column.type === 'numeric') {
    if (column.validation.min !== undefined)
      schema = (schema as z.ZodNumber).min(column.validation.min);
    if (column.validation.max !== undefined)
      schema = (schema as z.ZodNumber).max(column.validation.max);
  }

  return column.nullable ? schema.nullable() : schema;
}

function tableShape(table: DatabaseTable) {
  return Object.fromEntries(
    table.columns.map((column) => {
      const required = !column.nullable && !column.default && !column.primaryKey;
      const schema = required ? scalarSchema(column) : scalarSchema(column).optional();
      return [column.name, schema];
    })
  );
}

export function findRuntimeTable(schema: DatabaseSchemaJson, tableName: string) {
  const table = schema.tables.find((candidate) => candidate.name === tableName);
  if (!table) throw new NotFoundError(`Sandbox table "${tableName}" is not in the active schema`);
  return table;
}

export function createRuntimeInsertSchema(schema: DatabaseSchemaJson, tableName: string) {
  return z.object(tableShape(findRuntimeTable(schema, tableName))).strict();
}

export function createRuntimeUpdateSchema(schema: DatabaseSchemaJson, tableName: string) {
  return z
    .object(tableShape(findRuntimeTable(schema, tableName)))
    .partial()
    .strict();
}
