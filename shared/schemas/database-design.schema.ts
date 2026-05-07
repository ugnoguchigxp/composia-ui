import { z } from 'zod';
import { aiActivitySchema } from './ai.schema';
import {
  dataBindingDraftSchema,
  dataBindingOperationSchema,
  dataBindingSchema,
} from './data-binding.schema';
import { appUiSchemaSchema } from './ui-schema.schema';

export const databaseIdentifierSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]*$/, 'Use snake_case identifiers starting with a letter');

export const databaseScalarTypeSchema = z.enum([
  'uuid',
  'text',
  'varchar',
  'integer',
  'bigint',
  'numeric',
  'boolean',
  'date',
  'timestamp',
  'jsonb',
  'enum',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const reservedSqlIdentifiers = new Set([
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

function titleFromIdentifier(value: unknown, fallback = 'Item') {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function normalizeIdentifierText(value: unknown, fallback = '') {
  if (typeof value !== 'string') return fallback;
  const normalized = value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^[^a-z]+/, '');
  const identifier = databaseIdentifierSchema.safeParse(normalized).success ? normalized : fallback;
  if (!identifier || !reservedSqlIdentifiers.has(identifier)) return identifier;
  if (identifier === 'order') return 'sort_order';
  return `${identifier}_value`;
}

function normalizeColumnIdentifier(value: unknown, tableName?: string) {
  const raw = typeof value === 'string' && value.includes('.') ? value.split('.').at(-1) : value;
  const normalized = normalizeIdentifierText(raw);
  if (tableName && normalized.startsWith(`${tableName}_`)) {
    return normalizeIdentifierText(normalized.slice(tableName.length + 1), normalized);
  }
  return normalized;
}

function normalizeIdentifierList(value: unknown, tableName?: string) {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : isRecord(value)
        ? Object.keys(value).filter((key) => value[key] !== false)
        : [];

  return Array.from(
    new Set(
      values
        .map((item) => normalizeColumnIdentifier(item, tableName))
        .filter((item): item is string => item.length > 0)
    )
  );
}

function asBoolean(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'yes', '1'].includes(normalized)) return true;
    if (['false', 'no', '0'].includes(normalized)) return false;
  }
  return undefined;
}

function normalizeScalarType(value: unknown, columnName: unknown) {
  const normalized =
    typeof value === 'string'
      ? value
          .trim()
          .toLowerCase()
          .replace(/[\s-]+/g, '_')
      : '';
  const aliases: Record<string, z.infer<typeof databaseScalarTypeSchema>> = {
    bool: 'boolean',
    char: 'varchar',
    character_varying: 'varchar',
    datetime: 'timestamp',
    decimal: 'numeric',
    double: 'numeric',
    float: 'numeric',
    float8: 'numeric',
    foreign_key: 'uuid',
    int: 'integer',
    int4: 'integer',
    int8: 'bigint',
    json: 'jsonb',
    longtext: 'text',
    money: 'numeric',
    number: 'numeric',
    real: 'numeric',
    reference: 'uuid',
    references: 'uuid',
    serial: 'integer',
    smallint: 'integer',
    str: 'text',
    string: 'text',
    timestamptz: 'timestamp',
    timestamp_with_time_zone: 'timestamp',
    varchar2: 'varchar',
  };

  if (databaseScalarTypeSchema.safeParse(normalized).success) return normalized;
  if (aliases[normalized]) return aliases[normalized];
  if (typeof columnName === 'string' && (columnName === 'id' || columnName.endsWith('_id'))) {
    return 'uuid';
  }
  return 'text';
}

function normalizeDefault(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return { kind: 'none' };
  if (isRecord(value) && typeof value.kind === 'string') return value;
  if (typeof value === 'boolean' || typeof value === 'number') {
    return { kind: 'literal', value };
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const normalized = trimmed.toLowerCase();
    if (!trimmed || ['none', 'null'].includes(normalized)) return { kind: 'none' };
    if (
      ['gen_random_uuid()', 'uuid', 'uuid_generate_v4()', 'uuid_generate_v4'].includes(normalized)
    ) {
      return { kind: 'uuid' };
    }
    if (['now()', 'now', 'current_timestamp', 'current_date'].includes(normalized)) {
      return { kind: 'now' };
    }
    if (normalized === 'true') return { kind: 'literal', value: true };
    if (normalized === 'false') return { kind: 'literal', value: false };
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return { kind: 'literal', value: Number(trimmed) };
    }
    return { kind: 'literal', value: trimmed };
  }
  return { kind: 'literal', value };
}

