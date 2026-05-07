# DBDesign Sandbox State First Implementation Plan

## 目的

DBDesign を「ページ単位のテーブル定義画面」ではなく、「システム全体の SandboxDB 状態を確認し、LLM で変更下書きを作る画面」として再整理する。

現在の実装は draft 生成ごとに UI 上の version が派手に増え、未適用の下書きが DB の現在状態のように見えやすい。DBDesign を開いた時に最初に見えるべきものは、現在の SandboxDB の table 一覧である。

## 決定事項

- Draft はユーザーが作った成果物なので全件残す。
- Draft にユーザー向け revision / version 表示は持たせない。
- DB 自体にも revision 番号を表示しない。
- Draft は「未適用の変更案」として残し、apply しても他の Draft は消さない。
- SandboxDB の現在状態は、管理DB上の draft ではなく SandboxDB introspection を正とする。
- 過去に apply された Draft と、現在の SandboxDB に一致している Draft は別概念として扱う。
- 古い Draft と現在の SandboxDB に構造ギャップがある場合は、現在の SandboxDB をベースに LLM で新しい Draft を再提案できるようにする。
- 再提案は既存 Draft を上書きしない。新しい Draft として保存する。
- UI binding は DBDesign の主役ではない。Draft 詳細の補助情報に留める。

## 非ゴール

- Draft の自動削除。
- DB revision 番号の導入。
- ページごとの DB schema 分離。
- 複数 project / tenant ごとの SandboxDB 分離。
- 任意 SQL 実行 UI。
- table ごとの専用 React / Drizzle / Zod ファイル生成。

## 実装前に固定する補完仕様

この計画は以下を先に固定してから実装する。ここが曖昧なままだと、Draft / SandboxDB / ScreenJSON の責務が再び混ざる。

### Historical applied の導出

現行 reset は apply 済み migration run を `reverted` に更新する。したがって `historically applied` は `status = 'applied'` だけではなく、過去に成功した apply 事実として導出する。

定義:

- `historicallyAppliedAt`: `sandbox_migration_runs.database_schema_json_id = draft.id` かつ `applied_at IS NOT NULL` で、`status IN ('applied', 'reverted')` の最新 `applied_at`
- `neverApplied`: 上記 run が存在しない
- `currentlyAppliedLike`: migration run ではなく `currentMatch === true` で判断する

重要:

- `status = 'reverted'` は「過去に apply されたが reset などで現在状態とは限らない」ことを示す。
- `status = 'applied'` が複数 Draft に残っていても、現在の SandboxDB と一致する保証には使わない。
- UI では `historically applied` と `current match` を別 badge として表示する。

### Draft persistence の形

ScreenJSON を増やさずに UI binding summary を再表示できるよう、DBDesign Draft 自体に binding draft を保存する。

追加する管理DB column:

```ts
database_schema_jsons.data_bindings jsonb not null default []
```

扱い:

- 型は `DataBinding[]` を使う。
- `databaseSchemaJsonId` と `databaseSchemaVersion` は保存時に埋める。
- Draft 詳細の UI bindings summary はこの column を読む。
- `screenJsonId` は Draft の source provenance として `database_design_messages.screen_json_id` から辿る。専用 column は最初は追加しない。
- source ScreenJSON の schema 自体を DBDesign が保存し直すことはしない。

### Draft source の導出

Draft 一覧の `source` は `database_schema_jsons.trigger` から導出する。

| trigger | source |
| --- | --- |
| `screen-proposal` | `screen` |
| `dbdesign-proposal` | `dbdesign` |
| `db-edit` | `dbdesign` |
| `db-reproposal` | `reproposal` |

`db-reproposal` を `databaseDesignTriggerSchema` に追加する。DB column は text なので migration は不要だが、Zod schema / provider logging / tests は更新する。

### Gap response contract

Gap は service 内部の boolean ではなく、API / UI / test で共有する schema として定義する。

