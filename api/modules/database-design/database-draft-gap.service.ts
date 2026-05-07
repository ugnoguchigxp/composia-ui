import type {
  DatabaseDraftGapItem,
  DatabaseDraftGapKind,
  DatabaseDraftGapSummary,
  DatabaseIndex,
  DatabaseRelation,
  DatabaseSchemaJson,
  DatabaseTable,
  SandboxStateResponse,
  SandboxTableForeignKeyState,
  SandboxTableIndexState,
  SandboxTableState,
} from '../../../shared/schemas/database-design.schema';

function primaryKey(table: DatabaseTable) {
  return table.columns.find((column) => column.primaryKey) ?? table.columns[0] ?? null;
}

function normalizeOnDelete(value: string | null | undefined) {
  if (!value) return null;
  return value.toLowerCase().replace(/\s+/g, '-');
}

function gapItem(input: {
  actual?: string | null;
  column?: string | null;
  expected?: string | null;
  kind: DatabaseDraftGapKind;
  message: string;
  severity?: 'blocking' | 'info';
  table?: string | null;
}): DatabaseDraftGapItem {
  return {
    actual: input.actual ?? null,
    column: input.column ?? null,
    expected: input.expected ?? null,
    kind: input.kind,
    message: input.message,
    severity: input.severity ?? 'blocking',
    table: input.table ?? null,
  };
}

function indexSignature(index: Pick<DatabaseIndex, 'columns' | 'unique'>) {
  return JSON.stringify({ columns: index.columns, unique: index.unique });
}

function isImplicitUniqueColumnIndex(draftTable: DatabaseTable, index: SandboxTableIndexState) {
  if (!index.unique || index.columns.length !== 1) return false;
  const [columnName] = index.columns;
  return draftTable.columns.some(
    (column) => column.name === columnName && column.unique && !column.primaryKey
  );
}

function foreignKeySignature(
  foreignKey: Pick<
    SandboxTableForeignKeyState,
    'column' | 'onDelete' | 'referencesColumn' | 'referencesTable'
  >
) {
  return JSON.stringify({
    column: foreignKey.column,
    onDelete: normalizeOnDelete(foreignKey.onDelete),
    referencesColumn: foreignKey.referencesColumn,
    referencesTable: foreignKey.referencesTable,
  });
}

function expectedForeignKeys(schema: DatabaseSchemaJson) {
  const tables = new Map(schema.tables.map((table) => [table.name, table]));
  const items: (SandboxTableForeignKeyState & { tableName: string })[] = [];

  for (const relation of schema.relations) {
    if (relation.kind === 'one-to-many') {
      const parent = tables.get(relation.parentTable);
      const parentPk = parent ? primaryKey(parent) : null;
      if (!parentPk) continue;
      items.push({
        column: relation.foreignKeyColumn,
        name: `${relation.childTable}_${relation.foreignKeyColumn}_fk`,
        onDelete: relation.onDelete,
        referencesColumn: parentPk.name,
        referencesTable: relation.parentTable,
        tableName: relation.childTable,
      });
      continue;
    }

    const left = tables.get(relation.leftTable);
    const right = tables.get(relation.rightTable);
    const leftPk = left ? primaryKey(left) : null;
    const rightPk = right ? primaryKey(right) : null;
    if (!leftPk || !rightPk) continue;
    items.push({
      column: relation.leftForeignKeyColumn,
      name: `${relation.joinTable}_${relation.leftForeignKeyColumn}_fk`,
      onDelete: relation.onDelete,
      referencesColumn: leftPk.name,
      referencesTable: relation.leftTable,
      tableName: relation.joinTable,
    });
    items.push({
      column: relation.rightForeignKeyColumn,
      name: `${relation.joinTable}_${relation.rightForeignKeyColumn}_fk`,
      onDelete: relation.onDelete,
      referencesColumn: rightPk.name,
      referencesTable: relation.rightTable,
      tableName: relation.joinTable,
    });
  }

  return items;
}

function compareColumns(
  draftTable: DatabaseTable,
  sandboxTable: SandboxTableState,
  items: DatabaseDraftGapItem[]
) {
  const actualColumns = new Map(sandboxTable.columns.map((column) => [column.name, column]));
  const expectedColumns = new Map(draftTable.columns.map((column) => [column.name, column]));

  for (const column of draftTable.columns) {
    const actual = actualColumns.get(column.name);
    if (!actual) {
      items.push(
        gapItem({
          column: column.name,
          expected: column.type,
          kind: 'missing_column',
          message: `${draftTable.name}.${column.name} is missing from SandboxDB`,
          table: draftTable.name,
        })
      );
      continue;
    }
    if (actual.scalarType !== column.type) {
      items.push(
        gapItem({
          actual: actual.scalarType,
          column: column.name,
          expected: column.type,
          kind: 'column_type_mismatch',
          message: `${draftTable.name}.${column.name} type is ${actual.scalarType}, expected ${column.type}`,
          table: draftTable.name,
        })
      );
    }
    if (actual.nullable !== column.nullable) {
      items.push(
        gapItem({
          actual: String(actual.nullable),
          column: column.name,
          expected: String(column.nullable),
          kind: 'column_nullability_mismatch',
          message: `${draftTable.name}.${column.name} nullability differs from Draft`,
          table: draftTable.name,
        })
      );
    }
  }

  for (const column of sandboxTable.columns) {
    if (expectedColumns.has(column.name)) continue;
    items.push(
      gapItem({
        actual: column.scalarType,
        column: column.name,
        kind: 'extra_column',
        message: `${sandboxTable.name}.${column.name} exists in SandboxDB but not in Draft`,
        table: sandboxTable.name,
      })
    );
  }
}

