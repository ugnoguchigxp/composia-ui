# Sandbox Database And UI Co-Generation Implementation Plan

## 目的

Composia の既存コンセプトである「LLM が構造化 JSON を生成し、ChatDock で再編集し、checkpoint として戻れる」体験を、UI だけでなく database schema まで拡張する。

ユーザーは自然言語で UI を作る。その過程で必要な table / relation / validation / data binding も LLM が提案する。ユーザーは生成 UI と DB 変更案を同じ作業空間で確認し、必要なら ChatDock から再編集し、納得した時点で sandbox DB へ migrate する。

ただし、LLM が継続メンテナンスしなければならないコードを増やさない。LLM が作るのは JSON だけに寄せる。

## 決定事項

- 現行の `DATABASE_URL` は管理DBとして扱う。
- sandbox 用の新DBは管理DBとは分離する。同じ Postgres instance 上でよい。
- まずはマルチプロジェクトを扱わない。1 install / 1 sandbox DB として設計する。
- sandbox DB は `.env` の `SANDBOX_DATABASE_URL` で既に作成済みという前提にする。
- DB定義の SSoT は `DatabaseSchemaJson`。
- UI定義の SSoT は既存の `ScreenJSON`。
- UI と DB の接続定義は `DataBindingJson`。
- LLM が生成・編集する永続成果物は `DatabaseSchemaJson`, `ScreenJSON`, `DataBindingJson` に限定する。
- Drizzle schema TS / Zod schema TS / CRUD route / React component を table ごとに生成保存しない。
- validation は `DatabaseSchemaJson` から runtime Zod schema を組み立てて実行する。
- sandbox DB 操作は固定コードの generic SQL / query service が担当する。
- table 名は `app_` prefix を強制しない。ユーザーが意図する素の名前を使う。
- prefix なしでも reset 対象を誤らないよう、sandbox に作成した managed object は管理DBに registry として保存する。
- UI生成時に DB 変更案を同時に出してよいが、勝手に migrate はしない。
- UI作成直後に table を作らない。ユーザーが「テーブル定義」操作を選んだときに、現在の ScreenJSON を読んで DBDesign に素案を作る。
- DBDesign には入口を2つ用意する。現在の UI から素案を作る経路と、DBDesign内のプロンプトから素案を作る経路。
- どちらの経路でも、LLMが作るのは draft `DatabaseSchemaJson` と draft `DataBindingJson` まで。ユーザー承認後にだけ sandbox DB の実table生成へ進む。
- 視覚的に DB の状態を確認する画面を MVP に含める。
- UI + DB co-generation の workspace route は `/dbdesign` とする。
- 実装は Phase 1-7 を中途半端に切らず、DB設計から data-bound UI まで通す。

## 非ゴール

- 複数 user / project ごとの sandbox DB 分離。
- 本番運用向け migration governance。
- sandbox DB に対する任意 SQL 実行UI。
- 生成した Drizzle schema TS をユーザーが直接 import する機能。
- table ごとの専用CRUD React component生成。
- 外部DB接続先の管理。

## 全体像

```text
Management DB
  users / auth
  prompt_sessions
  screen_jsons
  database_schema_jsons
  database_design_messages
  sandbox_migration_runs

Sandbox DB
  LLM proposed and user-approved application tables
  casual reset / migrate / inspect target

DatabaseSchemaJson
  -> ER graph
  -> runtime Zod validators
  -> migration diff / SQL preview
  -> sandbox DB migrate
  -> generic CRUD / relation API
  -> UI generation context

ScreenJSON
  -> json-render preview
  -> DataBindingJson references
  -> generic CRUD / relation API calls
```

重要な分離:

- `DatabaseSchemaJson`: データ構造、relation、validation、UI hints を持つ。
- `ScreenJSON`: 画面構造、component、layout、actions を持つ。
- `DataBindingJson`: Screen section/action が sandbox DB のどの table / operation / relation に接続するかを持つ。

## 環境変数