```ts
type DatabaseDraftGapSeverity = 'blocking' | 'info';

type DatabaseDraftGapItem = {
  kind:
    | 'missing_table'
    | 'extra_table'
    | 'unmanaged_table_present'
    | 'missing_column'
    | 'extra_column'
    | 'column_type_mismatch'
    | 'column_nullability_mismatch'
    | 'missing_foreign_key'
    | 'extra_foreign_key'
    | 'index_mismatch';
  severity: DatabaseDraftGapSeverity;
  table: string | null;
  column: string | null;
  expected: string | null;
  actual: string | null;
  message: string;
};

type DatabaseDraftGapSummary = {
  currentMatch: boolean;
  blockingCount: number;
  infoCount: number;
  items: DatabaseDraftGapItem[];
};
```

`currentMatch` は `blockingCount === 0` と同義にする。`unmanaged_table_present` は常に `info`。

### SandboxDB introspection scope

初期実装では `public` schema の ordinary table だけを見る。

対象:

- `pg_class.relkind = 'r'`
- `pg_namespace.nspname = 'public'`

対象外:

- view / materialized view
- system schema
- extension 管理 object
- temporary table
- 任意 schema 切り替え

型 mapping は deterministic に行う。

| Postgres type | DatabaseSchemaJson scalar |
| --- | --- |
| `uuid` | `uuid` |
| `text` | `text` |
| `character varying` / `varchar` | `varchar` |
| `integer` / `int4` | `integer` |
| `bigint` / `int8` | `bigint` |
| `numeric` / `decimal` | `numeric` |
| `boolean` / `bool` | `boolean` |
| `date` | `date` |
| `timestamp without time zone` / `timestamp with time zone` | `timestamp` |
| `jsonb` | `jsonb` |
| enum user-defined type | `enum` |

index 比較は初期実装では `name + unique + columns exact match` とする。FK 比較は `constraint name + child column + referenced table + referenced column + onDelete` を比較する。

### unmanaged table の UI/API 境界

unmanaged table は SandboxDB current state に表示するが、既存 row 操作 API の対象にはしない。

- `/api/sandbox-db/state` では `managed: false` として表示する。
- `/api/sandbox-db/tables/:table/rows` は managed table のみ許可する現行方針を維持する。
- frontend は unmanaged table を選択しても row panel を開かず、構造表示だけにする。
- unmanaged table の存在は Draft current match を失敗させない。

### Reproposal provider contract

Reproposal は既存 provider に無理に全会話を渡さない。provider input を拡張して、現在 DB 状態と選択 Draft の意図だけを渡す。

```ts
type DatabaseDesignProviderInput = {
  currentDatabaseSchema?: DatabaseSchemaJson | null;
  currentSandboxState?: SandboxStateResponse | null;
  currentScreen?: AppUiSchema | null;
  selectedDraftSchema?: DatabaseSchemaJson | null;
  selectedDraftPrompt?: string | null;
  prompt: string;
  source: 'screen' | 'dbdesign' | 'reproposal';
};
```

provider prompt では `currentSandboxState` を正、`selectedDraftSchema` / `selectedDraftPrompt` を意図として扱う。出力は引き続き `DBDesignJob` のみ。

## 用語

- **SandboxDB current state**: `SANDBOX_DATABASE_URL` に実在する table / column / relation / index / row count。DBDesign の主表示。
- **Draft**: LLM またはユーザー指示で作られた `DatabaseSchemaJson` 下書き。未適用でも全件残す。
- **Historically Applied Draft**: `sandbox_migration_runs.applied_at IS NOT NULL` かつ `status IN ('applied', 'reverted')` が存在する Draft。過去に apply された事実だけを示す。
- **Current Match**: Draft と現在の SandboxDB introspection に構造 gap がない状態。現在使える構造かどうかはこれで判断する。
- **Gap**: Draft が前提にしている構造と、現在の SandboxDB introspection 結果の差分。
- **Reproposal**: 現在の SandboxDB current state と既存 Draft の意図を入力し、新しい Draft を作る操作。

## 画面設計

### `/dbdesign` 初期表示

主画面は `SandboxDB current state` を表示する。

表示項目:

- table name
- managed / unmanaged
- row count
- columns
- primary key
- nullability
- indexes
- foreign keys / relation

空の場合:

- 「SandboxDB に table はありません」
- Draft 作成フォームを表示
- 既存 Draft がある場合は Draft 一覧を表示