function compareIndexes(
  draftTable: DatabaseTable,
  sandboxTable: SandboxTableState,
  items: DatabaseDraftGapItem[]
) {
  const actualIndexes = new Map(sandboxTable.indexes.map((index) => [index.name, index]));
  const expectedIndexes = new Map(draftTable.indexes.map((index) => [index.name, index]));

  for (const index of draftTable.indexes) {
    const actual = actualIndexes.get(index.name);
    if (!actual || indexSignature(actual) !== indexSignature(index)) {
      items.push(
        gapItem({
          actual: actual ? indexSignature(actual) : null,
          expected: indexSignature(index),
          kind: 'index_mismatch',
          message: `${draftTable.name}.${index.name} index differs from SandboxDB`,
          table: draftTable.name,
        })
      );
    }
  }

  for (const index of sandboxTable.indexes) {
    if (expectedIndexes.has(index.name)) continue;
    if (isImplicitUniqueColumnIndex(draftTable, index)) continue;
    items.push(
      gapItem({
        actual: indexSignature(index),
        kind: 'index_mismatch',
        message: `${sandboxTable.name}.${index.name} exists in SandboxDB but not in Draft`,
        table: sandboxTable.name,
      })
    );
  }
}

function relationTable(relation: DatabaseRelation) {
  return relation.kind === 'one-to-many' ? relation.childTable : relation.joinTable;
}

function compareForeignKeys(
  schema: DatabaseSchemaJson,
  sandboxTables: Map<string, SandboxTableState>,
  items: DatabaseDraftGapItem[]
) {
  const expected = expectedForeignKeys(schema);
  const expectedKeys = new Set(
    expected.map((foreignKey) => `${foreignKey.tableName}:${foreignKey.name}`)
  );

  for (const foreignKey of expected) {
    const sandboxTable = sandboxTables.get(foreignKey.tableName);
    const actual = sandboxTable?.foreignKeys.find(
      (candidate) => candidate.name === foreignKey.name
    );
    if (!actual || foreignKeySignature(actual) !== foreignKeySignature(foreignKey)) {
      items.push(
        gapItem({
          actual: actual ? foreignKeySignature(actual) : null,
          column: foreignKey.column,
          expected: foreignKeySignature(foreignKey),
          kind: 'missing_foreign_key',
          message: `${foreignKey.tableName}.${foreignKey.name} foreign key differs from SandboxDB`,
          table: foreignKey.tableName,
        })
      );
    }
  }

  for (const relation of schema.relations) {
    const sandboxTable = sandboxTables.get(relationTable(relation));
    if (!sandboxTable) continue;
    for (const foreignKey of sandboxTable.foreignKeys) {
      if (expectedKeys.has(`${sandboxTable.name}:${foreignKey.name}`)) continue;
      items.push(
        gapItem({
          actual: foreignKeySignature(foreignKey),
          column: foreignKey.column,
          kind: 'extra_foreign_key',
          message: `${sandboxTable.name}.${foreignKey.name} exists in SandboxDB but not in Draft`,
          table: sandboxTable.name,
        })
      );
    }
  }
}

export function detectDatabaseDraftGap(
  schema: DatabaseSchemaJson,
  sandboxState: SandboxStateResponse
): DatabaseDraftGapSummary {
  const items: DatabaseDraftGapItem[] = [];
  const sandboxTables = new Map(sandboxState.tables.map((table) => [table.name, table]));
  const draftTables = new Map(schema.tables.map((table) => [table.name, table]));

  for (const table of schema.tables) {
    const sandboxTable = sandboxTables.get(table.name);
    if (!sandboxTable) {
      items.push(
        gapItem({
          expected: table.name,
          kind: 'missing_table',
          message: `${table.name} is missing from SandboxDB`,
          table: table.name,
        })
      );
      continue;
    }
    compareColumns(table, sandboxTable, items);
    compareIndexes(table, sandboxTable, items);
  }

  for (const table of sandboxState.tables) {
    if (!table.managed) {
      items.push(
        gapItem({
          actual: table.name,
          kind: 'unmanaged_table_present',
          message: `${table.name} exists in SandboxDB but is not managed by DBDesign`,
          severity: 'info',
          table: table.name,
        })
      );
    }
    if (table.managed && !draftTables.has(table.name)) {
      items.push(
        gapItem({
          actual: table.name,
          kind: 'extra_table',
          message: `${table.name} exists in SandboxDB but not in Draft`,
          table: table.name,
        })
      );
    }
  }

  compareForeignKeys(schema, sandboxTables, items);

  const blockingCount = items.filter((item) => item.severity === 'blocking').length;
  const infoCount = items.filter((item) => item.severity === 'info').length;
  return {
    blockingCount,
    currentMatch: blockingCount === 0,
    infoCount,
    items,
  };
}
