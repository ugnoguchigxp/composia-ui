import type { DataBindingDraft } from '../../../shared/schemas/data-binding.schema';
import type {
  DatabaseColumn,
  DatabaseRelation,
  DatabaseSchemaJson,
  DatabaseTable,
} from '../../../shared/schemas/database-design.schema';
import { databaseSchemaJsonSchema } from '../../../shared/schemas/database-design.schema';
import type { AppUiSchema } from '../../../shared/schemas/ui-schema.schema';
import { ValidationError } from '../../lib/errors';

const reservedIdentifiers = new Set([
  'all',
  'alter',
  'and',
  'as',
  'between',
  'by',
  'create',
  'delete',
  'drop',
  'from',
  'group',
  'insert',
  'join',
  'limit',
  'not',
  'null',
  'or',
  'order',
  'select',
  'table',
  'update',
  'user',
  'where',
]);

function duplicates(values: string[]) {
  const seen = new Set<string>();
  const duplicated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicated.add(value);
    seen.add(value);
  }
  return [...duplicated];
}

function primaryKey(table: DatabaseTable) {
  return table.columns.find((column) => column.primaryKey);
}

function columnByName(table: DatabaseTable, name: string): DatabaseColumn | undefined {
  return table.columns.find((column) => column.name === name);
}

function assertIdentifierSafe(issues: string[], label: string, name: string) {
  if (reservedIdentifiers.has(name)) {
    issues.push(`${label} "${name}" uses a reserved SQL identifier`);
  }
}

function validateTable(table: DatabaseTable, issues: string[]) {
  assertIdentifierSafe(issues, 'Table', table.name);

  for (const duplicate of duplicates(table.columns.map((column) => column.name))) {
    issues.push(`Table "${table.name}" has duplicate column "${duplicate}"`);
  }

  const primaryKeys = table.columns.filter((column) => column.primaryKey);
  if (primaryKeys.length !== 1) {
    issues.push(`Table "${table.name}" must have exactly one primary key column`);
  }

  for (const column of table.columns) {
    assertIdentifierSafe(issues, `Column ${table.name}.`, column.name);
    if (column.type === 'enum') {
      if (!column.enumName) {
        issues.push(`Column "${table.name}.${column.name}" must set enumName`);
      }
      if (!column.enumValues || column.enumValues.length < 1) {
        issues.push(`Column "${table.name}.${column.name}" must set enumValues`);
      }
      if (column.enumValues && duplicates(column.enumValues).length > 0) {
        issues.push(`Column "${table.name}.${column.name}" has duplicate enum values`);
      }
    }
  }

  for (const duplicate of duplicates(table.indexes.map((index) => index.name))) {
    issues.push(`Table "${table.name}" has duplicate index "${duplicate}"`);
  }

  for (const index of table.indexes) {
    for (const column of index.columns) {
      if (!columnByName(table, column)) {
        issues.push(`Index "${index.name}" references missing column "${table.name}.${column}"`);
      }
    }
  }

  if (table.ui.displayField && !columnByName(table, table.ui.displayField)) {
    issues.push(`Table "${table.name}" displayField references missing column`);
  }
  if (table.ui.defaultSortField && !columnByName(table, table.ui.defaultSortField)) {
    issues.push(`Table "${table.name}" defaultSortField references missing column`);
  }
}

function validateOneToManyRelation(
  relation: Extract<DatabaseRelation, { kind: 'one-to-many' }>,
  tables: Map<string, DatabaseTable>,
  issues: string[]
) {
  const parent = tables.get(relation.parentTable);
  const child = tables.get(relation.childTable);
  if (!parent) issues.push(`Relation "${relation.name}" references missing parent table`);
  if (!child) issues.push(`Relation "${relation.name}" references missing child table`);
  if (!parent || !child) return;

  const parentPk = primaryKey(parent);
  const childFk = columnByName(child, relation.foreignKeyColumn);
  if (!parentPk) {
    issues.push(`Relation "${relation.name}" parent table has no primary key`);
  }
  if (!childFk) {
    issues.push(`Relation "${relation.name}" references missing foreign key column`);
  }
  if (relation.onDelete === 'set-null' && childFk && !childFk.nullable) {
    issues.push(`Relation "${relation.name}" uses set-null but foreign key is not nullable`);
  }
  if (relation.parentDisplayField && !columnByName(parent, relation.parentDisplayField)) {
    issues.push(`Relation "${relation.name}" parentDisplayField references missing column`);
  }
}

