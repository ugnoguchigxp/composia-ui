import type { AiActivity } from '../../../shared/schemas/ai.schema';
import type { DataBindingDraft } from '../../../shared/schemas/data-binding.schema';
import type {
  DatabaseColumn,
  DatabaseDesignDraftResponse,
  DatabaseSchemaJson,
} from '../../../shared/schemas/database-design.schema';
import { databaseDesignDraftResponseSchema } from '../../../shared/schemas/database-design.schema';
import type { AppUiSchema, AppUiSchemaSection } from '../../../shared/schemas/ui-schema.schema';
import { config } from '../../config';
import { AppError, ValidationError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { layoutSystemContextVersion, parseJsonText } from '../ai/ai.provider';

const dbDesignInputTokenLimit = 24_000;
const componentRegistryVersion = `component-registry-v2:${layoutSystemContextVersion}`;

export type DatabaseDesignProviderInput = {
  currentDatabaseSchema?: DatabaseSchemaJson | null;
  currentScreen?: AppUiSchema | null;
  prompt: string;
  source: 'screen' | 'dbdesign';
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

function estimateTokens(text: string) {
  return Math.ceil(text.length / 3);
}

function providerError(message: string, details?: Record<string, unknown>) {
  return new AppError(502, 'AI_PROVIDER_ERROR', message, details);
}

function slugifyIdentifier(value: string, fallback: string) {
  const ascii = value
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_');
  const normalized = ascii.replace(/^[^a-z]+/, '');
  return normalized && /^[a-z][a-z0-9_]*$/.test(normalized) ? normalized : fallback;
}

function titleCase(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function tableNameFromText(text: string) {
  const lower = text.toLowerCase();
  if (/注文|order/.test(lower)) return 'orders';
  if (/顧客|customer|client/.test(lower)) return 'customers';
  if (/商品|製品|スキー|product|item/.test(lower)) return 'products';
  if (/予約|booking|reservation/.test(lower)) return 'bookings';
  if (/請求|invoice|billing/.test(lower)) return 'invoices';
  if (/タスク|task|ticket|issue/.test(lower)) return 'tasks';
  if (/記事|投稿|post|article/.test(lower)) return 'posts';
  if (/社員|メンバー|member|employee/.test(lower)) return 'members';
  return slugifyIdentifier(lower, 'records');
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

function systemColumns(): DatabaseColumn[] {
  return [
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
      ui: { listVisible: true, formVisible: false, filterable: false, sortable: true },
    },
  ];
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
  const name = slugifyIdentifier(String(field.name ?? label), `field_${index + 1}`);
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
        const name = slugifyIdentifier(String(raw.key ?? raw.label ?? ''), `field_${index + 1}`);
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

function maybeAddCommonDomainTables(schema: DatabaseSchemaJson, prompt: string) {
  const lower = prompt.toLowerCase();
  if (!/タグ|tag|many.?to.?many|多対多/.test(lower)) return schema;
  const base = schema.tables[0];
  if (!base || schema.tables.some((table) => table.name === 'tags')) return schema;

  const tags = {
    name: 'tags',
    label: 'タグ',
    description: '分類タグ',
    columns: [...systemColumns(), textColumn('name', 'タグ名', { unique: true })],
    indexes: [{ name: 'tags_name_uidx', columns: ['name'], unique: true }],
    ui: { displayField: 'name', defaultSortField: 'name', defaultSortDirection: 'asc' as const },
  };
  const joinTable = {
    name: `${base.name}_tags`,
    label: `${base.label}タグ`,
    columns: [
      ...systemColumns(),
      {
        ...textColumn(`${base.name.slice(0, -1)}_id`, `${base.label}ID`, { type: 'uuid' }),
        ui: { listVisible: false, formVisible: true, filterable: true, sortable: false },
      },
      {
        ...textColumn('tag_id', 'タグID', { type: 'uuid' }),
        ui: { listVisible: false, formVisible: true, filterable: true, sortable: false },
      },
    ],
    indexes: [
      {
        name: `${base.name}_tags_pair_uidx`,
        columns: [`${base.name.slice(0, -1)}_id`, 'tag_id'],
        unique: true,
      },
    ],
    ui: { defaultSortDirection: 'asc' as const },
  };

  return {
    ...schema,
    tables: [...schema.tables, tags, joinTable],
    relations: [
      ...schema.relations,
      {
        kind: 'many-to-many' as const,
        name: `${base.name}_to_tags`,
        leftTable: base.name,
        rightTable: 'tags',
        joinTable: joinTable.name,
        leftForeignKeyColumn: `${base.name.slice(0, -1)}_id`,
        rightForeignKeyColumn: 'tag_id',
        leftDisplayField: base.ui.displayField,
        rightDisplayField: 'name',
        onDelete: 'cascade' as const,
      },
    ],
  };
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

function deterministicDraft(input: DatabaseDesignProviderInput): DatabaseDesignDraftResponse {
  const sourceText = input.currentScreen?.page ?? input.prompt;
  const tableName = tableNameFromText(`${sourceText}\n${input.prompt}`);
  const label = tableName === 'products' ? '商品' : titleCase(tableName);
  const columns = columnsFromScreen(input.currentScreen, tableName);
  const displayField = columns.find((column) => column.name === 'name')?.name ?? columns[2]?.name;
  const databaseSchema = maybeAddCommonDomainTables(
    {
      name: slugifyIdentifier(input.currentScreen?.page ?? input.prompt, 'app_schema'),
      label: input.currentScreen?.page ?? 'DBDesign',
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
            defaultSortDirection: 'desc',
          },
        },
      ],
      relations: [],
      uiHints: {
        primaryTables: [tableName],
        defaultNavigation: [tableName],
        suggestedScreens: [
          { name: `${label}一覧`, table: tableName, operation: 'list' },
          { name: `${label}作成`, table: tableName, operation: 'create' },
        ],
      },
    },
    input.prompt
  );
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
    currentScreen: input.currentScreen ?? null,
    latestUserInstruction: input.prompt,
  };
  const json = JSON.stringify(payload);
  const prompt = [
    'Generate a database design draft as strict JSON only.',
    'Use only catalog constraints, current database schema JSON, current screen JSON, and latest user instruction.',
    'Do not use prior conversation history.',
    'Return { "databaseSchema", "dataBindings", "screen"?, "rationale" }.',
    'databaseSchema must model 1-to-many and many-to-many relations when the user intent requires them.',
    'Use snake_case SQL identifiers. Do not prefix table names.',
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
  return prompt;
}

function extractResponseText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === 'string') return payload.output_text;
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
        return (contentItem as { text: string }).text;
      }
    }
  }

  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const first = choices[0];
  if (typeof first === 'object' && first !== null) {
    const message = (first as { message?: unknown }).message;
    if (typeof message === 'object' && message !== null) {
      const content = (message as { content?: unknown }).content;
      if (typeof content === 'string') return content;
    }
  }

  throw providerError('Database design provider did not include text output');
}