### Draft 一覧

既存の checkpoint 表示を Draft 一覧に置き換える。

表示項目:

- title または prompt summary
- createdAt
- source: `screen` / `dbdesign` / `reproposal`
- historical applied marker
- current match marker
- gap status
- table count

表示しないもの:

- `v1`, `v2` などの version 表示
- DB revision 番号

### Draft 詳細

Draft を選択した時だけ、変更案として表示する。

表示項目:

- Draft schema tables
- Draft relations
- Draft と SandboxDB current state の gap
- migration preview
- UI bindings summary

主要操作:

- `SandboxDB に反映`
- `現在の SandboxDB をベースに再提案`
- `JSON を表示`

### UI bindings

現在の画面 preview は主表示にしない。

Draft 詳細内で以下だけ確認できればよい。

- section
- dataBindingId
- operation
- table
- fields

## データモデル方針

### 既存テーブルの扱い

`database_schema_jsons.version` は既存互換の内部順序として残してよい。ただし UI / API の主要表現では Draft version として扱わない。

`sandbox_migration_runs.from_version` / `to_version` も既存互換のため当面残してよい。ただし DB revision として表示しない。将来的には nullable 化または非推奨化する。

### Draft の適用状態

適用状態のための新しい column は最初は追加せず、以下から導出する。

- historically applied: `sandbox_migration_runs` に `database_schema_json_id = draft.id` かつ `applied_at IS NOT NULL` かつ `status IN ('applied', 'reverted')` が存在する
- never applied: applied migration run が存在しない
- current match: Draft と SandboxDB current state の gap がない
- out of sync: historically applied かどうかに関係なく、Draft と SandboxDB current state に gap がある

必要になった場合のみ、後続で `database_schema_jsons.applied_at` を denormalized cache として追加する。

重要:

- `historically applied` は現在の SandboxDB と一致することを保証しない。
- reset / 手動変更 / 別 Draft apply の後は、過去に apply 済みの Draft でも `out of sync` になりうる。
- UI 上で操作判断に使うのは `current match` / `out of sync` であり、revision 番号ではない。
- reset が migration run を `reverted` に変えても、`historically applied` の履歴からは消さない。

### Session と Draft の関係

既存実装には `database_design_sessions` があるが、DBDesign は system-wide SandboxDB を扱う。したがって初期画面の Draft 一覧は session 単位に閉じず、ユーザーが作った Draft を横断して表示する。

方針:

- `database_design_sessions` は会話・入力履歴の grouping として残す。
- `/dbdesign` の主表示は session ではなく SandboxDB current state。
- Draft 選択は URL query の `draftId` または frontend state で表現する。
- `databaseDesignSessions.activeDatabaseSchemaJsonId` は DB current state pointer として使わない。
- 新規実装では Draft の全件一覧 API を追加し、`created_at DESC` で返す。`version` では並べない。

### ScreenJSON との関係

UI から DBDesign に入った場合でも、DBDesign は ScreenJSON を作り直さない。

方針:

- `screenJsonId` は Draft の source/provenance として扱う。
- `propose/edit/reproposal` は新しい `screen_jsons` row を作らない。
- DBDesign provider が生成した `dataBindings` は `database_schema_jsons.data_bindings` に保存する。
- `dataBindingId` 付き ScreenJSON を保存するのは、別途 UI 側で明示的に必要になった時だけにする。
- Draft 詳細では source ScreenJSON の binding summary を表示してよいが、DBDesign の主状態とは扱わない。

### Draft 一覧 API 用の派生情報

Draft 一覧では `database_schema_jsons` に加えて以下を service 側で付与する。

```ts
type DatabaseDraftSummary = {
  id: string;
  designSessionId: string;
  title: string;
  prompt: string;
  source: 'screen' | 'dbdesign' | 'reproposal';
  createdAt: string;
  tableCount: number;
  sourceScreenJsonId: string | null;
  historicallyAppliedAt: string | null;
  currentMatch: boolean;
  gap: DatabaseDraftGapSummary;
};
```