`.env.example`

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:55437/hono_standard
SANDBOX_DATABASE_URL=postgresql://postgres:postgres@localhost:55437/composia_sandbox
SANDBOX_DATABASE_RESET_ALLOWED=false
```

MVPでは `SANDBOX_DATABASE_URL` の database は事前作成されている前提にする。アプリから `DROP DATABASE` / `CREATE DATABASE` してもよい権限設計にはできるが、既定の reset は sandbox DB 内の managed objects を drop/recreate する操作にする。

`DROP DATABASE` ではなく managed objects 削除を既定にする理由:

- active connection があると `DROP DATABASE` は失敗するため、接続停止や別DBへのadmin接続が必要になる。
- DB owner / extension / grants / connection URL を作り直す必要がなく、reset後も同じ `SANDBOX_DATABASE_URL` をそのまま使える。
- 誤って管理DBをdropする事故面を減らせる。reset処理は常に `SANDBOX_DATABASE_URL` の接続内だけで完結する。
- sandbox DB を視覚的に inspect しながら schemaだけを戻す用途に合う。

ただし、完全に壊れたsandboxを復旧するための hard reset として `DROP DATABASE` / `CREATE DATABASE` path を後から追加できるよう、service境界は分けておく。

## データモデル

### 管理DBに追加するテーブル

`database_design_sessions`

```ts
export const databaseDesignSessions = pgTable(
  'database_design_sessions',
  {
    ...commonColumns,
    title: text('title').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    activeDatabaseSchemaJsonId: uuid('active_database_schema_json_id'),
    activeScreenJsonId: uuid('active_screen_json_id'),
  },
  (table) => ({
    createdByIdx: index('database_design_sessions_created_by_idx').on(table.createdBy),
  })
);
```

`activeDatabaseSchemaJsonId` と `activeScreenJsonId` は nullable pointer として扱う。Drizzle schema declaration の循環参照を避けるため、MVPでは DB-level FK を張らず、service 層で所有者・存在確認を行う。必要になれば後続 migration で raw SQL FK を追加する。

`database_schema_jsons`

```ts
export const databaseSchemaJsons = pgTable(
  'database_schema_jsons',
  {
    ...commonColumns,
    designSessionId: uuid('design_session_id')
      .notNull()
      .references(() => databaseDesignSessions.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    prompt: text('prompt').notNull(),
    trigger: text('trigger').notNull(), // initial-prompt | screen-proposal | dbdesign-proposal | db-edit | ui-edit | reset
    schema: jsonb('schema').$type<DatabaseSchemaJson>().notNull(),
    diffSummary: jsonb('diff_summary')
      .$type<DatabaseSchemaDiffSummary>()
      .notNull()
      .default({
        addedTables: [],
        changedTables: [],
        removedTables: [],
        destructive: false,
      }),
    providerMeta: jsonb('provider_meta').$type<ScreenProviderMeta>().notNull(),
  },
  (table) => ({
    designSessionVersionUniqueIdx: uniqueIndex('database_schema_jsons_session_version_uidx').on(
      table.designSessionId,
      table.version
    ),
    designSessionIdx: index('database_schema_jsons_design_session_idx').on(table.designSessionId),
  })
);
```

`DatabaseSchemaDiffSummary` は migration preview と履歴表示用の軽量メタデータに限定する。実際の migration 判断は、保存済み JSON 同士の diff から都度計算する。

```ts
export const databaseSchemaDiffSummarySchema = z
  .object({
    addedTables: z.array(z.string()).default([]),
    changedTables: z.array(z.string()).default([]),
    removedTables: z.array(z.string()).default([]),
    destructive: z.boolean().default(false),
  })
  .strict();

export type DatabaseSchemaDiffSummary = z.infer<typeof databaseSchemaDiffSummarySchema>;
```

`database_design_messages`

```ts
export const databaseDesignMessages = pgTable(
  'database_design_messages',
  {
    ...commonColumns,
    designSessionId: uuid('design_session_id')
      .notNull()
      .references(() => databaseDesignSessions.id, { onDelete: 'cascade' }),
    databaseSchemaJsonId: uuid('database_schema_json_id').references(() => databaseSchemaJsons.id, {
      onDelete: 'cascade',
    }),
    screenJsonId: uuid('screen_json_id').references(() => screenJsons.id, { onDelete: 'cascade' }),
    role: text('role').notNull(), // user | assistant
    content: text('content').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => ({
    designSessionIdx: index('database_design_messages_session_idx').on(table.designSessionId),
    databaseSchemaJsonIdx: index('database_design_messages_schema_idx').on(table.databaseSchemaJsonId),
    screenJsonIdx: index('database_design_messages_screen_idx').on(table.screenJsonId),
    createdAtIdx: index('database_design_messages_created_at_idx').on(table.createdAt),
  })
);
```

assistant message の checkpoint metadata:

```ts
type DatabaseDesignMessageMetadata = {
  checkpointLabel?: 'このバージョンへ戻る';
  checkpointScreenJsonId?: string;
  checkpointDatabaseSchemaJsonId?: string;
  screenVersion?: number;
  databaseSchemaVersion?: number;
  trigger?: 'initial-prompt' | 'screen-proposal' | 'dbdesign-proposal' | 'db-edit' | 'ui-edit' | 'reset';
};
```

checkpoint restore は message に保存された `checkpointScreenJsonId` と `checkpointDatabaseSchemaJsonId` を両方使う。UIだけ、DBだけの checkpoint も許可するが、UI+DB co-generation の assistant message は原則として両方を持つ。

`sandbox_migration_runs`

```ts
export const sandboxMigrationRuns = pgTable(
  'sandbox_migration_runs',
  {
    ...commonColumns,
    databaseSchemaJsonId: uuid('database_schema_json_id')
      .notNull()
      .references(() => databaseSchemaJsons.id, { onDelete: 'cascade' }),
    status: text('status').notNull(), // pending | applied | failed | reverted
    fromVersion: integer('from_version'),
    toVersion: integer('to_version').notNull(),
    sql: text('sql').notNull(),
    checksum: text('checksum').notNull(),
    appliedAt: timestamp('applied_at'),
    errorMessage: text('error_message'),
  },
  (table) => ({
    schemaIdx: index('sandbox_migration_runs_schema_idx').on(table.databaseSchemaJsonId),
    statusIdx: index('sandbox_migration_runs_status_idx').on(table.status),
  })
);
```

`sandbox_managed_objects`

prefix なしの table 名を許容するため、reset / introspection / destructive diff の対象を table名 prefix ではなく registry で特定する。

```ts
export const sandboxManagedObjects = pgTable(
  'sandbox_managed_objects',
  {
    ...commonColumns,
    databaseSchemaJsonId: uuid('database_schema_json_id').references(() => databaseSchemaJsons.id, {
      onDelete: 'set null',
    }),
    migrationRunId: uuid('migration_run_id').references(() => sandboxMigrationRuns.id, {
      onDelete: 'set null',
    }),
    objectType: text('object_type').notNull(), // table | enum | index | foreign-key | unique-constraint
    objectKey: text('object_key').notNull(),
    objectName: text('object_name').notNull(),
    parentObjectName: text('parent_object_name'),
    status: text('status').notNull(), // active | dropped
  },
  (table) => ({
    objectKeyUniqueIdx: uniqueIndex('sandbox_managed_objects_key_uidx').on(table.objectKey),
    statusIdx: index('sandbox_managed_objects_status_idx').on(table.status),
  })
);
```

管理対象の定義:

- `DatabaseSchemaJson.tables[].name`
- `DatabaseSchemaJson` から生成した enum。
- `DatabaseSchemaJson` から生成した index / unique constraint / foreign key。
- migration apply 時に `sandbox_managed_objects` へ upsert されたもの。

reset は `sandbox_managed_objects.status = 'active'` の object だけを drop する。sandbox DB 内にユーザーが手動作成した object があっても、registry にないものは触らない。

### `screen_jsons` への追加

UI と DB schema の対応を後から辿れるようにする。

```ts
databaseSchemaJsonId: uuid('database_schema_json_id').references(() => databaseSchemaJsons.id, {
  onDelete: 'set null',
}),
dataBindings: jsonb('data_bindings').$type<DataBindingJson[]>().notNull().default([]),
```

補足:

- `ScreenJSON` 本体に DB table 定義を複製しない。
- `dataBindings` は UI が DB のどこを読む/書くかだけを持つ。
- `ScreenJSON` と `DatabaseSchemaJson` は別々に version を持つ。
- DB-only edit で binding 変更が必要になった場合は、画面構造が同じでも新しい `screen_jsons` version を作り、更新後の `dataBindings` を保存する。

## `DatabaseSchemaJson`

`shared/schemas/database-design.schema.ts` を新設する。

```ts
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
```

```ts
export const databaseColumnSchema = z
  .object({
    name: z.string().regex(/^[a-z][a-z0-9_]*$/),
    label: z.string().min(1),
    type: databaseScalarTypeSchema,
    enumName: z.string().regex(/^[a-z][a-z0-9_]*$/).optional(),
    enumValues: z.array(z.string().min(1)).optional(),
    nullable: z.boolean().default(false),
    primaryKey: z.boolean().default(false),
    unique: z.boolean().default(false),
    default: z
      .object({
        kind: z.enum(['uuid', 'now', 'literal', 'none']),
        value: z.unknown().optional(),
      })
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
      .default({
        listVisible: true,
        formVisible: true,
        filterable: false,
        sortable: false,
      }),
  })
  .strict();
```

```ts
export const databaseIndexSchema = z
  .object({
    name: z.string().regex(/^[a-z][a-z0-9_]*$/),
    columns: z.array(z.string().regex(/^[a-z][a-z0-9_]*$/)).min(1),
    unique: z.boolean().default(false),
  })
  .strict();
```

```ts
export const databaseTableSchema = z
  .object({
    name: z.string().regex(/^[a-z][a-z0-9_]*$/),
    label: z.string().min(1),
    description: z.string().min(1).optional(),
    columns: z.array(databaseColumnSchema).min(1).max(80),
    indexes: z.array(databaseIndexSchema).default([]),
    ui: z
      .object({
        displayField: z.string().optional(),
        defaultSortField: z.string().optional(),
        defaultSortDirection: z.enum(['asc', 'desc']).default('asc'),
      })
      .default({ defaultSortDirection: 'asc' }),
  })
  .strict();
```

```ts
export const databaseRelationSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('one-to-many'),
      name: z.string().regex(/^[a-z][a-z0-9_]*$/),
      parentTable: z.string(),
      childTable: z.string(),
      foreignKeyColumn: z.string(),
      parentDisplayField: z.string().optional(),
      onDelete: z.enum(['cascade', 'restrict', 'set-null']).default('restrict'),
    })
    .strict(),
  z
    .object({
      kind: z.literal('many-to-many'),
      name: z.string().regex(/^[a-z][a-z0-9_]*$/),
      leftTable: z.string(),
      rightTable: z.string(),
      joinTable: z.string(),
      leftForeignKeyColumn: z.string(),
      rightForeignKeyColumn: z.string(),
      leftDisplayField: z.string().optional(),
      rightDisplayField: z.string().optional(),
      onDelete: z.enum(['cascade', 'restrict']).default('cascade'),
    })
    .strict(),
]);
```

```ts
export const databaseSchemaJsonSchema = z
  .object({
    name: z.string().regex(/^[a-z][a-z0-9_]*$/),
    label: z.string().min(1),
    purpose: z.string().min(1),
    tables: z.array(databaseTableSchema).min(1).max(40),
    relations: z.array(databaseRelationSchema).default([]),
    uiHints: z
      .object({
        primaryTables: z.array(z.string()).default([]),
        defaultNavigation: z.array(z.string()).default([]),
        suggestedScreens: z
          .array(
            z
              .object({
                name: z.string(),
                table: z.string(),
                operation: z.enum(['list', 'detail', 'create', 'edit']),
              })
              .strict()
          )
          .default([]),
      })
      .default({
        primaryTables: [],
        defaultNavigation: [],
        suggestedScreens: [],
      }),
  })
  .strict();
