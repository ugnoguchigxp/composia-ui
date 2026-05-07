import { createHash } from 'node:crypto';
import type {
  DatabaseColumn,
  DatabaseSchemaJson,
  DatabaseTable,
  SandboxMigrationPreview,
  SandboxResetResponse,
} from '../../../shared/schemas/database-design.schema';
import { config } from '../../config';
import { ValidationError } from '../../lib/errors';
import type {
  DatabaseDesignRepository,
  DatabaseSchemaJsonRecord,
} from './database-design.repository';
import { getSandboxSql } from './sandbox-client';

function quoteIdent(identifier: string) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function quoteLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function primaryKey(table: DatabaseTable) {
  return table.columns.find((column) => column.primaryKey) ?? table.columns[0];
}

function columnSqlType(column: DatabaseColumn) {
  switch (column.type) {
    case 'uuid':
      return 'uuid';
    case 'varchar':
      return column.validation.maxLength ? `varchar(${column.validation.maxLength})` : 'varchar';
    case 'integer':
      return 'integer';
    case 'bigint':
      return 'bigint';
    case 'numeric':
      return 'numeric';
    case 'boolean':
      return 'boolean';
    case 'date':
      return 'date';
    case 'timestamp':
      return 'timestamp';
    case 'jsonb':
      return 'jsonb';
    case 'enum':
      return quoteIdent(column.enumName ?? `${column.name}_enum`);
    default:
      return 'text';
  }
}

function defaultSql(column: DatabaseColumn) {
  if (!column.default || column.default.kind === 'none') return '';
  if (column.default.kind === 'uuid') return ' DEFAULT gen_random_uuid()';
  if (column.default.kind === 'now') return ' DEFAULT now()';
  if (column.default.kind === 'literal') {
    if (typeof column.default.value === 'string')
      return ` DEFAULT ${quoteLiteral(column.default.value)}`;
    if (typeof column.default.value === 'number') return ` DEFAULT ${column.default.value}`;
    if (typeof column.default.value === 'boolean')
      return ` DEFAULT ${column.default.value ? 'true' : 'false'}`;
  }
  return '';
}

function enumSql(schema: DatabaseSchemaJson) {
  const enumColumns = schema.tables.flatMap((table) =>
    table.columns.filter((column) => column.type === 'enum' && column.enumName && column.enumValues)
  );
  const enumsByName = new Map<string, string[]>();
  for (const column of enumColumns) {
    enumsByName.set(column.enumName ?? '', column.enumValues ?? []);
  }

  return [...enumsByName.entries()].map(
    ([name, values]) => `DO $$ BEGIN
  CREATE TYPE ${quoteIdent(name)} AS ENUM (${values.map(quoteLiteral).join(', ')});
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;`
  );
}

function createTableSql(table: DatabaseTable) {
  const columnLines = table.columns.map((column) => {
    const parts = [
      quoteIdent(column.name),
      columnSqlType(column),
      column.primaryKey ? 'PRIMARY KEY' : '',
      column.unique && !column.primaryKey ? 'UNIQUE' : '',
      column.nullable ? '' : 'NOT NULL',
      defaultSql(column),
    ];
    return `  ${parts.filter(Boolean).join(' ')}`;
  });

  return `CREATE TABLE IF NOT EXISTS ${quoteIdent(table.name)} (\n${columnLines.join(',\n')}\n);`;
}

function relationSql(schema: DatabaseSchemaJson) {
  const statements: string[] = [];
  const tables = new Map(schema.tables.map((table) => [table.name, table]));
  for (const relation of schema.relations) {
    if (relation.kind === 'one-to-many') {
      const parent = tables.get(relation.parentTable);
      const parentPk = parent ? primaryKey(parent) : null;
      if (!parentPk) continue;
      statements.push(
        `ALTER TABLE ${quoteIdent(relation.childTable)}
  ADD CONSTRAINT ${quoteIdent(`${relation.childTable}_${relation.foreignKeyColumn}_fk`)}
  FOREIGN KEY (${quoteIdent(relation.foreignKeyColumn)})
  REFERENCES ${quoteIdent(relation.parentTable)} (${quoteIdent(parentPk.name)})
  ON DELETE ${relation.onDelete.replace('-', ' ').toUpperCase()};`
      );
      continue;
    }

    const left = tables.get(relation.leftTable);
    const right = tables.get(relation.rightTable);
    const leftPk = left ? primaryKey(left) : null;
    const rightPk = right ? primaryKey(right) : null;
    if (!leftPk || !rightPk) continue;
    statements.push(
      `ALTER TABLE ${quoteIdent(relation.joinTable)}
  ADD CONSTRAINT ${quoteIdent(`${relation.joinTable}_${relation.leftForeignKeyColumn}_fk`)}
  FOREIGN KEY (${quoteIdent(relation.leftForeignKeyColumn)})
  REFERENCES ${quoteIdent(relation.leftTable)} (${quoteIdent(leftPk.name)})
  ON DELETE ${relation.onDelete.toUpperCase()};`
    );
    statements.push(
      `ALTER TABLE ${quoteIdent(relation.joinTable)}
  ADD CONSTRAINT ${quoteIdent(`${relation.joinTable}_${relation.rightForeignKeyColumn}_fk`)}
  FOREIGN KEY (${quoteIdent(relation.rightForeignKeyColumn)})
  REFERENCES ${quoteIdent(relation.rightTable)} (${quoteIdent(rightPk.name)})
  ON DELETE ${relation.onDelete.toUpperCase()};`
    );
  }
  return statements;
}