並び順は `database_schema_jsons.created_at DESC`。session ごとの `version` は返してよいが、Draft 一覧の主要表示には使わない。

## SandboxDB introspection

現在の `sandbox-db/state` は row count 中心なので、table 構造まで拡張する。

対象ファイル:

- `shared/schemas/database-design.schema.ts`
- `api/modules/database-design/sandbox-query.service.ts`
- `api/modules/database-design/database-design.routes.ts`
- `src/modules/database-design/repositories/database-design.repository.ts`
- `src/modules/database-design/hooks/database-design.hooks.ts`

追加する response 例:

```ts
type SandboxTableState = {
  name: string;
  rowCount: number;
  managed: boolean;
  columns: {
    name: string;
    type: string;
    nullable: boolean;
    primaryKey: boolean;
    defaultValue: string | null;
  }[];
  indexes: {
    name: string;
    columns: string[];
    unique: boolean;
  }[];
  foreignKeys: {
    name: string;
    column: string;
    referencesTable: string;
    referencesColumn: string;
    onDelete: string | null;
  }[];
};
```

実装方針:

- table 一覧は SandboxDB の `information_schema` / `pg_catalog` から取得する。
- 初期実装では `public` schema の ordinary table のみを対象にする。
- managed 判定だけ管理DBの `sandbox_managed_objects` と突き合わせる。
- managed registry に存在しない table も `managed: false` として見せる。
- row count は table ごとに best effort。失敗しても table 表示は落とさない。
- unmanaged table は row 操作 API には渡さず、構造確認だけを提供する。
- `appliedVersion` は response schema から削除するか、互換目的で残す場合でも frontend では表示しない。

## Gap detection

Draft と SandboxDB current state を比較する deterministic service を追加する。

対象ファイル:

- `api/modules/database-design/database-draft-gap.service.ts`
- `shared/schemas/database-design.schema.ts`
- `tests/database-draft-gap.test.ts`

検出する gap:

- `missing_table`: Draft にある table が SandboxDB にない
- `extra_table`: SandboxDB にある managed table が Draft にない
- `unmanaged_table_present`: SandboxDB に unmanaged table がある
- `missing_column`: Draft にある column が SandboxDB にない
- `extra_column`: SandboxDB にある column が Draft にない
- `column_type_mismatch`
- `column_nullability_mismatch`
- `missing_foreign_key`
- `extra_foreign_key`
- `index_mismatch`

比較は identifier の完全一致を基本にする。正規表現による救済や曖昧推測はしない。

Gap 判定の扱い:

- managed table の差分は Draft の current match 判定に使う。
- unmanaged table は DBDesign 初期画面に表示するが、Draft の current match を失敗させる blocking gap にはしない。
- unmanaged table が存在する場合は informational gap として表示する。
- 型比較はまず Postgres の実型名を `DatabaseSchemaJson` の scalar type に deterministic に map する。LLM には判定させない。
- 比較対象は `public` schema の introspection 結果に限定する。
- index は初期実装では `name + unique + columns` の完全一致で比較する。
- foreign key は constraint name / column / references table / references column / onDelete を比較する。

## 再提案フロー

### API

追加 API:

```http
POST /api/database-design/schema-jsons/:databaseSchemaJsonId/reproposal
```

request:

```ts
{
  prompt?: string;
}
```

service input:

- current SandboxDB introspection
- selected Draft schema
- selected Draft original prompt
- latest user instruction
- selected Draft dataBindings

LLM input 方針:

- 全会話は入れない。
- 現在の SandboxDB current state を正とする。
- 選択中 Draft は「意図」として使う。
- output は現在の `DBDesignJob` のみ。
- 24k token budget を維持する。

保存方針:

- 既存 Draft は更新しない。
- 新しい Draft を `database_schema_jsons` に作る。
- message は「現在の SandboxDB をベースに下書きを再提案しました。」にする。
- SandboxDB には apply しない。

Trigger/source:

- 既存 enum に `db-reproposal` を追加する。
- `database_schema_jsons.trigger = 'db-reproposal'` として保存する。
- provider input の `source` は prompt routing hint であり、DB current state を表すものではない。
- provider input の `source` は `'reproposal'` を受け付けるように拡張する。