```

`DatabaseSchemaJson` の中には version を持たせない。version は `database_schema_jsons.version` の row metadata として管理する。JSON 内と row metadata の二重管理を避けるため、LLM に version を生成させない。

### semantic validation

Zod だけでは table 間参照の整合性を完全に見られないため、追加で `validateDatabaseSchemaSemantics(schema)` を実装する。

検証するもの:

- table名の重複禁止。
- column名の重複禁止。
- primary key は各table 1つ以上、MVPでは単一 primary key を推奨。
- relation が存在する table / column だけを参照する。
- `many-to-many` の `joinTable` が schema 内に存在し、左右FK列を持つ。
- join table は左右FKの composite unique index を持つ。
- enum column は `enumValues` を持つ。
- `onDelete: set-null` の child FK column は nullable。
- reserved words / dangerous identifier を拒否。
- table名は prefix を強制しない。ただし reserved words / dangerous identifier を拒否し、active schema allowlist に存在する table だけを操作する。

## `DataBindingJson`

`shared/schemas/data-binding.schema.ts` を新設する。

```ts
export const dataBindingOperationSchema = z.enum([
  'list',
  'get',
  'create',
  'update',
  'delete',
  'attach',
  'detach',
]);
```

```ts
export const dataBindingDraftSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_]*$/),
    table: z.string().regex(/^[a-z][a-z0-9_]*$/),
    operation: dataBindingOperationSchema,
    fields: z.array(z.string().regex(/^[a-z][a-z0-9_]*$/)).default([]),
    relations: z.array(z.string().regex(/^[a-z][a-z0-9_]*$/)).default([]),
    filters: z
      .array(
        z
          .object({
            field: z.string().regex(/^[a-z][a-z0-9_]*$/),
            operator: z.enum(['eq', 'contains', 'gte', 'lte']),
            valueFrom: z.enum(['static', 'route', 'form', 'session']).default('static'),
            value: z.unknown().optional(),
          })
          .strict()
      )
      .default([]),
    sort: z
      .array(
        z
          .object({
            field: z.string().regex(/^[a-z][a-z0-9_]*$/),
            direction: z.enum(['asc', 'desc']),
          })
          .strict()
      )
      .default([]),
    limit: z.number().int().min(1).max(200).default(50),
  })
  .strict();