function normalizeColumn(value: unknown) {
  if (!isRecord(value)) return value;
  const name = normalizeIdentifierText(value.name, 'column');
  const primaryKey = asBoolean(value.primaryKey ?? value.primary_key);
  const notNull = asBoolean(value.not_null ?? value.notNull);
  const nullable = asBoolean(value.nullable);
  const required = asBoolean(value.required);
  return {
    name,
    label: value.label ?? titleFromIdentifier(value.name ?? name, 'Column'),
    type: normalizeScalarType(value.type, name),
    enumName: value.enumName ?? value.enum_name,
    enumValues: value.enumValues ?? value.enum_values ?? value.options,
    nullable:
      nullable ?? (notNull === undefined ? undefined : !notNull) ?? (required ? false : undefined),
    primaryKey,
    unique: asBoolean(value.unique) ?? false,
    default: normalizeDefault(value.default),
    validation: value.validation,
    ui: value.ui,
  };
}

function primaryKeyColumn(column: Record<string, unknown>) {
  const name = typeof column.name === 'string' ? column.name : '';
  return {
    ...column,
    default: name === 'id' ? (column.default ?? { kind: 'uuid' }) : column.default,
    nullable: false,
    primaryKey: true,
    type: name === 'id' ? 'uuid' : column.type,
    ui:
      name === 'id'
        ? {
            ...(isRecord(column.ui) ? column.ui : {}),
            filterable: false,
            formVisible: false,
            listVisible: false,
            sortable: false,
          }
        : column.ui,
    unique: true,
    validation: isRecord(column.validation)
      ? { ...column.validation, required: true }
      : { required: true },
  };
}

function defaultPrimaryKeyColumn() {
  return primaryKeyColumn({
    default: { kind: 'uuid' },
    label: 'ID',
    name: 'id',
    type: 'uuid',
  });
}

function normalizeColumnsForTable(value: unknown) {
  const columns = Array.isArray(value)
    ? value.map((column) => normalizeColumn(column)).filter(isRecord)
    : [];
  const idIndex = columns.findIndex((column) => column.name === 'id');
  const firstPrimaryKeyIndex = columns.findIndex((column) => column.primaryKey === true);
  const primaryKeyIndex = idIndex >= 0 ? idIndex : firstPrimaryKeyIndex;
  if (primaryKeyIndex < 0) return [defaultPrimaryKeyColumn(), ...columns];

  return columns.map((column, index) =>
    index === primaryKeyIndex ? primaryKeyColumn(column) : { ...column, primaryKey: false }
  );
}

export const databaseColumnSchema = z.preprocess(
  normalizeColumn,
  z
    .object({
      name: databaseIdentifierSchema,
      label: z.string().min(1),
      type: databaseScalarTypeSchema,
      enumName: databaseIdentifierSchema.optional(),
      enumValues: z.array(z.string().min(1)).optional(),
      nullable: z.boolean().default(false),
      primaryKey: z.boolean().default(false),
      unique: z.boolean().default(false),
      default: z
        .object({
          kind: z.enum(['uuid', 'now', 'literal', 'none']),
          value: z.unknown().optional(),
        })
        .strict()
        .optional(),
      validation: z
        .object({
          minLength: z.number().int().min(0).optional(),
          maxLength: z.number().int().min(1).optional(),
          min: z.number().optional(),
          max: z.number().optional(),
          pattern: z.string().optional(),
          required: z.boolean().default(true),
        })
        .strict()
        .default({ required: true }),
      ui: z
        .object({
          widget: z
            .enum(['text', 'textarea', 'number', 'checkbox', 'select', 'date', 'datetime', 'json'])
            .optional(),
          placeholder: z.string().optional(),
          listVisible: z.boolean().default(true),
          formVisible: z.boolean().default(true),
          filterable: z.boolean().default(false),
          sortable: z.boolean().default(false),
        })
        .strict()
        .default({
          listVisible: true,
          formVisible: true,
          filterable: false,
          sortable: false,
        }),
    })
    .strict()
);