## Backend 変更計画

### `database-design.service.ts`

変更内容:

- `propose` は Draft 保存だけを行う。
- `propose` で `persistBoundScreen` を呼ばない。
- `propose` で `activeScreenJsonId` を更新しない。
- assistant message から `v${version}` を削除する。
- `dataBindings` は `database_schema_jsons.data_bindings` に保存する。
- `conversation` は Draft conversation として残すが、DB current state とは分離する。
- `listDrafts` を追加し、DBDesign 初期画面用に全 Draft を返す。
- `draftGap` を追加し、単一 Draft の gap summary を返す。
- `reproposal` を追加する。
- `propose/edit/reproposal` response の `migrationPreview` は必須にしない。Draft 詳細で必要時に取得する。

注意:

- 既存の `databaseDesignSessions.activeDatabaseSchemaJsonId` は「選択中 Draft」程度の意味に縮退させる。
- DB の現在状態を示す pointer として使わない。
- `screenJsonId` は source provenance として message metadata または `database_design_messages.screen_json_id` に残す。`sourceScreenJsonId` 専用 column の追加は、一覧・検索で必要になった時点で判断する。

### `sandbox-migration.service.ts`

変更内容:

- `sandbox_migration_runs` は現行通り pending 作成後に `applied` / `failed` へ更新してよい。
- `historically applied` の導出には `applied_at IS NOT NULL` の run だけを使う。
- response から user-facing `toVersion` 表示を外す。
- managed object registry は継続利用する。
- apply 後に Draft applied marker を導出できるよう、migration run の `databaseSchemaJsonId` を維持する。
- reset 後も historical migration run は残るため、UI は `historically applied` と `current match` を必ず別表示にする。
- reset は現行通り applied run を `reverted` にしてよい。履歴表示側は `reverted` も historical applied として扱う。

### `sandbox-query.service.ts`

変更内容:

- `state` を introspection based に拡張する。
- managed registry にない table も表示する。
- columns / indexes / foreign keys を返す。
- unmanaged table に対する rows API は許可しない。

### `database-design.repository.ts`

追加する repository method:

- `listSchemaJsonsForUser(userId)`:
  - `database_schema_jsons` と `database_design_sessions` を join し、`createdBy = userId` で全 Draft を返す。
  - order は `database_schema_jsons.created_at DESC`。
- `listAppliedMigrationRunsBySchemaJsonIds(ids)`:
  - Draft summary の `historicallyAppliedAt` を導出する。
  - `status IN ('applied', 'reverted')` かつ `applied_at IS NOT NULL` を対象にする。
- `findSourceScreenJsonIdBySchemaJsonIds(ids)`:
  - `database_design_messages.database_schema_json_id` から最初の `screen_json_id` を取得する。
  - 取得できない場合は `null`。

既存の `listSchemaJsons(designSessionId)` は conversation 用に維持する。

### `database-design.provider.ts`

変更内容:

- `DatabaseDesignProviderInput.source` に `'reproposal'` を追加する。
- `currentSandboxState` / `selectedDraftSchema` / `selectedDraftPrompt` を受け取る。
- prompt には全 conversation を入れない。
- `currentSandboxState` がある場合はそれを現在状態として明示し、`currentDatabaseSchema` は「管理DB上の前回 Draft」として扱わない。
- token budget は現行の 24k を維持する。

## Frontend 変更計画

対象ファイル:

- `src/modules/database-design/components/DatabaseDesignerWorkspace.tsx`
- `src/modules/database-design/hooks/database-design.hooks.ts`
- `src/modules/database-design/repositories/database-design.repository.ts`

変更内容:

1. `/dbdesign` の主画面を SandboxDB table 一覧にする。
2. Draft 一覧を side panel または secondary section にする。
3. `CheckpointList` を `DraftList` に改名する。
4. Draft 表示から `v{version}` を削除する。
5. Draft 選択時だけ Draft 詳細を表示する。
6. Draft 詳細に gap summary を表示する。
7. gap がある場合は `現在の SandboxDB をベースに再提案` ボタンを表示する。
8. `UI bindings` は Draft 詳細内の補助表示にする。