```

```ts
export const dataBindingSchema = dataBindingDraftSchema
  .extend({
    databaseSchemaJsonId: z.string().uuid(),
    databaseSchemaVersion: z.number().int().min(1),
  })
  .strict();
```

LLM の出力には `dataBindingDraftSchema` を使う。`databaseSchemaJsonId` と `databaseSchemaVersion` は、`DatabaseSchemaJson` を管理DBへ保存した後に service が埋める。まだ存在しない UUID を LLM に生成させない。

App UI Schema section には optional で binding 参照を追加する。

```ts
dataBindingId: z.string().optional()
```

理由:

- section の props に DB情報を埋め込まない。
- renderer は `dataBindingId` を見て runtime data を取得できる。
- LLM は table-specific code ではなく binding JSON だけを編集する。

## LLM 出力契約

### DBDesign draft proposal response

LLM に自由形式で返させない。必ず以下の strict JSON にする。

```ts
export const databaseDesignDraftResponseSchema = z
  .object({
    screen: appUiSchemaSchema.optional(),
    databaseSchema: databaseSchemaJsonSchema,
    dataBindings: z.array(dataBindingDraftSchema).default([]),
    rationale: z
      .object({
        databaseChanges: z.array(z.string()).default([]),
        uiBindings: z.array(z.string()).default([]),
      })
      .default({ databaseChanges: [], uiBindings: [] }),
  })
  .strict();
```

`source: "screen"` の場合でも、既存 ScreenJSON をそのまま使えるなら `screen` は返さなくてよい。`dataBindingId` 追加など ScreenJSON 側の更新が必要な場合だけ `screen` を返す。

### edit response

UIだけを直す場合、DBだけを直す場合、両方を直す場合を同じ schema で扱う。

```ts
export const uiDatabaseEditResponseSchema = z
  .object({
    screen: appUiSchemaSchema.optional(),
    databaseSchema: databaseSchemaJsonSchema.optional(),
    dataBindings: z.array(dataBindingDraftSchema).optional(),
    changeSummary: z.array(z.string()).default([]),
  })
  .strict()
  .refine((value) => value.screen || value.databaseSchema || value.dataBindings, {
    message: 'At least one of screen, databaseSchema, or dataBindings is required',
  });
```

LLM prompt に入れるもの:

- catalog constraints
- current minified ScreenJSON
- current minified DatabaseSchemaJson
- current minified DataBindingJson[]
- latest user instruction

入れないもの:

- 会話全文
- sandbox DB の全row
- Drizzle generated code
- migration履歴全文

入力予算:

- 24k tokens まで許容。
- 超過時は minified schema summary に切り替える。
- summary でも超える場合は明示エラー。

## Runtime Zod validation

`api/modules/database-design/runtime-zod.service.ts`

```ts
type DatabaseTable = z.infer<typeof databaseTableSchema>;