export const databaseIndexSchema = z
  .object({
    name: databaseIdentifierSchema,
    columns: z.array(databaseIdentifierSchema).min(1),
    unique: z.boolean().default(false),
  })
  .strict();

function normalizeIndex(value: unknown, tableName: string, index: number) {
  const defaultName = (columns: string[], unique: boolean) =>
    normalizeIdentifierText(
      `${tableName}_${columns.join('_')}_${unique ? 'uidx' : 'idx'}`,
      `${tableName}_idx_${index + 1}`
    );

  if (typeof value === 'string') {
    const trimmed = value.trim();
    const parenthesizedColumns = trimmed.match(/\(([^)]+)\)/)?.[1];
    let columns = parenthesizedColumns
      ? normalizeIdentifierList(parenthesizedColumns, tableName)
      : normalizeIdentifierList(trimmed, tableName);

    if (columns.length === 1) {
      const bareName = columns[0] ?? '';
      const withoutIdxPrefix = bareName.replace(new RegExp(`^idx_${tableName}_`), '');
      const withoutTablePrefix = withoutIdxPrefix.replace(new RegExp(`^${tableName}_`), '');
      const withoutSuffix = withoutTablePrefix.replace(/_(u?idx|index)$/, '');
      columns = [normalizeColumnIdentifier(withoutSuffix, tableName)].filter(Boolean);
    }

    if (columns.length === 0) return null;
    return {
      name: defaultName(columns, false),
      columns,
      unique: false,
    };
  }

  if (!isRecord(value)) return null;
  const unique = asBoolean(value.unique ?? value.isUnique ?? value.is_unique) ?? false;
  const columns = normalizeIdentifierList(
    value.columns ?? value.fields ?? value.column ?? value.field,
    tableName
  );
  if (columns.length === 0) return null;
  return {
    name: normalizeIdentifierText(value.name, defaultName(columns, unique)),
    columns,
    unique,
  };
}

function normalizeIndexes(value: unknown, tableName: unknown) {
  if (!Array.isArray(value)) return [];
  const normalizedTableName = normalizeIdentifierText(tableName, 'table');
  return value
    .map((index, itemIndex) => normalizeIndex(index, normalizedTableName, itemIndex))
    .filter(
      (index): index is { name: string; columns: string[]; unique: boolean } => index !== null
    );
}

function normalizeTable(value: unknown) {
  if (!isRecord(value)) return value;
  const name = normalizeIdentifierText(value.name, 'table');
  const ui = isRecord(value.ui)
    ? {
        displayField: normalizeColumnIdentifier(value.ui.displayField, name) || undefined,
        defaultSortField: normalizeColumnIdentifier(value.ui.defaultSortField, name) || undefined,
        defaultSortDirection: value.ui.defaultSortDirection ?? value.ui.default_sort_direction,
      }
    : value.ui;
  return {
    name,
    label: value.label ?? titleFromIdentifier(name, 'Table'),
    description: value.description,
    columns: normalizeColumnsForTable(value.columns),
    indexes: normalizeIndexes(value.indexes, name),
    ui,
  };
}

