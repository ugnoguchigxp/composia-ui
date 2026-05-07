import { randomUUID } from 'node:crypto';
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
const dbDesignMaxOutputTokens = 24_000;
const dbDesignReasoningEffort = 'minimal';
const dbDesignProviderProgressLogIntervalMs = 5000;
const componentRegistryVersion = `component-registry-v2:${layoutSystemContextVersion}`;
const dbDesignSystemInstructions =
  'You design PostgreSQL schemas and UI data bindings. Return JSON only. Never create SQL.';

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
    'databaseSchema must be an object, never an array. Put table definitions in databaseSchema.tables.',
    'Return compact minified JSON directly. Do not include explanations, Markdown, or step-by-step reasoning.',
    'Prefer the smallest relational schema that satisfies the request. Do not add audit/log/RBAC tables unless the user explicitly asks for them.',
    'rationale must be an object: { "databaseChanges": string[], "uiBindings": string[] }. Do not return rationale as a string.',
    'databaseSchema must model 1-to-many and many-to-many relations when the user intent requires them.',
    'Use snake_case SQL identifiers. Do not prefix table names. Do not use reserved SQL words such as order, user, table, select, from, where, group, or limit as table or column names.',
    'Every table must have exactly one primary key column. Prefer { "name": "id", "type": "uuid", "primaryKey": true, "default": { "kind": "uuid" } }.',
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
  logger.info(
    { ...trace, payloadSummary: responsePayloadSummary(payload) },
    'DBDesign provider extracting text output'
  );
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

function parseDraftResponseText(text: string, trace: ProviderTrace) {
  logger.info(
    { ...trace, textChars: text.length, outputPreview: textPreview(text) },
    'DBDesign provider parsing draft JSON'
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
  const draft = parseJsonText(text);
  logger.info(
    {
      ...trace,
      topLevelKeys:
        typeof draft === 'object' && draft !== null && !Array.isArray(draft)
          ? Object.keys(draft)
          : [],
    },
    'DBDesign provider draft JSON parsed'
  );
  const parsed = databaseDesignDraftResponseSchema.safeParse(draft);
  if (!parsed.success) {
    logger.error(
      { ...trace, issues: parsed.error.issues, outputPreview: textPreview(text, 1200) },
      'DBDesign provider draft schema validation failed'
    );
    throw new ValidationError('AI returned an invalid database design draft', {
      issues: parsed.error.issues,
      traceId: trace.traceId,
    });
  }
  logger.info(
    {
      ...trace,
      bindingCount: parsed.data.dataBindings.length,
      hasScreen: Boolean(parsed.data.screen),
      relationCount: parsed.data.databaseSchema.relations.length,
      tableCount: parsed.data.databaseSchema.tables.length,
      tables: parsed.data.databaseSchema.tables.map((table) => table.name),
    },
    'DBDesign provider draft schema validation succeeded'
  );
  return parsed.data;
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

async function generateWithOpenAi(input: BuiltLlmInput, trace: ProviderTrace) {
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
  return parseDraftResponseText(extractResponseText(payload, trace), trace);
}

async function generateWithAzure(input: BuiltLlmInput, trace: ProviderTrace) {
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
  return parseDraftResponseText(extractResponseText(payload, trace), trace);
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
          currentScreen: screenSummary(input.currentScreen),
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
        const draft = await generateWithAzure(llmInput, trace);
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
        const draft = await generateWithOpenAi(llmInput, trace);
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