export function buildInsertSchema(table: DatabaseTable): z.ZodObject<z.ZodRawShape>;
export function buildUpdateSchema(table: DatabaseTable): z.ZodObject<z.ZodRawShape>;
export function buildSelectFilterSchema(table: DatabaseTable): z.ZodObject<z.ZodRawShape>;
```

方針:

- generated Zod TS は保存しない。
- request ごとに `DatabaseSchemaJson` から zod object を組み立てる。
- performance が必要なら schema version 単位で memory cache する。
- relation operation の validation も `DatabaseSchemaJson.relations` から組み立てる。

型対応:

| DatabaseSchemaJson type | runtime Zod |
| --- | --- |
| `uuid` | `z.string().uuid()` |
| `text` / `varchar` | `z.string()` + length |
| `integer` / `bigint` | `z.number().int()` |
| `numeric` | `z.number()` |
| `boolean` | `z.boolean()` |
| `date` | `z.string().date()` |
| `timestamp` | `z.string().datetime()` |
| `jsonb` | `z.unknown()` |
| `enum` | `z.enum([...])` |

nullable / default:

- insert schema は default がある column を optional にする。
- nullable column は `.nullable().optional()`。
- primary key uuid default column は insert では optional。
- update schema は全 field optional。ただし unknown key は拒否。

## Sandbox DB migration

`api/modules/database-design/sandbox-migration.service.ts`

責務:

- old `DatabaseSchemaJson` と new `DatabaseSchemaJson` の差分を作る。
- migration SQL preview を作る。
- destructive change を検出する。
- user confirmation 後に `SANDBOX_DATABASE_URL` へ apply する。
- apply result を `sandbox_migration_runs` に保存する。
- apply で作成・削除した object を `sandbox_managed_objects` に反映する。

MVP migration strategy:

- 承認された `DatabaseSchemaJson` から create enum / create table / create index / add foreign key を固定コードで生成する。
- SQL は create-if-not-exists で冪等に近づける。
- 既存 object の破壊的変更や column type 変更は自動適用しない。
- 破壊的変更が必要な場合は reset 後の再適用を使う。
- より細かい add column / alter column / destructive diff は後続 hardening とする。

SQL生成の制約:

- identifier は必ず `quoteIdent` でquoteする。
- value literal は `postgres` parameter か literal builder を通す。
- LLMが出したSQLを直接実行しない。
- migration SQL は固定コードが `DatabaseSchemaJson` diff から生成する。
- SQL preview はユーザー確認用であり、実行時も同じ固定コードの statement plan からSQLを生成する。

reset:

```ts
resetSandboxDatabase({ confirmation: 'RESET SANDBOX' })
```

- `SANDBOX_DATABASE_RESET_ALLOWED=true` の時だけ実行。
- 管理DBには影響しない。
- `sandbox_managed_objects` に登録されている active object だけを drop する。
- drop order は index / table cascade / enum cascade の順にする。
- drop 成功後、対象 object の `status` を `dropped` にする。
- reset 後、active applied schema version は null にする。

## Generic CRUD / relation API

`api/modules/database-design/database-design.routes.ts`

Routes:

- `GET /api/sandbox-db/state`
  - active draft schema, applied schema, migration status, table counts.
- `GET /api/sandbox-db/tables`
  - visual table list.
- `GET /api/sandbox-db/tables/:table/rows`
  - schema-aware list.
- `GET /api/sandbox-db/tables/:table/rows/:id`
  - schema-aware detail.
- `POST /api/sandbox-db/tables/:table/rows`
  - runtime insert validation then insert.
- `PATCH /api/sandbox-db/tables/:table/rows/:id`
  - runtime update validation then update.
- `DELETE /api/sandbox-db/tables/:table/rows/:id`
  - delete.
- `POST /api/sandbox-db/relations/:relation/attach`
  - many-to-many attach.
- `POST /api/sandbox-db/relations/:relation/detach`
  - many-to-many detach.

Security:

- table / column names are never accepted blindly.
- route param `table` must exist in active applied `DatabaseSchemaJson`.
- requested fields must exist in table schema.
- relation operation must exist in `DatabaseSchemaJson.relations`.
- arbitrary where/order SQL is not accepted.

## Sandbox Drizzle connection

`api/modules/database-design/sandbox-client.ts`

```ts
export const sandboxSql = postgres(config.SANDBOX_DATABASE_URL, { max: 5 });
export const sandboxDb = drizzle(sandboxSql);
```

方針:

- static Drizzle schema は生成保存しない。
- `sandboxDb` は transaction / raw SQL 実行 / health check のために提供する。
- dynamic table CRUD は `DatabaseSchemaJson` の allowlist 検証後、quoted identifier と parameterized values で実行する。
- sandbox DB 接続は管理DBの `db` client と別 module に分ける。
- reset / migrate / CRUD が管理DB client を使っていないことをテストする。

## Visual DB State UI

新規 route:

- `/database`
- `/database/schema`
- `/database/data`
- `/database/migrations`

MVP は `/database` に tab UI としてまとめてもよい。

表示する状態:

- Draft Schema: LLM が提案している最新 `DatabaseSchemaJson`。
- Applied Schema: sandbox DB に適用済みの schema version。
- Screen Binding: active ScreenJSON が参照している database schema version。
- Migration Preview: draft -> applied の差分と SQL。
- Sandbox Runtime: 実DB上の table existence / row count / sample rows。

必要な component:

- `DatabaseDesignerWorkspace`
  - ChatDock + preview workspace。
- `DatabaseSchemaGraph`
  - ER図。MVPは SVG / React Flow なしの手組みでもよいが、relation line は視覚表示する。
- `DatabaseTableList`
  - table / columns / indexes / relations。
- `DatabaseTableInspector`
  - selected table の columns, constraints, sample rows。
- `DatabaseMigrationPreview`
  - SQL, destructive warnings, apply button。
- `SandboxDataBrowser`
  - generic list/detail/form。

UI 方針:

- 「DB定義を説明するだけの画面」にしない。
- Draft / Applied / Binding の version 差を常に見せる。
- migrate button は destructive warning がある場合 disabled にし、明示確認を要求する。
- reset button は危険操作として別領域に置く。
- table cards の中にさらに card を入れない。
- ER図は一覧性を優先し、過度な装飾をしない。

## UI 生成との連動

### DBDesignへの2つの入口

DBDesign は「DBを即作成する画面」ではなく、DB schema の素案をレビューして承認する作業空間として扱う。sandbox DB に実tableを作るのは、ユーザーが DBDesign 上で承認して migration apply した後だけにする。

入口は2つある。

#### 入口A: UIからDBDesignへ

1. ユーザーが既存 `/prompt` または UI-only workspace で ScreenJSON を生成する。
2. 生成UIを確認し、ユーザーが「テーブル定義」ボタンを押す。
3. service は現在の `ScreenJSON` を minified JSON として LLM に渡す。
4. LLM は画面に必要な永続データ、form field、list column、relation、actionを読み取り、draft `DatabaseSchemaJson` と draft `DataBindingJson[]` を返す。
5. DBDesign に遷移し、UI preview と DB schema draft を並べて表示する。
6. この時点では sandbox DB に table は作らない。
7. ユーザーが DBDesign 上で承認すると migration preview を表示する。
8. ユーザーが migration apply を承認すると、初めて sandbox DB に実tableを作る。

この経路では LLM は「UIを作り直す」のではなく、「既存UIが必要としているデータ構造を推定する」。ScreenJSON の構造は原則維持し、必要に応じて `dataBindingId` だけを追加した新しい ScreenJSON version を作る。

#### 入口B: DBDesignプロンプトから素案作成

1. ユーザーが `/dbdesign` を開き、ChatDock に「予約と顧客を管理するDBを作って」などと入力する。
2. service は latest instruction と既存 draft/applied schema があればそれを LLM に渡す。
3. LLM は draft `DatabaseSchemaJson` と draft `DataBindingJson[]` を返す。UI案が必要な場合だけ `ScreenJSON` も返す。
4. DBDesign に DB schema draft、ER図、table inspector、migration preview を表示する。
5. この時点では sandbox DB に table は作らない。
6. ユーザーが承認すると migration apply へ進む。

この経路では DB schema を主に編集する。UIが未生成の場合は、`uiHints.suggestedScreens` を使って後から ScreenJSON 生成に渡す。

共通ルール:

- draft生成と apply は別操作にする。
- LLM は sandbox DB に対する migration SQL を返さない。
- DBDesign の assistant message には draft checkpoint button を出す。
- checkpoint restore は draft JSON の pointer を戻すだけで、LLMもmigrationも呼ばない。
- approved/applied schema と draft schema が違う場合、生成UIのDB操作は disabled にし、差分を表示する。

### ScreenJSON拡張

`shared/schemas/ui-schema.schema.ts`

```ts
export const appUiSchemaSectionSchema = z
  .object({
    component: appUiComponentNameSchema,
    source: z.string().min(1),
    variant: z.string().min(1).optional(),
    props: z.record(z.string(), z.unknown()).default({}),
    actions: z.array(appActionSchema).optional(),
    visualIntent: visualIntentSchema.optional(),
    dataBindingId: z.string().optional(),
  })
  .strict();
