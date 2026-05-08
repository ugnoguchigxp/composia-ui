import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { AiActivity } from '../../../shared/schemas/ai.schema';
import type { DataBindingDraft } from '../../../shared/schemas/data-binding.schema';
import type {
  DatabaseColumn,
  DatabaseDesignDraftResponse,
  DatabaseIndex,
  DatabaseRelation,
  DatabaseSchemaJson,
  DatabaseTable,
  SandboxStateResponse,
} from '../../../shared/schemas/database-design.schema';
import {
  databaseDesignDraftResponseSchema,
  isDatabaseSystemColumnName,
} from '../../../shared/schemas/database-design.schema';
import type { AppUiSchema, AppUiSchemaSection } from '../../../shared/schemas/ui-schema.schema';
import { config } from '../../config';
import { AppError, ValidationError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { layoutSystemContextVersion } from '../ai/ai.provider';

const dbDesignInputTokenLimit = 24_000;
const dbDesignMaxOutputTokens = 24_000;
const dbDesignReasoningEffort = 'minimal';
const dbDesignProviderProgressLogIntervalMs = 5000;
const componentRegistryVersion = `component-registry-v2:${layoutSystemContextVersion}`;
const dbDesignSystemInstructions =
  'You design DBDesignJob JSON for PostgreSQL-backed screens. Return JSON only. Never create SQL.';

export type DatabaseDesignProviderInput = {
  currentDatabaseSchema?: DatabaseSchemaJson | null;
  currentSandboxState?: SandboxStateResponse | null;
  currentScreen?: AppUiSchema | null;
  selectedDraftPrompt?: string | null;
  selectedDraftSchema?: DatabaseSchemaJson | null;
  prompt: string;
  source: 'screen' | 'dbdesign' | 'reproposal';
};

export type DatabaseDesignProviderOutput = {
  activities: AiActivity[];
  draft: DatabaseDesignDraftResponse;
  providerMeta: {
    provider: 'openai' | 'azure-openai' | 'mock';
    model?: string;
    componentRegistryVersion: string;
  };
};

export type DatabaseDesignProvider = {
  propose: (input: DatabaseDesignProviderInput) => Promise<DatabaseDesignProviderOutput>;
};

const databaseDesignJobIdentifierSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_]*$/, 'Use snake_case identifiers starting with a letter');

const databaseDesignJobFieldTypeSchema = z.enum([
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

const databaseDesignJobFieldSchema = z
  .object({
    name: databaseDesignJobIdentifierSchema,
    label: z.string().min(1),
    type: databaseDesignJobFieldTypeSchema,
    required: z.boolean().default(true),
    unique: z.boolean().default(false),
    enumName: databaseDesignJobIdentifierSchema.optional(),
    enumValues: z.array(z.string().min(1)).optional(),
    listVisible: z.boolean().default(true),
    formVisible: z.boolean().default(true),
    filterable: z.boolean().default(false),
    sortable: z.boolean().default(false),
    widget: z
      .enum(['text', 'textarea', 'number', 'checkbox', 'select', 'date', 'datetime', 'json'])
      .optional(),
  })
  .superRefine((field, context) => {
    if (field.type === 'enum' && (!field.enumValues || field.enumValues.length === 0)) {
      context.addIssue({
        code: 'custom',
        message: 'enum fields require enumValues',
        path: ['enumValues'],
      });
    }
  });

const databaseDesignJobTableSchema = z.object({
  name: databaseDesignJobIdentifierSchema,
  label: z.string().min(1),
  description: z.string().min(1).optional(),
  fields: z.array(databaseDesignJobFieldSchema).default([]),
});

const databaseDesignJobRelationshipSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('one_to_many'),
    parentTable: databaseDesignJobIdentifierSchema,
    childTable: databaseDesignJobIdentifierSchema,
    foreignKeyColumn: databaseDesignJobIdentifierSchema.optional(),
    required: z.boolean().default(true),
    onDelete: z.enum(['cascade', 'restrict', 'set-null']).default('restrict'),
  }),
  z.object({
    kind: z.literal('many_to_many'),
    leftTable: databaseDesignJobIdentifierSchema,
    rightTable: databaseDesignJobIdentifierSchema,
    joinTable: databaseDesignJobIdentifierSchema,
    onDelete: z.enum(['cascade', 'restrict']).default('cascade'),
  }),
]);

const databaseDesignJobSchema = z.object({
  name: databaseDesignJobIdentifierSchema,
  label: z.string().min(1),
  purpose: z.string().min(1),
  tables: z.array(databaseDesignJobTableSchema).min(1).max(40),
  relationships: z.array(databaseDesignJobRelationshipSchema).default([]),
  primaryTables: z.array(databaseDesignJobIdentifierSchema).default([]),
  notes: z.array(z.string().min(1)).default([]),
});

type DatabaseDesignJob = z.infer<typeof databaseDesignJobSchema>;
type DatabaseDesignJobField = z.infer<typeof databaseDesignJobFieldSchema>;
type DatabaseDesignJobRelationship = z.infer<typeof databaseDesignJobRelationshipSchema>;