async function parseProviderResponse(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw providerError('Database design provider request failed', {
      status: response.status,
      providerError: payload.error,
    });
  }
  return payload;
}

async function generateWithOpenAi(prompt: string) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.OPENAI_MODEL,
      instructions:
        'You design PostgreSQL schemas and UI data bindings. Return JSON only. Never create SQL.',
      input: prompt,
      max_output_tokens: 8000,
      text: { format: { type: 'json_object' } },
    }),
  });
  const payload = await parseProviderResponse(response);
  logger.info({ payload }, 'OpenAI database design response received');
  return databaseDesignDraftResponseSchema.parse(parseJsonText(extractResponseText(payload)));
}

async function generateWithAzure(prompt: string) {
  const rawEndpoint = config.AZURE_OPENAI_ENDPOINT;
  const endpoint = rawEndpoint?.endsWith('/') ? rawEndpoint.slice(0, -1) : rawEndpoint;
  const deployment = encodeURIComponent(config.AZURE_OPENAI_DEPLOYMENT_NAME ?? '');
  const response = await fetch(
    `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${encodeURIComponent(
      config.AZURE_OPENAI_API_VERSION
    )}`,
    {
      method: 'POST',
      headers: {
        'api-key': config.AZURE_OPENAI_API_KEY ?? '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content:
              'You design PostgreSQL schemas and UI data bindings. Return JSON only. Never create SQL.',
          },
          { role: 'user', content: prompt },
        ],
        max_completion_tokens: 8000,
        response_format: { type: 'json_object' },
      }),
    }
  );
  const payload = await parseProviderResponse(response);
  logger.info({ payload }, 'Azure OpenAI database design response received');
  return databaseDesignDraftResponseSchema.parse(parseJsonText(extractResponseText(payload)));
}

export function createDefaultDatabaseDesignProvider(): DatabaseDesignProvider {
  return {
    propose: async (input) => {
      const llmInput = buildLlmInput(input);
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
        return {
          activities,
          draft: await generateWithAzure(llmInput),
          providerMeta: {
            provider: 'azure-openai',
            model: config.AZURE_OPENAI_DEPLOYMENT_NAME,
            componentRegistryVersion,
          },
        };
      }

      if (config.OPENAI_API_KEY) {
        return {
          activities,
          draft: await generateWithOpenAi(llmInput),
          providerMeta: {
            provider: 'openai',
            model: config.OPENAI_MODEL,
            componentRegistryVersion,
          },
        };
      }

      return {
        activities,
        draft: deterministicDraft(input),
        providerMeta: { provider: 'mock', componentRegistryVersion },
      };
    },
  };
}