```

`shared/schemas/screen-history.schema.ts`

```ts
screenJsonSchema.extend({
  databaseSchemaJsonId: z.string().uuid().nullable().default(null),
  dataBindings: z.array(dataBindingSchema).default([]),
});
```

### DBDesign draft provider

既存 `ai.provider.ts` の layout generation とは別に `databaseDesignProvider` を作る。

`api/modules/database-design/database-design.provider.ts`

- `proposeDatabaseDesign(input)`
- `editDatabaseDesign(input)`

入力:

```ts
type ProposeDatabaseDesignInput = {
  prompt: string;
  source: 'screen' | 'dbdesign';
  screenJsonId?: string;
  currentScreen?: AppUiSchema;
  currentDatabaseSchema?: DatabaseSchemaJson;
  currentDataBindings?: DataBindingJson[];
  catalogConstraints?: string;
};
```

`source` は prompt の組み立て方を調整するための hint であり、APIやserviceを分ける理由にはしない。UIから来た場合は `screenJsonId` から ScreenJSON を読み、DBDesign内プロンプトの場合は `prompt` と既存 draft/applied context を中心に読む。

出力:

```ts
type DatabaseDesignDraftOutput = {
  screen?: AppUiSchema;
  databaseSchema: DatabaseSchemaJson;
  dataBindings: DataBindingDraft[];
};
```

### PromptWorkspace連携

既存の `/prompt` は当面維持する。

新規 route:

- `/dbdesign`

`/dbdesign` は DB schema draft のレビュー・編集・承認 workspace とする。

理由:

- 既存の UI-only prompt 体験を壊さない。
- DB生成を伴う操作は migrate preview / state UI が必要で、既存 PromptWorkspace より重い。
- 実装後、必要なら `/prompt` に統合できる。

`/dbdesign` での共通フロー:

1. UI経由またはDBDesignプロンプト経由で draft `DatabaseSchemaJson` / `DataBindingJson[]` を作る。
2. 管理DBに draft schema version と message checkpoint を保存する。
3. DBDesign に UI preview、DB draft preview、ER図、table inspector、migration preview を表示する。
4. user が ChatDock で「顧客に複数予約を持たせて」「タグ管理を many-to-many にして」など再編集する。
5. 再編集ごとに新しい draft schema / binding version を保存する。
6. user が「この定義でテーブル生成」または apply button を押す。
7. destructive warning を含む migration preview を確認する。
8. user が承認すると apply migrate。
9. generated UI は applied schema version と一致する binding だけ generic sandbox data API に接続する。

## Backend module構成

追加:

```text
api/modules/database-design/
  database-design.routes.ts
  database-design.service.ts
  database-design.repository.ts
  database-design.provider.ts
  database-schema-validator.service.ts
  runtime-zod.service.ts
  sandbox-client.ts
  sandbox-migration.service.ts
  sandbox-query.service.ts
```

MVPでは sandbox introspection は専用 service に分けず、managed object registry と `sandbox-query.service.ts` の `state` に集約する。

`api/app.ts`

- `/api/database-design`
- `/api/sandbox-db`

を mount する。

## Frontend module構成

追加:

```text
src/modules/database-design/
  components/
    DatabaseDesignerWorkspace.tsx
  hooks/
    database-design.hooks.ts
  repositories/
    database-design.repository.ts