function estimateTokens(text: string) {
  return Math.ceil(text.length / 3);
}

function providerError(message: string, details?: Record<string, unknown>) {
  return new AppError(502, 'AI_PROVIDER_ERROR', message, details);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function durationMs(startedAt: number) {
  return Date.now() - startedAt;
}

function textPreview(text: string, limit = 500) {
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function schemaSummary(schema?: DatabaseSchemaJson | null) {
  if (!schema) return null;
  return {
    name: schema.name,
    tableCount: schema.tables.length,
    relationCount: schema.relations.length,
    tables: schema.tables.map((table) => table.name),
  };
}

function screenSummary(screen?: AppUiSchema | null) {
  if (!screen) return null;
  return {
    page: screen.page,
    layout: screen.layout,
    sectionCount: screen.sections.length,
    components: screen.sections.map((section) => section.component),
  };
}

function sandboxStateSummary(state?: SandboxStateResponse | null) {
  if (!state) return null;
  return {
    tableCount: state.tables.length,
    tables: state.tables.map((table) => ({
      columnCount: table.columns.length,
      managed: table.managed,
      name: table.name,
    })),
  };
}

function responsePayloadSummary(payload: Record<string, unknown>) {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const output = Array.isArray(payload.output) ? payload.output : [];
  const choiceSummaries = choices.map((choice) => {
    if (typeof choice !== 'object' || choice === null) return { type: typeof choice };
    const message = (choice as { message?: unknown }).message;
    const content = isRecord(message) ? message.content : undefined;
    return {
      finishReason: (choice as { finish_reason?: unknown }).finish_reason,
      messageKeys: isRecord(message) ? Object.keys(message) : [],
      contentType: typeof content,
      contentLength: typeof content === 'string' ? content.length : undefined,
      contentFilterResults: (choice as { content_filter_results?: unknown }).content_filter_results,
    };
  });
  return {
    id: payload.id,
    keys: Object.keys(payload),
    model: payload.model,
    outputTextLength: typeof payload.output_text === 'string' ? payload.output_text.length : null,
    outputCount: output.length,
    choicesCount: choices.length,
    choices: choiceSummaries,
    promptFilterResults: payload.prompt_filter_results,
    usage: payload.usage,
  };
}

function emptyTextCause(payload: Record<string, unknown>) {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const firstChoice = choices[0];
  const finishReason =
    typeof firstChoice === 'object' && firstChoice !== null
      ? (firstChoice as { finish_reason?: unknown }).finish_reason
      : undefined;
  const usage = isRecord(payload.usage) ? payload.usage : {};
  const completionTokens =
    typeof usage.completion_tokens === 'number' ? usage.completion_tokens : undefined;
  const completionDetails = isRecord(usage.completion_tokens_details)
    ? usage.completion_tokens_details
    : {};
  const reasoningTokens =
    typeof completionDetails.reasoning_tokens === 'number'
      ? completionDetails.reasoning_tokens
      : undefined;

  if (finishReason === 'length' && completionTokens && reasoningTokens === completionTokens) {
    return 'completion_budget_exhausted_by_reasoning';
  }
  if (finishReason === 'length') return 'completion_budget_exhausted';
  return undefined;
}

function emptyTextDetails(
  payload: Record<string, unknown>,
  trace: ProviderTrace,
  extractionPath: string
) {
  return {
    cause: emptyTextCause(payload),
    extractionPath,
    payloadSummary: responsePayloadSummary(payload),
    textChars: 0,
    traceId: trace.traceId,
  };
}

function identifierOrFallback(value: string, fallback: string) {
  const normalized = value.trim().toLowerCase();
  return databaseDesignJobIdentifierSchema.safeParse(normalized).success ? normalized : fallback;
}

function titleCase(value: string) {
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function textColumn(name: string, label: string, overrides: Partial<DatabaseColumn> = {}) {
  return {
    name,
    label,
    type: 'text' as const,
    nullable: false,
    primaryKey: false,
    unique: false,
    default: { kind: 'none' as const },
    validation: { required: true },
    ui: { listVisible: true, formVisible: true, filterable: true, sortable: false },
    ...overrides,
  };
}

function systemColumns(options: { includeActiveFlag?: boolean } = {}): DatabaseColumn[] {
  const columns: DatabaseColumn[] = [
    {
      name: 'id',
      label: 'ID',
      type: 'uuid',
      nullable: false,
      primaryKey: true,
      unique: true,
      default: { kind: 'uuid' },
      validation: { required: true },
      ui: { listVisible: false, formVisible: false, filterable: false, sortable: false },
    },
    {
      name: 'created_at',
      label: '作成日時',
      type: 'timestamp',
      nullable: false,
      primaryKey: false,
      unique: false,
      default: { kind: 'now' },
      validation: { required: true },
      ui: { listVisible: false, formVisible: false, filterable: false, sortable: false },
    },
    {
      name: 'updated_at',
      label: '最終更新日時',
      type: 'timestamp',
      nullable: false,
      primaryKey: false,
      unique: false,
      default: { kind: 'now' },
      validation: { required: true },
      ui: { listVisible: false, formVisible: false, filterable: false, sortable: false },
    },
  ];
  if (options.includeActiveFlag !== false) {
    columns.push({
      name: 'is_active',
      label: 'アクティブ',
      type: 'boolean',
      nullable: false,
      primaryKey: false,
      unique: false,
      default: { kind: 'literal', value: true },
      validation: { required: true },
      ui: { listVisible: false, formVisible: false, filterable: false, sortable: false },
    });
  }
  return columns;
}

function columnTypeFromField(field: Record<string, unknown>) {
  const type = String(field.type ?? '').toLowerCase();
  if (type === 'number') return 'numeric' as const;
  if (type === 'checkbox') return 'boolean' as const;
  if (type === 'date') return 'date' as const;
  if (type === 'select') return 'enum' as const;
  return 'text' as const;
}

function columnFromField(field: Record<string, unknown>, index: number): DatabaseColumn {
  const label = String(field.label ?? field.name ?? `項目 ${index + 1}`);
  const name = identifierOrFallback(String(field.name ?? label), `field_${index + 1}`);
  const type = columnTypeFromField(field);
  const options = Array.isArray(field.options) ? field.options : [];
  return textColumn(name, label, {
    type,
    enumName: type === 'enum' ? `${name}_status` : undefined,
    enumValues:
      type === 'enum'
        ? options
            .map((option) => {
              if (typeof option === 'object' && option !== null && 'value' in option) {
                return String((option as { value: unknown }).value);
              }
              return String(option);
            })
            .filter(Boolean)
        : undefined,
    nullable: field.required === false,
    ui: {
      listVisible: true,
      formVisible: true,
      filterable: type === 'enum' || type === 'text',
      sortable: true,
      widget: type === 'enum' ? 'select' : undefined,
    },
  });
}

function columnsFromScreen(screen: AppUiSchema | null | undefined, tableName: string) {
  const columns = new Map<string, DatabaseColumn>();
  for (const section of screen?.sections ?? []) {
    if (section.component === 'DataTableSection') {
      const tableColumns = Array.isArray(section.props.columns) ? section.props.columns : [];
      for (const [index, column] of tableColumns.entries()) {
        if (typeof column !== 'object' || column === null) continue;
        const raw = column as { key?: unknown; label?: unknown };
        const label = String(raw.label ?? raw.key ?? `項目 ${index + 1}`);
        const name = identifierOrFallback(String(raw.key ?? raw.label ?? ''), `field_${index + 1}`);
        if (name !== 'id' && !columns.has(name)) columns.set(name, textColumn(name, label));
      }
    }
    if (section.component === 'FormSection') {
      const fields = Array.isArray(section.props.fields) ? section.props.fields : [];
      for (const [index, field] of fields.entries()) {
        if (typeof field !== 'object' || field === null) continue;
        const column = columnFromField(field as Record<string, unknown>, index);
        if (column.name !== 'id' && !columns.has(column.name)) columns.set(column.name, column);
      }
    }
  }

  if (columns.size === 0) {
    columns.set('name', textColumn('name', tableName === 'products' ? '商品名' : '名前'));
    columns.set('description', textColumn('description', '説明', { nullable: true }));
    columns.set('status', textColumn('status', '状態', { nullable: true }));
  }

  return [...systemColumns(), ...columns.values()];
}

function dataBindingForTable(tableName: string, operation: DataBindingDraft['operation']) {
  return {
    id: `${tableName}_${operation}`,
    table: tableName,
    operation,
    fields: [],
    relations: [],
    filters: [],
    sort: [{ field: 'created_at', direction: 'desc' as const }],
    limit: 50,
  };
}

function bindScreen(
  screen: AppUiSchema | null | undefined,
  tableName: string,
  bindings: DataBindingDraft[]
) {
  if (!screen) return undefined;
  const sections = screen.sections.map((section): AppUiSchemaSection => {
    if (section.dataBindingId) return section;
    if (
      ['DataTableSection', 'CardGridSection', 'MasterDetailSection', 'KanbanSection'].includes(
        section.component
      )
    ) {
      return { ...section, dataBindingId: `${tableName}_list`, source: 'postgres' };
    }
    if (section.component === 'FormSection') {
      return { ...section, dataBindingId: `${tableName}_create`, source: 'postgres' };
    }
    return section;
  });

  for (const section of sections) {
    if (!section.dataBindingId) continue;
    const exists = bindings.some((binding) => binding.id === section.dataBindingId);
    if (!exists && section.dataBindingId.endsWith('_create')) {
      bindings.push(dataBindingForTable(tableName, 'create'));
    }
  }
  return { ...screen, sections };
}

function widgetForField(field: DatabaseDesignJobField): DatabaseColumn['ui']['widget'] {
  if (field.widget) return field.widget;
  if (field.type === 'numeric' || field.type === 'integer' || field.type === 'bigint') {
    return 'number';
  }
  if (field.type === 'boolean') return 'checkbox';
  if (field.type === 'date') return 'date';
  if (field.type === 'timestamp') return 'datetime';
  if (field.type === 'jsonb') return 'json';
  if (field.type === 'enum') return 'select';
  return 'text';
}

function columnFromJobField(field: DatabaseDesignJobField): DatabaseColumn {
  return textColumn(field.name, field.label, {
    type: field.type,
    enumName: field.type === 'enum' ? (field.enumName ?? `${field.name}_enum`) : undefined,
    enumValues: field.type === 'enum' ? field.enumValues : undefined,
    nullable: !field.required,
    unique: field.unique,
    validation: { required: field.required },
    ui: {
      listVisible: field.listVisible,
      formVisible: field.formVisible,
      filterable: field.filterable,
      sortable: field.sortable,
      widget: widgetForField(field),
    },
  });
}

function displayFieldForTable(columns: DatabaseColumn[]) {
  for (const preferred of ['name', 'title', 'email']) {
    if (columns.some((column) => column.name === preferred)) return preferred;
  }
  return columns.find((column) => !column.primaryKey && column.ui.listVisible)?.name;
}

function tableFromJobTable(table: DatabaseDesignJob['tables'][number]): DatabaseTable {
  const fieldColumns = table.fields
    .filter((field) => !isDatabaseSystemColumnName(field.name))
    .map((field) => columnFromJobField(field));
  const columns = [...systemColumns(), ...fieldColumns];
  const displayField = displayFieldForTable(columns);
  return {
    name: table.name,
    label: table.label,
    description: table.description,
    columns,
    indexes: [],
    ui: {
      displayField,
      defaultSortField: 'created_at',
      defaultSortDirection: 'desc',
    },
  };
}

function singularName(tableName: string) {
  if (tableName.endsWith('ies') && tableName.length > 3) return `${tableName.slice(0, -3)}y`;
  if (tableName.endsWith('s') && tableName.length > 1) return tableName.slice(0, -1);
  return tableName;
}

function foreignKeyColumn(name: string, label: string, required: boolean): DatabaseColumn {
  return textColumn(name, label, {
    type: 'uuid',
    nullable: !required,
    validation: { required },
    ui: {
      listVisible: false,
      formVisible: true,
      filterable: true,
      sortable: false,
    },
  });
}

function ensureColumn(table: DatabaseTable, column: DatabaseColumn): DatabaseTable {
  if (table.columns.some((existing) => existing.name === column.name)) return table;
  return { ...table, columns: [...table.columns, column] };
}

function uniqueIdentifier(base: string, used: Set<string>) {
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function addIndexSpec(
  specs: Map<string, { columns: string[]; unique: boolean }[]>,
  table: string,
  columns: string[],
  unique: boolean
) {
  specs.set(table, [...(specs.get(table) ?? []), { columns, unique }]);
}

function indexName(table: string, columns: string[], unique: boolean) {
  return `${table}_${columns.join('_')}_${unique ? 'uidx' : 'idx'}`;
}

function indexesForTable(
  table: DatabaseTable,
  relationIndexSpecs: { columns: string[]; unique: boolean }[]
): DatabaseIndex[] {
  const usedNames = new Set<string>();
  const specs = [
    ...table.columns
      .filter((column) => column.unique && !column.primaryKey)
      .map((column) => ({ columns: [column.name], unique: true })),
    ...relationIndexSpecs,
  ];
  return specs.map((spec) => ({
    name: uniqueIdentifier(indexName(table.name, spec.columns, spec.unique), usedNames),
    columns: spec.columns,
    unique: spec.unique,
  }));
}

function relationFromJob(
  relationship: DatabaseDesignJobRelationship,
  tables: Map<string, DatabaseTable>,
  usedRelationNames: Set<string>,
  indexSpecs: Map<string, { columns: string[]; unique: boolean }[]>
): DatabaseRelation {
  if (relationship.kind === 'one_to_many') {
    const parent = tables.get(relationship.parentTable);
    const child = tables.get(relationship.childTable);
    const foreignKeyColumnName =
      relationship.foreignKeyColumn ?? `${singularName(relationship.parentTable)}_id`;
    const foreignKeyRequired = relationship.onDelete === 'set-null' ? false : relationship.required;
    if (child) {
      tables.set(
        child.name,
        ensureColumn(
          child,
          foreignKeyColumn(
            foreignKeyColumnName,
            `${parent?.label ?? titleCase(relationship.parentTable)} ID`,
            foreignKeyRequired
          )
        )
      );
      addIndexSpec(indexSpecs, child.name, [foreignKeyColumnName], false);
    }
    return {
      kind: 'one-to-many',
      name: uniqueIdentifier(
        `${relationship.parentTable}_${relationship.childTable}`,
        usedRelationNames
      ),
      parentTable: relationship.parentTable,
      childTable: relationship.childTable,
      foreignKeyColumn: foreignKeyColumnName,
      parentDisplayField: parent?.ui.displayField,
      onDelete: relationship.onDelete,
    };
  }

  const left = tables.get(relationship.leftTable);
  const right = tables.get(relationship.rightTable);
  const leftForeignKeyColumn = `${singularName(relationship.leftTable)}_id`;
  const rightForeignKeyColumn = `${singularName(relationship.rightTable)}_id`;
  const existingJoin = tables.get(relationship.joinTable);
  const join = existingJoin ?? {
    name: relationship.joinTable,
    label: `${left?.label ?? titleCase(relationship.leftTable)} ${
      right?.label ?? titleCase(relationship.rightTable)
    }`,
    description: `${relationship.leftTable} to ${relationship.rightTable}`,
    columns: systemColumns({ includeActiveFlag: false }),
    indexes: [],
    ui: { defaultSortField: 'created_at', defaultSortDirection: 'desc' as const },
  };

  tables.set(
    relationship.joinTable,
    ensureColumn(
      ensureColumn(
        join,
        foreignKeyColumn(
          leftForeignKeyColumn,
          `${left?.label ?? titleCase(relationship.leftTable)} ID`,
          true
        )
      ),
      foreignKeyColumn(
        rightForeignKeyColumn,
        `${right?.label ?? titleCase(relationship.rightTable)} ID`,
        true
      )
    )
  );
  addIndexSpec(
    indexSpecs,
    relationship.joinTable,
    [leftForeignKeyColumn, rightForeignKeyColumn],
    true
  );

  return {
    kind: 'many-to-many',
    name: uniqueIdentifier(
      `${relationship.leftTable}_${relationship.rightTable}`,
      usedRelationNames
    ),
    leftTable: relationship.leftTable,
    rightTable: relationship.rightTable,
    joinTable: relationship.joinTable,
    leftForeignKeyColumn,
    rightForeignKeyColumn,
    leftDisplayField: left?.ui.displayField,
    rightDisplayField: right?.ui.displayField,
    onDelete: relationship.onDelete,
  };
}

function dataBindingsForSchema(schema: DatabaseSchemaJson): DataBindingDraft[] {
  const bindingTables =
    schema.uiHints.primaryTables.length > 0
      ? schema.uiHints.primaryTables
      : schema.tables.slice(0, 1).map((table) => table.name);
  return bindingTables.flatMap((table) => [
    dataBindingForTable(table, 'list'),
    dataBindingForTable(table, 'create'),
  ]);
}

export function draftFromDatabaseDesignJob(
  jobInput: z.input<typeof databaseDesignJobSchema>,
  input: DatabaseDesignProviderInput
): DatabaseDesignDraftResponse {
  const job = databaseDesignJobSchema.parse(jobInput);
  const tableMap = new Map(job.tables.map((table) => [table.name, tableFromJobTable(table)]));
  const usedRelationNames = new Set<string>();
  const indexSpecs = new Map<string, { columns: string[]; unique: boolean }[]>();
  const relations = job.relationships.map((relationship) =>
    relationFromJob(relationship, tableMap, usedRelationNames, indexSpecs)
  );
  const tables = [...tableMap.values()].map((table) => ({
    ...table,
    indexes: indexesForTable(table, indexSpecs.get(table.name) ?? []),
  }));
  const tableNames = new Set(tables.map((table) => table.name));
  const selectedPrimaryTables =
    job.primaryTables.length > 0 ? job.primaryTables : [tables[0]?.name].filter(Boolean);
  const databaseSchema: DatabaseSchemaJson = {
    name: job.name,
    label: job.label,
    purpose: job.purpose,
    tables,
    relations,
    uiHints: {
      primaryTables: selectedPrimaryTables,
      defaultNavigation: job.tables
        .map((table) => table.name)
        .filter((table) => tableNames.has(table)),
      suggestedScreens: selectedPrimaryTables.flatMap((table) => [
        { name: `${titleCase(table)} List`, table, operation: 'list' as const },
        { name: `${titleCase(table)} Create`, table, operation: 'create' as const },
      ]),
    },
  };
  const dataBindings = dataBindingsForSchema(databaseSchema);
  const screen = bindScreen(
    input.currentScreen,
    selectedPrimaryTables[0] ?? tables[0]?.name,
    dataBindings
  );

  return databaseDesignDraftResponseSchema.parse({
    screen,
    databaseSchema,
    dataBindings,
    rationale: {
      databaseChanges: job.notes.length > 0 ? job.notes : [`${job.label} schemaを提案`],
      uiBindings: screen ? ['既存UIの主要セクションにdataBindingIdを付与'] : [],
    },
  });
}

function deterministicDraft(input: DatabaseDesignProviderInput): DatabaseDesignDraftResponse {
  const tableName = 'records';
  const label = input.currentScreen?.page ?? 'Records';
  const columns = columnsFromScreen(input.currentScreen, tableName);
  const displayField = displayFieldForTable(columns);
  const databaseSchema = {
    name: 'app_schema',
    label,
    purpose: input.prompt,
    tables: [
      {
        name: tableName,
        label,
        description: input.prompt,
        columns,
        indexes: displayField
          ? [{ name: `${tableName}_${displayField}_idx`, columns: [displayField], unique: false }]
          : [],
        ui: {
          displayField,
          defaultSortField: 'created_at',
          defaultSortDirection: 'desc' as const,
        },
      },
    ],
    relations: [],
    uiHints: {
      primaryTables: [tableName],
      defaultNavigation: [tableName],
      suggestedScreens: [
        { name: `${label}一覧`, table: tableName, operation: 'list' as const },
        { name: `${label}作成`, table: tableName, operation: 'create' as const },
      ],
    },
  };
  const dataBindings = [
    dataBindingForTable(tableName, 'list'),
    dataBindingForTable(tableName, 'create'),
  ];
  const screen = bindScreen(input.currentScreen, tableName, dataBindings);
  return {
    screen,
    databaseSchema,
    dataBindings,
    rationale: {
      databaseChanges: [`${tableName} tableを提案`],
      uiBindings: screen ? ['既存UIの主要セクションにdataBindingIdを付与'] : [],
    },
  };
}

function buildLlmInput(input: DatabaseDesignProviderInput) {
  const payload = {
    source: input.source,
    currentDatabaseSchema: input.currentDatabaseSchema ?? null,
    currentSandboxState: input.currentSandboxState ?? null,
    currentScreen: input.currentScreen ?? null,
    selectedDraftPrompt: input.selectedDraftPrompt ?? null,
    selectedDraftSchema: input.selectedDraftSchema ?? null,
    latestUserInstruction: input.prompt,
  };
  const json = JSON.stringify(payload);
  const prompt = [
    'Generate a DBDesignJob JSON object only.',
    'Use only catalog constraints, current sandbox state, selected draft intent, current database schema JSON, current screen JSON, and latest user instruction.',
    'When currentSandboxState is present, treat it as the current database truth. Treat selectedDraftSchema and selectedDraftPrompt as intent, not as current state.',
    'Do not use prior conversation history.',
    'Return the complete desired DBDesignJob after applying the latest instruction, not a diff.',
    'DBDesignJob shape: { "name": string, "label": string, "purpose": string, "tables": Table[], "relationships": Relationship[], "primaryTables": string[], "notes": string[] }.',
    'Table shape: { "name": snake_case_identifier, "label": string, "description"?: string, "fields": Field[] }.',
    'Field shape: { "name": snake_case_identifier, "label": string, "type": "uuid"|"text"|"varchar"|"integer"|"bigint"|"numeric"|"boolean"|"date"|"timestamp"|"jsonb"|"enum", "required"?: boolean, "unique"?: boolean, "enumName"?: snake_case_identifier, "enumValues"?: string[] }.',
    'Relationship shapes: { "kind": "one_to_many", "parentTable": string, "childTable": string, "foreignKeyColumn"?: string, "required"?: boolean, "onDelete"?: "cascade"|"restrict"|"set-null" } or { "kind": "many_to_many", "leftTable": string, "rightTable": string, "joinTable": string, "onDelete"?: "cascade"|"restrict" }.',
    'Do not return databaseSchema, dataBindings, screen, SQL, indexes, id columns, created_at columns, updated_at columns, is_active columns, or join table fields. The application derives system columns, omits is_active on many-to-many join tables, and hides system columns from UI tables/forms.',
    'Return compact minified JSON directly. Do not include Markdown, comments, prose, or reasoning.',
    '',
    json,
  ].join('\n');
  const estimatedTokens = estimateTokens(prompt);
  if (estimatedTokens > dbDesignInputTokenLimit) {
    throw new ValidationError('DBDesign prompt exceeds the 24k token budget', {
      estimatedTokens,
      maxTokens: dbDesignInputTokenLimit,
    });
  }
  return {
    estimatedTokens,
    prompt,
    promptChars: prompt.length,
  };
}

type BuiltLlmInput = ReturnType<typeof buildLlmInput>;

type ProviderTrace = {
  provider: 'openai' | 'azure-openai' | 'mock';
  traceId: string;
};

function extractResponseText(payload: Record<string, unknown>, trace: ProviderTrace) {
  logger.info(trace, 'DBDesign provider extracting text output');
  const returnText = (text: string, extractionPath: string) => {
    logger.info(
      { ...trace, extractionPath, textChars: text.length },
      'DBDesign provider extracted text output'
    );
    if (!text.trim()) {
      const details = emptyTextDetails(payload, trace, extractionPath);
      logger.error({ ...trace, ...details }, 'DBDesign provider extracted empty text output');
      throw providerError('AI provider returned empty text output', details);
    }
    return text;
  };
  if (typeof payload.output_text === 'string')
    return returnText(payload.output_text, 'output_text');
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    if (typeof item !== 'object' || item === null) continue;
    const content = Array.isArray((item as { content?: unknown }).content)
      ? (item as { content: unknown[] }).content
      : [];
    for (const contentItem of content) {
      if (
        typeof contentItem === 'object' &&
        contentItem !== null &&
        typeof (contentItem as { text?: unknown }).text === 'string'
      ) {
        return returnText((contentItem as { text: string }).text, 'output.content.text');
      }
    }
  }

  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const first = choices[0];
  if (typeof first === 'object' && first !== null) {
    const message = (first as { message?: unknown }).message;
    if (typeof message === 'object' && message !== null) {
      const content = (message as { content?: unknown }).content;
      if (typeof content === 'string') {
        return returnText(content, 'choices.message.content');
      }
    }
  }

  logger.error(
    { ...trace, payload, payloadSummary: responsePayloadSummary(payload) },
    'DBDesign provider response did not include text output'
  );
  throw providerError('Database design provider did not include text output', {
    payloadSummary: responsePayloadSummary(payload),
    traceId: trace.traceId,
  });
}

async function parseProviderResponse(response: Response, trace: ProviderTrace, startedAt: number) {
  logger.info(
    {
      ...trace,
      durationMs: durationMs(startedAt),
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
    },
    'DBDesign provider HTTP response received'
  );
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  logger.info(
    {
      ...trace,
      durationMs: durationMs(startedAt),
      payloadSummary: responsePayloadSummary(payload),
    },
    'DBDesign provider HTTP response JSON parsed'
  );
  if (!response.ok) {
    logger.error(
      { ...trace, payload, status: response.status },
      'DBDesign provider request failed'
    );
    throw providerError('Database design provider request failed', {
      status: response.status,
      providerError: payload.error,
      traceId: trace.traceId,
    });
  }
  return payload;
}

function parseDesignJobResponseText(
  text: string,
  trace: ProviderTrace,
  input: DatabaseDesignProviderInput
) {
  logger.info(
    { ...trace, textChars: text.length, outputPreview: textPreview(text) },
    'DBDesign provider parsing job JSON'
  );
  if (!text.trim()) {
    logger.error(
      { ...trace, textChars: text.length },
      'DBDesign provider returned empty text before JSON parse'
    );
    throw providerError('AI provider returned empty text output', {
      textChars: text.length,
      traceId: trace.traceId,
    });
  }
  let job: unknown;
  try {
    job = JSON.parse(text);
  } catch (error) {
    logger.error(
      { ...trace, err: error, outputPreview: textPreview(text, 1200) },
      'DBDesign provider job JSON parse failed'
    );
    throw new ValidationError('AI returned invalid DBDesignJob JSON', {
      traceId: trace.traceId,
    });
  }
  logger.info(
    {
      ...trace,
      topLevelKeys:
        typeof job === 'object' && job !== null && !Array.isArray(job) ? Object.keys(job) : [],
    },
    'DBDesign provider job JSON parsed'
  );
  const parsed = databaseDesignJobSchema.safeParse(job);
  if (!parsed.success) {
    logger.error(
      { ...trace, issues: parsed.error.issues, outputPreview: textPreview(text, 1200) },
      'DBDesign provider job schema validation failed'
    );
    throw new ValidationError('AI returned an invalid DBDesignJob', {
      issues: parsed.error.issues,
      traceId: trace.traceId,
    });
  }
  const draft = draftFromDatabaseDesignJob(parsed.data, input);
  logger.info(
    {
      ...trace,
      bindingCount: draft.dataBindings.length,
      hasScreen: Boolean(draft.screen),
      relationCount: draft.databaseSchema.relations.length,
      tableCount: draft.databaseSchema.tables.length,
      tables: draft.databaseSchema.tables.map((table) => table.name),
    },
    'DBDesign provider job converted to draft'
  );
  return draft;
}

async function fetchWithProgress(url: string, init: RequestInit, trace: ProviderTrace) {
  const startedAt = Date.now();
  logger.info({ ...trace, url }, 'DBDesign provider HTTP request started');
  const progressTimer = setInterval(() => {
    logger.info(
      { ...trace, durationMs: durationMs(startedAt), url },
      'DBDesign provider HTTP request still waiting'
    );
  }, dbDesignProviderProgressLogIntervalMs);
  try {
    const response = await fetch(url, init);
    clearInterval(progressTimer);
    return { response, startedAt };
  } catch (error) {
    clearInterval(progressTimer);
    logger.error(
      { ...trace, durationMs: durationMs(startedAt), err: error, url },
      'DBDesign provider HTTP request threw'
    );
    throw error;
  }
}

async function generateWithOpenAi(
  input: BuiltLlmInput,
  trace: ProviderTrace,
  sourceInput: DatabaseDesignProviderInput
) {
  logger.info(
    {
      ...trace,
      estimatedTokens: input.estimatedTokens,
      maxOutputTokens: dbDesignMaxOutputTokens,
      model: config.OPENAI_MODEL,
      promptChars: input.promptChars,
      reasoningEffort: dbDesignReasoningEffort,
    },
    'DBDesign OpenAI generation started'
  );
  const openAiRequestBody = {
    model: config.OPENAI_MODEL,
    instructions: dbDesignSystemInstructions,
    input: input.prompt,
    max_output_tokens: dbDesignMaxOutputTokens,
    reasoning: { effort: dbDesignReasoningEffort },
    text: { format: { type: 'json_object' } },
  };
  logger.info(
    {
      ...trace,
      requestBody: openAiRequestBody,
    },
    'DBDesign OpenAI prompt payload'
  );
  const { response, startedAt } = await fetchWithProgress(
    'https://api.openai.com/v1/responses',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(openAiRequestBody),
    },
    trace
  );
  const payload = await parseProviderResponse(response, trace, startedAt);
  return parseDesignJobResponseText(extractResponseText(payload, trace), trace, sourceInput);
}

async function generateWithAzure(
  input: BuiltLlmInput,
  trace: ProviderTrace,
  sourceInput: DatabaseDesignProviderInput
) {
  const rawEndpoint = config.AZURE_OPENAI_ENDPOINT;
  const endpoint = rawEndpoint?.endsWith('/') ? rawEndpoint.slice(0, -1) : rawEndpoint;
  const deployment = encodeURIComponent(config.AZURE_OPENAI_DEPLOYMENT_NAME ?? '');
  const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${encodeURIComponent(
    config.AZURE_OPENAI_API_VERSION
  )}`;
  logger.info(
    {
      ...trace,
      deployment: config.AZURE_OPENAI_DEPLOYMENT_NAME,
      estimatedTokens: input.estimatedTokens,
      maxCompletionTokens: dbDesignMaxOutputTokens,
      promptChars: input.promptChars,
      reasoningEffort: dbDesignReasoningEffort,
    },
    'DBDesign Azure OpenAI generation started'
  );
  const azureRequestBody = {
    messages: [
      {
        role: 'system',
        content: dbDesignSystemInstructions,
      },
      { role: 'user', content: input.prompt },
    ],
    max_completion_tokens: dbDesignMaxOutputTokens,
    reasoning_effort: dbDesignReasoningEffort,
    response_format: { type: 'json_object' },
  };
  logger.info(
    {
      ...trace,
      requestBody: azureRequestBody,
    },
    'DBDesign Azure OpenAI prompt payload'
  );
  const { response, startedAt } = await fetchWithProgress(
    url,
    {
      method: 'POST',
      headers: {
        'api-key': config.AZURE_OPENAI_API_KEY ?? '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(azureRequestBody),
    },
    trace
  );
  const payload = await parseProviderResponse(response, trace, startedAt);
  return parseDesignJobResponseText(extractResponseText(payload, trace), trace, sourceInput);
}

export function createDefaultDatabaseDesignProvider(): DatabaseDesignProvider {
  return {
    propose: async (input) => {
      const startedAt = Date.now();
      const traceId = randomUUID();
      logger.info(
        {
          traceId,
          currentDatabaseSchema: schemaSummary(input.currentDatabaseSchema),
          currentSandboxState: sandboxStateSummary(input.currentSandboxState),
          currentScreen: screenSummary(input.currentScreen),
          selectedDraftSchema: schemaSummary(input.selectedDraftSchema),
          promptChars: input.prompt.length,
          source: input.source,
        },
        'DBDesign provider propose started'
      );
      const llmInput = buildLlmInput(input);
      logger.info(
        {
          traceId,
          estimatedTokens: llmInput.estimatedTokens,
          maxTokens: dbDesignInputTokenLimit,
          promptChars: llmInput.promptChars,
        },
        'DBDesign provider prompt built'
      );
      const activities: AiActivity[] = [
        {
          id: 'dbdesign-provider',
          label: 'DBDesign provider',
          status: 'completed',
          detail: input.source,
        },
      ];

      if (
        config.AZURE_OPENAI_API_KEY &&
        config.AZURE_OPENAI_ENDPOINT &&
        config.AZURE_OPENAI_DEPLOYMENT_NAME
      ) {
        const trace: ProviderTrace = { provider: 'azure-openai', traceId };
        logger.info(
          {
            ...trace,
            deployment: config.AZURE_OPENAI_DEPLOYMENT_NAME,
            providerPriority: 'azure-openai',
          },
          'DBDesign provider selected'
        );
        const draft = await generateWithAzure(llmInput, trace, input);
        logger.info(
          { ...trace, durationMs: durationMs(startedAt) },
          'DBDesign provider propose completed'
        );
        return {
          activities,
          draft,
          providerMeta: {
            provider: 'azure-openai',
            model: config.AZURE_OPENAI_DEPLOYMENT_NAME,
            componentRegistryVersion,
          },
        };
      }

      if (config.OPENAI_API_KEY) {
        const trace: ProviderTrace = { provider: 'openai', traceId };
        logger.info(
          { ...trace, model: config.OPENAI_MODEL, providerPriority: 'openai' },
          'DBDesign provider selected'
        );
        const draft = await generateWithOpenAi(llmInput, trace, input);
        logger.info(
          { ...trace, durationMs: durationMs(startedAt) },
          'DBDesign provider propose completed'
        );
        return {
          activities,
          draft,
          providerMeta: {
            provider: 'openai',
            model: config.OPENAI_MODEL,
            componentRegistryVersion,
          },
        };
      }

      logger.info({ provider: 'mock', traceId }, 'DBDesign provider selected');
      const draft = deterministicDraft(input);
      logger.info(
        {
          durationMs: durationMs(startedAt),
          provider: 'mock',
          traceId,
          tableCount: draft.databaseSchema.tables.length,
        },
        'DBDesign provider propose completed'
      );
      return {
        activities,
        draft,
        providerMeta: { provider: 'mock', componentRegistryVersion },
      };
    },
  };
}