export const databaseTableSchema = z.preprocess(
  normalizeTable,
  z
    .object({
      name: databaseIdentifierSchema,
      label: z.string().min(1),
      description: z.string().min(1).optional(),
      columns: z.array(databaseColumnSchema).min(1).max(80),
      indexes: z.array(databaseIndexSchema).default([]),
      ui: z
        .object({
          displayField: databaseIdentifierSchema.optional(),
          defaultSortField: databaseIdentifierSchema.optional(),
          defaultSortDirection: z.enum(['asc', 'desc']).default('asc'),
        })
        .strict()
        .default({ defaultSortDirection: 'asc' }),
    })
    .strict()
);

export const databaseRelationSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('one-to-many'),
      name: databaseIdentifierSchema,
      parentTable: databaseIdentifierSchema,
      childTable: databaseIdentifierSchema,
      foreignKeyColumn: databaseIdentifierSchema,
      parentDisplayField: databaseIdentifierSchema.optional(),
      onDelete: z.enum(['cascade', 'restrict', 'set-null']).default('restrict'),
    })
    .strict(),
  z
    .object({
      kind: z.literal('many-to-many'),
      name: databaseIdentifierSchema,
      leftTable: databaseIdentifierSchema,
      rightTable: databaseIdentifierSchema,
      joinTable: databaseIdentifierSchema,
      leftForeignKeyColumn: databaseIdentifierSchema,
      rightForeignKeyColumn: databaseIdentifierSchema,
      leftDisplayField: databaseIdentifierSchema.optional(),
      rightDisplayField: databaseIdentifierSchema.optional(),
      onDelete: z.enum(['cascade', 'restrict']).default('cascade'),
    })
    .strict(),
]);

function normalizeDatabaseSchemaJson(value: unknown) {
  if (Array.isArray(value)) {
    const firstTable = value.find(isRecord);
    const firstTableName = normalizeIdentifierText(firstTable?.name);
    const name = firstTableName ? `${firstTableName}_schema` : 'app_schema';
    return {
      name,
      label: titleFromIdentifier(name, 'Database Schema'),
      purpose: titleFromIdentifier(name, 'Database Schema'),
      tables: value,
      relations: [],
      uiHints: undefined,
    };
  }
  if (!isRecord(value)) return value;
  const tables = Array.isArray(value.tables) ? value.tables : [];
  const firstTable = tables.find(isRecord);
  const firstTableName = normalizeIdentifierText(firstTable?.name);
  const fallbackName = firstTableName ? `${firstTableName}_schema` : 'app_schema';
  const name = normalizeIdentifierText(
    value.name ?? value.label ?? value.purpose ?? value.description,
    fallbackName
  );
  return {
    name,
    label: value.label ?? titleFromIdentifier(name, 'Database Schema'),
    purpose: value.purpose ?? value.description ?? value.label ?? titleFromIdentifier(name),
    tables,
    relations: value.relations,
    uiHints: value.uiHints ?? value.ui_hints,
  };
}

export const databaseSchemaJsonSchema = z.preprocess(
  normalizeDatabaseSchemaJson,
  z
    .object({
      name: databaseIdentifierSchema,
      label: z.string().min(1),
      purpose: z.string().min(1),
      tables: z.array(databaseTableSchema).min(1).max(40),
      relations: z.array(databaseRelationSchema).default([]),
      uiHints: z
        .object({
          primaryTables: z.array(databaseIdentifierSchema).default([]),
          defaultNavigation: z.array(databaseIdentifierSchema).default([]),
          suggestedScreens: z
            .array(
              z
                .object({
                  name: z.string().min(1),
                  table: databaseIdentifierSchema,
                  operation: z.enum(['list', 'detail', 'create', 'edit']),
                })
                .strict()
            )
            .default([]),
        })
        .strict()
        .default({
          primaryTables: [],
          defaultNavigation: [],
          suggestedScreens: [],
        }),
    })
    .strict()
);