```

MVP UI は `DatabaseDesignerWorkspace.tsx` に統合する。ER graph / inspector の分割は、画面が大きくなった時点のリファクタ対象にする。

routes:

```text
src/routes/database.tsx
src/routes/dbdesign.tsx
```

## API設計

`/api/database-design`

- `POST /propose`
  - body: `{ prompt, source, designSessionId?, screenJsonId? }`
  - `source: "screen"` の場合は現在の ScreenJSON を読み取り、UIに必要な DB schema / binding の素案を作る。
  - `source: "dbdesign"` の場合は DBDesign ChatDock の prompt と既存 draft/applied context から DB schema / binding の素案を作る。
  - どちらも sandbox DB には table を作らない。
- `GET /:designSessionId/conversation`
  - conversation, active screen, active database schema, bindings。
- `POST /:designSessionId/edit`
  - draft UI / DB / binding を再編集。sandbox DB には作らない。
- `POST /:designSessionId/checkpoints/restore`
  - body: `{ screenJsonId?: string, databaseSchemaJsonId?: string }`
  - message checkpoint の screen / DB schema pointer を restore。LLM は呼ばない。
- `GET /schema-jsons/:databaseSchemaJsonId`
  - minified DatabaseSchemaJson。
- `GET /schemas/:databaseSchemaJsonId`
  - `/schema-jsons/:databaseSchemaJsonId` の互換 alias。
- `POST /schema-jsons/:databaseSchemaJsonId/migration/preview`
  - applied schema との差分 SQL preview。
- `POST /schemas/:databaseSchemaJsonId/migration-preview`
  - migration preview の互換 alias。
- `POST /schema-jsons/:databaseSchemaJsonId/migration/apply`
  - sandbox DBへ migrate。
- `POST /schemas/:databaseSchemaJsonId/apply`
  - migration apply の互換 alias。
- `POST /reset`
  - sandbox DB reset。

`/api/sandbox-db`

- `GET /state`
- `GET /tables`
- `GET /tables/:table/rows`
- `GET /tables/:table/rows/:id`
- `POST /tables/:table/rows`
- `PATCH /tables/:table/rows/:id`
- `DELETE /tables/:table/rows/:id`
- `POST /relations/:relation/attach`
- `POST /relations/:relation/detach`

## Migration方針

管理DB migration:

1. `database_design_sessions`
2. `database_schema_jsons`
3. `database_design_messages`
4. `sandbox_migration_runs`
5. `sandbox_managed_objects`
6. `screen_jsons.database_schema_json_id`
7. `screen_jsons.data_bindings`

Drizzle schema declaration の循環を避けるため、active pointer 系 column は nullable uuid として追加し、MVPでは DB-level FK を必須にしない。永続化時の存在・所有者チェックは repository/service で行う。

Sandbox DB migration:

- Drizzle migration table は使わない。
- 管理DBの `sandbox_migration_runs` を migration history とする。
- sandbox DB の現在状態は introspection で確認する。

理由:

- sandbox DB は頻繁に reset される。
- 管理DB側に history が残れば、UIで状態差分を説明できる。
- Drizzle static schema を生成保存しない方針と合う。

## 実装フェーズ

### Phase 1: Schema contracts and management DB

対象:

- `shared/schemas/database-design.schema.ts`
- `shared/schemas/data-binding.schema.ts`
- `shared/schemas/ui-database-generation.schema.ts`
- `shared/schemas/ui-schema.schema.ts`
- `shared/schemas/screen-history.schema.ts`
- `api/db/schema.ts`
- Drizzle migration

実装:

- `DatabaseSchemaJson` / `DataBindingJson` Zod schema。
- semantic validator。
- management DB tables。
- `screen_jsons` に `databaseSchemaJsonId`, `dataBindings`。
- `sandbox_managed_objects` registry。
- `.env.example` に `SANDBOX_DATABASE_URL`, `SANDBOX_DATABASE_RESET_ALLOWED`。

テスト:

- valid one-to-many schema passes。
- valid many-to-many schema with join table passes。
- missing relation table fails。
- missing relation column fails。
- invalid join table fails。
- dangerous identifier fails。
- data binding unknown table/field fails。
- LLM output uses draft bindings without requiring database schema UUID。

### Phase 2: Runtime validation and sandbox query foundation

対象:

- `runtime-zod.service.ts`
- `sandbox-client.ts`
- `sandbox-query.service.ts`
- `database-design.routes.ts`

実装:

- `DatabaseSchemaJson` から insert/update/filter Zod を組み立てる。
- sandbox DB 接続。
- table list / row list / create / update / delete。
- relation attach/detach。
- managed object registry と sandbox query service で table existence / row count / sample rows を取得。

テスト:

- insert validation rejects invalid uuid。
- update rejects unknown field。
- list rejects unknown table。
- create builds parameterized SQL。
- many-to-many attach validates relation and inserts join row。
- sandbox routes do not touch management DB tables。

### Phase 3: Migration preview and apply

対象:

- `sandbox-migration.service.ts`
- `database-design.repository.ts`
- `database-design.service.ts`
- `database-design.routes.ts`

実装:

- initial create SQL。
- create-if-not-exists による add table / add index / add FK。
- destructive change は自動適用せず reset path に寄せる。
- migration preview endpoint。
- apply endpoint。
- reset endpoint。
- migration run persistence。

テスト:

- initial schema creates tables in dependency order。
- many-to-many creates join table and composite unique。
- apply persists `sandbox_migration_runs`。
- apply upserts `sandbox_managed_objects`。
- failed apply persists failed run and error。
- reset requires explicit confirmation and env flag。
- reset drops registered managed objects and leaves unregistered sandbox objects untouched。

後続 hardening:

- add column / alter column の差分 migration。
- destructive drop column warning。

### Phase 4: LLM DBDesign draft proposal

対象:

- `database-design.provider.ts`
- `database-design.service.ts`
- existing AI provider utilities
- `tests/database-design.provider.test.ts`

実装:

- strict JSON response contract。
- single propose API/service that accepts prompt plus optional `screenJsonId` and `source` hint。
- propose DB schema + binding from existing ScreenJSON when `source: "screen"`。
- propose DB schema + binding from DBDesign prompt when `source: "dbdesign"`。
- optional ScreenJSON update when binding IDs must be added。
- edit draft UI / DB / binding。
- prompt input includes current minified ScreenJSON, DatabaseSchemaJson, DataBindingJson, latest user instruction。
- prompt excludes conversation history。
- 24k token budget handling。
- catalog + DB schema constraints。

テスト:

- LLM output with one-to-many validates。
- LLM output with many-to-many validates。
- invalid relation is rejected before persistence。
- screen-source proposal does not apply migration。
- dbdesign-source proposal does not apply migration。
- edit prompt includes minified current DB schema。
- edit prompt does not include previous conversation messages。
- 24k over budget returns validation error。

### Phase 5: Visual DB state UI

対象:

- `src/routes/database.tsx`
- `DatabaseSchemaGraph.tsx`
- `DatabaseTableList.tsx`
- `DatabaseTableInspector.tsx`
- `DatabaseMigrationPreview.tsx`
- `SandboxDataBrowser.tsx`
- hooks / repositories

実装:

- Draft / Applied / Binding version status。
- ER graph。
- table / column / relation inspector。
- migration SQL preview。
- apply button。
- sandbox table data browser。
- reset panel。

テスト:

- database page shows draft/applied status。
- table inspector shows one-to-many and many-to-many。
- migration preview shows SQL and warnings。
- apply calls `/api/database-design/schema-jsons/:id/migration/apply`。
- data browser can create row with runtime validation。

### Phase 6: DB design workspace

対象:

- `src/routes/dbdesign.tsx`
- `DatabaseDesignerWorkspace.tsx`
- existing `PromptWorkspace` patterns

実装:

- ChatDock integrated DBDesign draft workflow。
- entry from current ScreenJSON via 「テーブル定義」 action。
- entry from DBDesign prompt。
- both entries call the same propose endpoint with different `source` and context.
- generated Screen preview。
- generated DB draft preview。
- checkpoint buttons for screen and database schema。
- edit creates new versions。
- restore does not call LLM。
- migrate remains explicit。

テスト:

- table definition action creates DB draft from current ScreenJSON without migration。
- DBDesign prompt creates DB draft without migration。
- both entries use the same API contract。
- ChatDock edit updates DB relation。
- restore checkpoint replays ScreenJSON / DatabaseSchemaJson / DataBindingJson without LLM。
- migrate button remains separate from generation。
- generated UI displays bound table rows after migration。

### Phase 7: Data-bound renderer

対象:

- `JsonRenderRenderer`
- `ui-schema-to-json-render.service.ts`
- component registry sections
- `sandbox-data.hooks.ts`

実装:

- section `dataBindingId` を解決。
- list binding は DataTable / CardGrid / MasterDetail に rows を注入。
- create binding は FormSection submit から generic sandbox API を呼ぶ。
- enum options は FormSection field option と runtime validation の組み合わせで扱う。
- update binding, relation option injection, relation select は MVP 後の拡張として分ける。

テスト:

- DataTableSection receives sandbox rows。
- submit validates and creates row。
- invalid create payload shows API validation error。

## 実装レビュー結果

この計画書を読み直して、実装との差分として以下を修正済み:

- `SANDBOX_DATABASE_RESET_ALLOWED` を尊重する guarded reset endpoint と reset panel を追加した。
- `/api/sandbox-db/tables`, row detail, many-to-many attach / detach を追加した。
- canonical path を `/schema-jsons/:id` とし、計画書に残っていた `/schemas/:id` は互換 alias として追加した。
- DBDesign provider の 24k token budget を provider 分岐前に移し、mock path でも同じ制約にした。
- LLM生成の `DataBindingJson` が存在しない table / field / relation を指した場合は永続化前に拒否する。
- `/database` route を `/dbdesign` と同じ workspace alias として追加した。
- FormSection の create binding submit を generic sandbox insert API に接続した。

意図的に次段階へ残すもの:

- ER graph 専用コンポーネント化。MVPでは table / column / relation 情報を統合 workspace 内で表示する。
- update binding の form submit。
- relation option injection と relation select UI。many-to-many attach / detach API は実装済みなので、UI部品追加で接続できる。

## 品質ゲート

現在の実装で必須:

- `pnpm verify`
- `pnpm test run tests/database-design*.test.ts`
- `pnpm build`
- `git diff --check`

追加ハードニング:

- `pnpm exec playwright test tests/e2e/database-design.spec.ts`
- migration dry run against local sandbox DB。
- reset test against disposable sandbox DB。

追加確認:

- management DB の `users` / auth tables に sandbox reset が影響しない。
- generated SQL contains no unquoted user-controlled identifiers。
- LLM output invalid relation is never persisted as active schema。
- UI generation does not auto apply migration。
- data-bound UI handles draft/applied schema mismatch visibly。

## リスクと対策

| リスク | 対策 |
| --- | --- |
| LLMが危険なSQLを返す | SQLはLLMから受け取らず、固定コードが schema diff から生成する |
| LLMが保守対象コードを増やす | 生成保存するのはJSONだけ。Drizzle/Zod/React/API codeは生成保存しない |
| UI生成直後に不要なtableが作られる | UI生成ではDBを作らず、「テーブル定義」操作でDBDesign draftを作り、承認後だけapplyする |
| UIにはfieldがあるがDBにはない | Draft / Applied / Binding version を常時表示し、未適用bindingは操作不能にする |
| many-to-manyが曖昧になる | UI上はrelation、DB上はjoin tableとして `DatabaseSchemaJson` に明示する |
| migrationで既存データを壊す | destructive diffを検出し、明示確認または reset path に分ける |
| runtime SQL injection | table/column/relationは active schema allowlist から解決し、identifier quote と parameterized values を徹底する |
| sandbox resetが管理DBに影響する | reset接続は `SANDBOX_DATABASE_URL` のみ。drop対象は `sandbox_managed_objects` に限定し、管理DB clientを使わないテストを追加する |
| prefixなし table 名で reset 対象を誤る | table prefixではなく managed object registry で対象を管理する |
| schema JSON が大きくなりLLM入力が破綻 | minified JSON、schema summary fallback、24k budget error を入れる |

## 実装範囲

中途半端な foundation だけではなく、Phase 1-7 を通して実装する。

完了条件:

- 既存UIの「テーブル定義」操作から `/dbdesign` に DB schema / binding の素案を表示できる。
- `/dbdesign` のプロンプトから DB schema / binding の素案を表示できる。
- 生成された DB schema を視覚的に確認できる。
- 素案表示時点では sandbox DB に table が作られていない。
- migration preview を確認して sandbox DB へ apply できる。
- sandbox DB の table / relation / rows を視覚的に確認できる。
- 生成 UI が `DataBindingJson` 経由で sandbox DB の rows を表示できる。
- generic form submit で runtime Zod validation を通して sandbox DB を更新できる。
- ChatDock から UI / DB / binding を再編集し、checkpoint restore できる。

実装前に確定済みの判断:

- sandbox DB は `.env` の `SANDBOX_DATABASE_URL` で既に作成済み前提。
- reset はDBごとdropしてもよいが、既定実装は sandbox DB 内の managed table / enum 全削除。
- managed table 名に `app_` prefix は強制しない。素の table 名を使う。
- UI + DB co-generation の route は `/dbdesign`。
- Phase 1-7 を最後まで実装する。