function indexSql(schema: DatabaseSchemaJson) {
  return schema.tables.flatMap((table) =>
    table.indexes.map((index) => {
      const unique = index.unique ? 'UNIQUE ' : '';
      const columns = index.columns.map(quoteIdent).join(', ');
      return `CREATE ${unique}INDEX IF NOT EXISTS ${quoteIdent(index.name)} ON ${quoteIdent(
        table.name
      )} (${columns});`;
    })
  );
}

export function migrationSql(schema: DatabaseSchemaJson) {
  return [
    'CREATE EXTENSION IF NOT EXISTS "pgcrypto";',
    ...enumSql(schema),
    ...schema.tables.map(createTableSql),
    ...relationSql(schema),
    ...indexSql(schema),
  ].join('\n\n');
}

function checksum(sql: string) {
  return createHash('sha256').update(sql).digest('hex');
}

function managedObjectsForSchema(
  schemaRecord: DatabaseSchemaJsonRecord,
  migrationRunId: string | null
) {
  const objects = schemaRecord.schema.tables.flatMap((table) => [
    {
      databaseSchemaJsonId: schemaRecord.id,
      migrationRunId,
      objectKey: `table:${table.name}`,
      objectName: table.name,
      objectType: 'table',
      parentObjectName: null,
      status: 'active',
    },
    ...table.indexes.map((index) => ({
      databaseSchemaJsonId: schemaRecord.id,
      migrationRunId,
      objectKey: `index:${index.name}`,
      objectName: index.name,
      objectType: 'index',
      parentObjectName: table.name,
      status: 'active',
    })),
  ]);
  const enumObjects = schemaRecord.schema.tables.flatMap((table) =>
    table.columns
      .filter((column) => column.type === 'enum' && column.enumName)
      .map((column) => ({
        databaseSchemaJsonId: schemaRecord.id,
        migrationRunId,
        objectKey: `enum:${column.enumName}`,
        objectName: column.enumName ?? '',
        objectType: 'enum',
        parentObjectName: table.name,
        status: 'active',
      }))
  );
  return [...objects, ...enumObjects];
}

export function createSandboxMigrationService(repo: DatabaseDesignRepository) {
  return {
    preview: async (schemaRecord: DatabaseSchemaJsonRecord): Promise<SandboxMigrationPreview> => {
      const sql = migrationSql(schemaRecord.schema);
      return {
        databaseSchemaJsonId: schemaRecord.id,
        sql,
        warnings: [
          '初回MVPでは managed schema を create-if-not-exists で反映します。破壊的変更は reset 後の再適用を使います。',
        ],
        destructive: false,
        requiresConfirmation: false,
      };
    },
    apply: async (schemaRecord: DatabaseSchemaJsonRecord) => {
      const sql = migrationSql(schemaRecord.schema);
      const run = await repo.createMigrationRun({
        databaseSchemaJsonId: schemaRecord.id,
        status: 'pending',
        fromVersion: null,
        toVersion: schemaRecord.version,
        sql,
        checksum: checksum(sql),
      });

      try {
        await getSandboxSql().unsafe(sql);
        const applied = await repo.updateMigrationRun(run.id, {
          appliedAt: new Date(),
          status: 'applied',
        });
        await repo.replaceManagedObjects(managedObjectsForSchema(schemaRecord, applied.id));
        return applied;
      } catch (error) {
        return repo.updateMigrationRun(run.id, {
          errorMessage: error instanceof Error ? error.message : 'Sandbox migration failed',
          status: 'failed',
        });
      }
    },
    reset: async (input: { confirmation: string }): Promise<SandboxResetResponse> => {
      if (!config.SANDBOX_DATABASE_RESET_ALLOWED) {
        throw new ValidationError('Sandbox reset is disabled');
      }
      if (input.confirmation !== 'RESET SANDBOX') {
        throw new ValidationError('Sandbox reset requires confirmation text');
      }

      const objects = (await repo.listManagedObjects()).filter(
        (object) => object.status === 'active'
      );
      const indexes = objects.filter((object) => object.objectType === 'index');
      const tables = objects.filter((object) => object.objectType === 'table');
      const enums = objects.filter((object) => object.objectType === 'enum');
      const sql = [
        ...indexes.map((object) => `DROP INDEX IF EXISTS ${quoteIdent(object.objectName)};`),
        ...tables.map((object) => `DROP TABLE IF EXISTS ${quoteIdent(object.objectName)} CASCADE;`),
        ...enums.map((object) => `DROP TYPE IF EXISTS ${quoteIdent(object.objectName)} CASCADE;`),
      ].join('\n');

      if (sql.trim()) {
        await getSandboxSql().unsafe(sql);
      }
      await repo.markManagedObjectsDropped(objects.map((object) => object.id));
      await repo.markAppliedMigrationRunsReverted();

      return { success: true, droppedObjects: objects.length };
    },
  };
}

export type SandboxMigrationService = ReturnType<typeof createSandboxMigrationService>;