function validateManyToManyRelation(
  relation: Extract<DatabaseRelation, { kind: 'many-to-many' }>,
  tables: Map<string, DatabaseTable>,
  issues: string[]
) {
  const left = tables.get(relation.leftTable);
  const right = tables.get(relation.rightTable);
  const join = tables.get(relation.joinTable);
  if (!left) issues.push(`Relation "${relation.name}" references missing left table`);
  if (!right) issues.push(`Relation "${relation.name}" references missing right table`);
  if (!join) issues.push(`Relation "${relation.name}" references missing join table`);
  if (!left || !right || !join) return;

  if (!columnByName(join, relation.leftForeignKeyColumn)) {
    issues.push(`Relation "${relation.name}" references missing left join column`);
  }
  if (!columnByName(join, relation.rightForeignKeyColumn)) {
    issues.push(`Relation "${relation.name}" references missing right join column`);
  }
  const hasUniquePair = join.indexes.some(
    (index) =>
      index.unique &&
      index.columns.includes(relation.leftForeignKeyColumn) &&
      index.columns.includes(relation.rightForeignKeyColumn)
  );
  if (!hasUniquePair) {
    issues.push(`Relation "${relation.name}" join table needs a unique left/right index`);
  }
}

export function validateDatabaseSchemaJson(input: DatabaseSchemaJson): DatabaseSchemaJson {
  const schema = databaseSchemaJsonSchema.parse(input);
  const issues: string[] = [];
  for (const duplicate of duplicates(schema.tables.map((table) => table.name))) {
    issues.push(`Duplicate table "${duplicate}"`);
  }

  const tables = new Map(schema.tables.map((table) => [table.name, table]));
  for (const table of schema.tables) {
    validateTable(table, issues);
  }

  for (const duplicate of duplicates(schema.relations.map((relation) => relation.name))) {
    issues.push(`Duplicate relation "${duplicate}"`);
  }

  for (const relation of schema.relations) {
    assertIdentifierSafe(issues, 'Relation', relation.name);
    if (relation.kind === 'one-to-many') {
      validateOneToManyRelation(relation, tables, issues);
    } else {
      validateManyToManyRelation(relation, tables, issues);
    }
  }

  for (const table of schema.uiHints.primaryTables) {
    if (!tables.has(table))
      issues.push(`uiHints.primaryTables references missing table "${table}"`);
  }
  for (const table of schema.uiHints.defaultNavigation) {
    if (!tables.has(table)) {
      issues.push(`uiHints.defaultNavigation references missing table "${table}"`);
    }
  }

  if (issues.length > 0) {
    throw new ValidationError('Database schema proposal is invalid', { issues });
  }

  return schema;
}

export function validateDataBindingsForDatabaseSchema(
  schema: DatabaseSchemaJson,
  bindings: DataBindingDraft[]
) {
  const issues: string[] = [];
  const tables = new Map(schema.tables.map((table) => [table.name, table]));
  const relations = new Map(schema.relations.map((relation) => [relation.name, relation]));

  for (const duplicate of duplicates(bindings.map((binding) => binding.id))) {
    issues.push(`Duplicate data binding "${duplicate}"`);
  }

  for (const binding of bindings) {
    const table = tables.get(binding.table);
    if (!table) {
      issues.push(`Data binding "${binding.id}" references missing table "${binding.table}"`);
      continue;
    }

    const columns = new Set(table.columns.map((column) => column.name));
    for (const field of binding.fields) {
      if (!columns.has(field)) {
        issues.push(`Data binding "${binding.id}" references missing field "${field}"`);
      }
    }
    for (const filter of binding.filters) {
      if (!columns.has(filter.field)) {
        issues.push(`Data binding "${binding.id}" filters missing field "${filter.field}"`);
      }
    }
    for (const sort of binding.sort) {
      if (!columns.has(sort.field)) {
        issues.push(`Data binding "${binding.id}" sorts by missing field "${sort.field}"`);
      }
    }
    for (const relation of binding.relations) {
      if (!relations.has(relation)) {
        issues.push(`Data binding "${binding.id}" references missing relation "${relation}"`);
      }
    }
  }

  if (issues.length > 0) {
    throw new ValidationError('Data binding proposal is invalid', { issues });
  }

  return bindings;
}

export function validateScreenDataBindingReferences(
  screen: AppUiSchema | undefined,
  bindings: Pick<DataBindingDraft, 'id'>[]
) {
  if (!screen) return;

  const bindingIds = new Set(bindings.map((binding) => binding.id));
  const issues = screen.sections.flatMap((section, index) => {
    if (!section.dataBindingId || bindingIds.has(section.dataBindingId)) return [];
    return [
      `Screen section ${index + 1} (${section.component}) references missing data binding "${
        section.dataBindingId
      }"`,
    ];
  });

  if (issues.length > 0) {
    throw new ValidationError('Screen data binding proposal is invalid', { issues });
  }
}