状態管理:

- `/dbdesign?draftId=...` があればその Draft を選択状態にする。
- `designSessionId` は conversation 表示用にだけ使う。初期表示の主状態には使わない。
- 新規 Draft 作成後は `drafts` / `sandbox-db/state` / selected Draft detail を invalidate する。
- Draft 作成だけでは `sandbox-db/state` を「変わった前提」で描画しない。invalidate はしてよいが、current state が変わらないことを UI で崩さない。
- apply 成功後だけ `sandbox-db/state` と Draft gap を invalidate する。
- unmanaged table 選択時は rows panel を表示しない。

## API 変更

```http
GET /api/sandbox-db/state
```

現在の SandboxDB introspection を返す。

```http
GET /api/database-design/drafts
```

ユーザーが作成した全 Draft を作成日時順で返す。session 指定は必須にしない。

response:

```ts
{
  drafts: DatabaseDraftSummary[];
}
```

```http
GET /api/database-design/schema-jsons/:databaseSchemaJsonId/gap
```

Draft と現在 SandboxDB の gap を返す。

response:

```ts
{
  databaseSchemaJsonId: string;
  gap: DatabaseDraftGapSummary;
}
```

```http
POST /api/database-design/schema-jsons/:databaseSchemaJsonId/reproposal
```

現在 SandboxDB をベースに新しい Draft を作る。

既存:

```http
POST /api/database-design/propose
POST /api/database-design/:designSessionId/edit
POST /api/database-design/schema-jsons/:databaseSchemaJsonId/migration/apply
```

は維持する。ただし semantics は「Draft 作成」と「Apply」を明確に分離する。

互換方針:

- `GET /api/database-design/:designSessionId/conversation` は残す。
- `POST /api/database-design/:designSessionId/checkpoints/restore` は即削除しないが、DBDesign 主 UI からは使わない。
- `schema-jsons/:id/migration/preview` は Draft 詳細から lazy load する。

## 実装順序

### Phase 0: 契約と永続化の補完

- `database_schema_jsons.data_bindings` を追加する migration を作る。
- `databaseDesignTriggerSchema` に `db-reproposal` を追加する。
- `SandboxTableState` / `DatabaseDraftGapSummary` / `DatabaseDraftSummary` の shared schema を追加する。
- `sandbox-db/state` の `appliedVersion` を user-facing から外す。互換で残す場合も frontend では使わない。
- repository に user-wide Draft list / migration history aggregation / source screen lookup を追加する。

完了条件:

- Draft summary と gap response の型が frontend/backend/tests で共有されている。
- Draft dataBindings が ScreenJSON なしで永続化できる。
- historical applied の導出が reset 後も破綻しない。

対象ファイル:

- `api/db/schema.ts`
- `drizzle/migrations/*`
- `shared/schemas/database-design.schema.ts`
- `api/modules/database-design/database-design.repository.ts`
- `api/modules/database-design/database-design.service.ts`
- `api/modules/database-design/database-design.routes.ts`
- `src/modules/database-design/repositories/database-design.repository.ts`
- `src/modules/database-design/hooks/database-design.hooks.ts`
- `tests/routes.database-design.test.ts`

Drizzle schema では `jsonb('data_bindings').$type<DataBinding[]>().notNull().default([])` 相当を追加する。生成 SQL が `DEFAULT '[]'::jsonb` になっていることを migration で確認する。

### Phase 1: 表示概念の修正

- DBDesign 初期画面を SandboxDB current state 中心に変更する。
- Draft 一覧を表示する。
- Draft version 表示を削除する。
- assistant message の `vN` 表示を削除する。

完了条件:

- `/dbdesign` を開くと、まず SandboxDB table 一覧が見える。
- Draft が複数あっても DB version のようには表示されない。

### Phase 2: SandboxDB introspection 拡張

- `sandbox-db/state` に columns / indexes / foreign keys を追加する。
- managed / unmanaged を分けて表示する。
- row count 失敗時も state response は返す。

完了条件:

- DBDesign 上で SandboxDB の現在 table 構造を確認できる。

### Phase 3: Draft と apply の副作用分離