export const databaseSchemaDiffSummarySchema = z
  .object({
    addedTables: z.array(databaseIdentifierSchema).default([]),
    changedTables: z.array(databaseIdentifierSchema).default([]),
    removedTables: z.array(databaseIdentifierSchema).default([]),
    destructive: z.boolean().default(false),
  })
  .strict();

export const databaseDesignTriggerSchema = z.enum([
  'initial-prompt',
  'screen-proposal',
  'dbdesign-proposal',
  'db-edit',
  'ui-edit',
  'reset',
]);

export const databaseDesignSessionSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().min(1),
    createdBy: z.string().uuid(),
    activeDatabaseSchemaJsonId: z.string().uuid().nullable().default(null),
    activeScreenJsonId: z.string().uuid().nullable().default(null),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const databaseSchemaJsonRecordSchema = z
  .object({
    id: z.string().uuid(),
    designSessionId: z.string().uuid(),
    version: z.number().int().min(1),
    prompt: z.string().min(1),
    trigger: databaseDesignTriggerSchema,
    schema: databaseSchemaJsonSchema,
    diffSummary: databaseSchemaDiffSummarySchema.default({
      addedTables: [],
      changedTables: [],
      removedTables: [],
      destructive: false,
    }),
    providerMeta: z
      .object({
        provider: z.enum(['openai', 'azure-openai', 'mock']).default('mock'),
        model: z.string().min(1).optional(),
        componentRegistryVersion: z.string().min(1),
      })
      .strict(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const databaseDesignMessageMetadataSchema = z
  .object({
    checkpointLabel: z.string().min(1).optional(),
    checkpointScreenJsonId: z.string().uuid().optional(),
    checkpointDatabaseSchemaJsonId: z.string().uuid().optional(),
    screenVersion: z.number().int().min(1).optional(),
    databaseSchemaVersion: z.number().int().min(1).optional(),
    trigger: databaseDesignTriggerSchema.optional(),
  })
  .catchall(z.unknown());

export const databaseDesignMessageSchema = z
  .object({
    id: z.string().uuid(),
    designSessionId: z.string().uuid(),
    databaseSchemaJsonId: z.string().uuid().nullable().default(null),
    screenJsonId: z.string().uuid().nullable().default(null),
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1),
    metadata: databaseDesignMessageMetadataSchema.default({}),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const databaseDesignProposeRequestSchema = z
  .object({
    prompt: z.string().trim().min(1).max(4000),
    source: z.enum(['screen', 'dbdesign']).default('dbdesign'),
    designSessionId: z.string().uuid().optional(),
    screenJsonId: z.string().uuid().optional(),
  })
  .strict();

export const databaseDesignEditRequestSchema = z
  .object({
    prompt: z.string().trim().min(1).max(4000),
  })
  .strict();

const databaseDesignRationaleObjectSchema = z
  .object({
    databaseChanges: z.array(z.string()).default([]),
    uiBindings: z.array(z.string()).default([]),
  })
  .strict();

function stringList(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function normalizeRationale(value: unknown) {
  if (typeof value === 'string') {
    return { databaseChanges: [value], uiBindings: [] };
  }
  if (!isRecord(value)) return value;
  return {
    databaseChanges: [
      ...stringList(value.databaseChanges),
      ...stringList(value.database_changes),
      ...stringList(value.summary),
      ...stringList(value.notes),
    ],
    uiBindings: [...stringList(value.uiBindings), ...stringList(value.ui_bindings)],
  };
}

function inferOperationFromId(value: unknown) {
  if (typeof value !== 'string') return 'list';
  const normalized = normalizeIdentifierText(value);
  if (/(^|_)(detail|get|show|read_one)(_|$)/.test(normalized)) return 'get';
  if (/(^|_)(create|new|insert|add|form)(_|$)/.test(normalized)) return 'create';
  if (/(^|_)(update|edit|modify|save|upsert)(_|$)/.test(normalized)) return 'update';
  if (/(^|_)(delete|remove|destroy)(_|$)/.test(normalized)) return 'delete';
  if (/(^|_)(attach|connect|link)(_|$)/.test(normalized)) return 'attach';
  if (/(^|_)(detach|disconnect|unlink)(_|$)/.test(normalized)) return 'detach';
  return 'list';
}

function normalizeDataBindingOperation(value: unknown, fallbackId?: string) {
  if (typeof value !== 'string') return inferOperationFromId(fallbackId);
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  const aliases: Record<string, string> = {
    add: 'create',
    all: 'list',
    browse: 'list',
    cards: 'list',
    connect: 'attach',
    datatable: 'list',
    detail: 'get',
    disconnect: 'detach',
    destroy: 'delete',
    display: 'list',
    edit: 'update',
    form: 'create',
    grid: 'list',
    index: 'list',
    insert: 'create',
    link: 'attach',
    modify: 'update',
    new: 'create',
    read: 'list',
    read_many: 'list',
    read_one: 'get',
    remove: 'delete',
    save: 'update',
    search: 'list',
    select: 'list',
    show: 'get',
    table: 'list',
    unlink: 'detach',
    upsert: 'update',
    view: 'list',
  };
  const operation = aliases[normalized] ?? normalized;
  return dataBindingOperationSchema.safeParse(operation).success
    ? operation
    : inferOperationFromId(fallbackId);
}

function inferTableFromId(value: unknown) {
  const normalized = normalizeIdentifierText(value);
  if (!normalized) return '';
  const match = normalized.match(
    /^(.*)_(list|get|detail|show|create|new|insert|add|form|grid|table|datatable|cards|index|browse|view|search|update|edit|modify|save|upsert|delete|remove|destroy|attach|connect|link|detach|disconnect|unlink)$/
  );
  return match?.[1] ? normalizeIdentifierText(match[1]) : '';
}

function normalizeDataBindingFilters(value: unknown, tableName?: string) {
  const filters = Array.isArray(value)
    ? value
    : isRecord(value)
      ? Object.entries(value).map(([field, filter]) =>
          isRecord(filter) ? { field, ...filter } : { field, value: filter }
        )
      : [];

  return filters
    .filter(isRecord)
    .map((filter) => ({
      field: normalizeColumnIdentifier(filter.field, tableName),
      operator: filter.operator ?? 'eq',
      valueFrom: filter.valueFrom ?? filter.value_from,
      value: filter.value,
    }))
    .filter((filter) => filter.field.length > 0);
}

function normalizeDataBindingSort(value: unknown, tableName?: string) {
  const sortItems = Array.isArray(value) ? value : isRecord(value) ? [value] : [];
  return sortItems
    .filter(isRecord)
    .map((sort) => ({
      field: normalizeColumnIdentifier(sort.field ?? sort.column, tableName),
      direction: sort.direction ?? 'asc',
    }))
    .filter((sort) => sort.field.length > 0);
}

function normalizeDataBinding(value: unknown, fallbackId?: string) {
  if (!isRecord(value)) return value;
  const rawId = value.id ?? fallbackId;
  const table = normalizeIdentifierText(
    value.table ??
      value.tableName ??
      value.table_name ??
      value.targetTable ??
      value.target_table ??
      value.sourceTable ??
      value.source_table ??
      value.entity ??
      value.model ??
      value.collection,
    inferTableFromId(rawId)
  );
  if (!table) return null;
  const operation = normalizeDataBindingOperation(
    value.operation ??
      value.action ??
      value.kind ??
      value.type ??
      value.bindingType ??
      value.binding_type,
    typeof rawId === 'string' ? rawId : undefined
  );
  const id = normalizeIdentifierText(rawId, `${table}_${operation}`);
  return {
    id,
    table,
    operation,
    fields: normalizeIdentifierList(value.fields ?? value.columns, table),
    relations: normalizeIdentifierList(value.relations),
    filters: normalizeDataBindingFilters(value.filters, table),
    sort: normalizeDataBindingSort(value.sort ?? value.orderBy ?? value.order_by, table),
    limit: value.limit,
  };
}

function normalizeDataBindings(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((binding) => normalizeDataBinding(binding)).filter(isRecord);
  }
  if (!isRecord(value)) return value;
  const nested = value.bindings ?? value.dataBindings ?? value.data_bindings;
  if (Array.isArray(nested)) {
    return nested.map((binding) => normalizeDataBinding(binding)).filter(isRecord);
  }
  return Object.entries(value)
    .filter(([, binding]) => isRecord(binding))
    .map(([id, binding]) => normalizeDataBinding(binding, id))
    .filter(isRecord);
}

const databaseDesignRationaleSchema = z.preprocess(
  normalizeRationale,
  databaseDesignRationaleObjectSchema.default({ databaseChanges: [], uiBindings: [] })
);

const databaseDesignDataBindingsSchema = z.preprocess(
  normalizeDataBindings,
  z.array(dataBindingDraftSchema).default([])
);

const databaseDesignScreenSchema = z.preprocess((value) => {
  if (value === undefined || value === null) return undefined;
  const parsed = appUiSchemaSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}, appUiSchemaSchema.optional());

export const databaseDesignDraftResponseSchema = z
  .object({
    screen: databaseDesignScreenSchema,
    databaseSchema: databaseSchemaJsonSchema,
    dataBindings: databaseDesignDataBindingsSchema,
    rationale: databaseDesignRationaleSchema,
  })
  .strict();

export const sandboxMigrationPreviewSchema = z
  .object({
    databaseSchemaJsonId: z.string().uuid(),
    sql: z.string(),
    warnings: z.array(z.string()).default([]),
    destructive: z.boolean().default(false),
    requiresConfirmation: z.boolean().default(false),
  })
  .strict();

export const sandboxMigrationApplyRequestSchema = z
  .object({
    confirmation: z.string().optional(),
  })
  .strict();

export const sandboxResetRequestSchema = z
  .object({
    confirmation: z.string(),
  })
  .strict();

export const sandboxResetResponseSchema = z
  .object({
    success: z.boolean(),
    droppedObjects: z.number().int().min(0),
  })
  .strict();

export const sandboxMigrationRunSchema = z
  .object({
    id: z.string().uuid(),
    databaseSchemaJsonId: z.string().uuid(),
    status: z.enum(['pending', 'applied', 'failed', 'reverted']),
    fromVersion: z.number().int().min(1).nullable().default(null),
    toVersion: z.number().int().min(1),
    sql: z.string(),
    checksum: z.string(),
    appliedAt: z.string().datetime().nullable().default(null),
    errorMessage: z.string().nullable().default(null),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const databaseDesignConversationResponseSchema = z
  .object({
    session: databaseDesignSessionSchema,
    activeDatabaseSchemaJsonId: z.string().uuid().nullable(),
    activeScreenJsonId: z.string().uuid().nullable(),
    databaseSchemaJsons: z.array(databaseSchemaJsonRecordSchema),
    messages: z.array(databaseDesignMessageSchema),
    dataBindings: z.array(dataBindingSchema).default([]),
  })
  .strict();

export const databaseDesignResponseSchema = z
  .object({
    session: databaseDesignSessionSchema,
    databaseSchemaJson: databaseSchemaJsonRecordSchema,
    screen: appUiSchemaSchema.optional(),
    screenJsonId: z.string().uuid().nullable().default(null),
    dataBindings: z.array(dataBindingSchema).default([]),
    activities: z.array(aiActivitySchema).default([]),
    migrationPreview: sandboxMigrationPreviewSchema.optional(),
    conversation: databaseDesignConversationResponseSchema.optional(),
  })
  .strict();

export const databaseSchemaJsonResponseSchema = z
  .object({
    databaseSchemaJson: databaseSchemaJsonRecordSchema,
    schemaJson: z.string().min(1),
  })
  .strict();

export const databaseCheckpointRestoreRequestSchema = z
  .object({
    screenJsonId: z.string().uuid().optional(),
    databaseSchemaJsonId: z.string().uuid().optional(),
  })
  .strict()
  .refine((value) => value.screenJsonId || value.databaseSchemaJsonId, {
    message: 'screenJsonId or databaseSchemaJsonId is required',
  });

export const sandboxStateResponseSchema = z
  .object({
    appliedDatabaseSchemaJsonId: z.string().uuid().nullable(),
    appliedVersion: z.number().int().min(1).nullable(),
    tables: z.array(
      z
        .object({
          name: databaseIdentifierSchema,
          rowCount: z.number().int().min(0),
          managed: z.boolean(),
        })
        .strict()
    ),
  })
  .strict();

export const sandboxRowsResponseSchema = z
  .object({
    table: databaseIdentifierSchema,
    rows: z.array(z.record(z.string(), z.unknown())).default([]),
  })
  .strict();

export const sandboxRelationAttachRequestSchema = z
  .object({
    leftId: z.string().uuid(),
    rightId: z.string().uuid(),
  })
  .strict();

export const sandboxRowResponseSchema = z
  .object({
    table: databaseIdentifierSchema,
    row: z.record(z.string(), z.unknown()),
  })
  .strict();

export const sandboxDeleteResponseSchema = z.object({ success: z.boolean() }).strict();

export type DatabaseScalarType = z.infer<typeof databaseScalarTypeSchema>;
export type DatabaseColumn = z.infer<typeof databaseColumnSchema>;
export type DatabaseIndex = z.infer<typeof databaseIndexSchema>;
export type DatabaseTable = z.infer<typeof databaseTableSchema>;
export type DatabaseRelation = z.infer<typeof databaseRelationSchema>;
export type DatabaseSchemaJson = z.infer<typeof databaseSchemaJsonSchema>;
export type DatabaseSchemaDiffSummary = z.infer<typeof databaseSchemaDiffSummarySchema>;
export type DatabaseDesignTrigger = z.infer<typeof databaseDesignTriggerSchema>;
export type DatabaseDesignSession = z.infer<typeof databaseDesignSessionSchema>;
export type DatabaseSchemaJsonRecord = z.infer<typeof databaseSchemaJsonRecordSchema>;
export type DatabaseDesignMessage = z.infer<typeof databaseDesignMessageSchema>;
export type DatabaseDesignProposeRequest = z.infer<typeof databaseDesignProposeRequestSchema>;
export type DatabaseDesignEditRequest = z.infer<typeof databaseDesignEditRequestSchema>;
export type DatabaseDesignDraftResponse = z.infer<typeof databaseDesignDraftResponseSchema>;
export type SandboxMigrationPreview = z.infer<typeof sandboxMigrationPreviewSchema>;
export type SandboxMigrationRun = z.infer<typeof sandboxMigrationRunSchema>;
export type SandboxResetRequest = z.infer<typeof sandboxResetRequestSchema>;
export type SandboxResetResponse = z.infer<typeof sandboxResetResponseSchema>;
export type DatabaseDesignConversationResponse = z.infer<
  typeof databaseDesignConversationResponseSchema
>;
export type DatabaseDesignResponse = z.infer<typeof databaseDesignResponseSchema>;
export type DatabaseSchemaJsonResponse = z.infer<typeof databaseSchemaJsonResponseSchema>;
export type DatabaseCheckpointRestoreRequest = z.infer<
  typeof databaseCheckpointRestoreRequestSchema
>;
export type SandboxStateResponse = z.infer<typeof sandboxStateResponseSchema>;
export type SandboxRowsResponse = z.infer<typeof sandboxRowsResponseSchema>;
export type SandboxRelationAttachRequest = z.infer<typeof sandboxRelationAttachRequestSchema>;
export type SandboxRowResponse = z.infer<typeof sandboxRowResponseSchema>;
export type SandboxDeleteResponse = z.infer<typeof sandboxDeleteResponseSchema>;