- `propose/edit` から `persistBoundScreen` を外す。
- `propose/edit` で active screen pointer を更新しない。
- migration preview は Draft 詳細で必要時に見る。
- apply 時だけ SandboxDB を変更する。

完了条件:

- Draft 作成だけでは ScreenJSON が増えない。
- Draft 作成だけでは SandboxDB が変わらない。
- Apply 成功時だけ SandboxDB state が変わる。
- Apply 成功後も DB revision 番号を表示しない。

### Phase 4: Gap detection

- `database-draft-gap.service.ts` を追加する。
- Draft list / Draft detail に gap summary を表示する。
- unmanaged table は info gap、managed table 差分は blocking gap として返す。

完了条件:

- 古い Draft が現在 SandboxDB とズレている場合、UI で分かる。
- reset 後、historically applied Draft が out of sync と表示される。

### Phase 5: Reproposal

- `reproposal` API を追加する。
- LLM input に current SandboxDB state / selected Draft / latest prompt のみを入れる。
- 新しい Draft として保存する。
- `trigger = 'db-reproposal'` として保存する。
- 既存 Draft / ScreenJSON / SandboxDB は更新しない。

完了条件:

- 古い Draft を残したまま、現在 SandboxDB ベースの新 Draft を作れる。

### Phase 6: テストと整理

- route / service / schema / frontend hook のテストを追加する。
- 既存 docs の古い `version` / `Applied Schema version` 表現を更新する。

## テスト計画

Backend:

- `propose` は Draft を保存するが SandboxDB を変更しない。
- `propose` は ScreenJSON を新規保存しない。
- `propose` は `database_schema_jsons.data_bindings` に dataBindings を保存する。
- `apply` だけが managed objects を増やす。
- `sandbox-db/state` は live introspection の columns を返す。
- `sandbox-db/state` は managed registry にない public table も `managed: false` で返す。
- Draft list は全 Draft を返し、version label を前提にしない。
- Draft list は session をまたいで `createdAt DESC` で返す。
- Draft list は `status = 'reverted'` かつ `appliedAt` ありの run も historically applied として扱う。
- Gap detection が table / column / FK 差分を返す。
- Gap detection は unmanaged table を informational として返し、blocking gap にしない。
- reset 後、historically applied Draft が current match ではなくなる。
- Reproposal は既存 Draft を更新せず、新しい Draft を作る。
- Reproposal は `trigger = 'db-reproposal'` で保存する。
- Reproposal provider input は全 conversation を含めない。

Frontend:

- `/dbdesign` 初期表示が SandboxDB table list を主表示する。
- Draft 一覧に `v1` 等が出ない。
- Draft 詳細で gap summary が表示される。
- Reproposal button が gap あり Draft に表示される。
- Apply 後に sandbox state が invalidate される。
- Applied marker と current match marker が別に表示される。
- unmanaged table 選択時に rows panel が表示されない。
- Draft 詳細の UI bindings は Draft の `dataBindings` から表示される。

Manual:

- 空 SandboxDB で `/dbdesign` を開く。
- Draft を作る。
- Draft 作成だけでは SandboxDB table が増えないことを確認する。
- Apply で table が増えることを確認する。
- SandboxDB を変更または reset して gap が出ることを確認する。
- reset 後、過去に apply した Draft が applied history を保ちつつ out of sync になることを確認する。
- Reproposal で新しい Draft が作られ、旧 Draft が残ることを確認する。

## 受け入れ条件

- DBDesign は system-wide SandboxDB 管理画面として見える。
- ページ単位 DB schema のように見えない。
- Draft は全件残る。
- Draft に user-facing revision / version がない。
- DB に user-facing revision 番号がない。
- Draft 作成と SandboxDB apply が明確に分かれている。
- 古い Draft と現在 SandboxDB の gap が分かる。
- gap がある Draft から現在 SandboxDB ベースの再提案ができる。
- reset 後も過去 apply 済み Draft は historical marker を保ち、current match は gap で判断される。
- Draft 詳細の UI bindings は ScreenJSON を新規作成しなくても再表示できる。
- unmanaged table は current state には表示されるが、managed row 操作の対象にはならない。
