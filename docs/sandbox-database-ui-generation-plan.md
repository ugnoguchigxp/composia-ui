# Sandbox Database UI Generation Implementation Notes

この文書は、SandboxDB / DBDesign 基盤実装後に残っていた
「生成 UI を `DataBindingJson` 経由で SandboxDB に接続する」実装の完了状態と、
今後拡張するときの境界を記録する。

DBDesign の基本方針、SandboxDB current state を主画面にする方針、Draft と applied state の扱いは
[DBDesign Sandbox State First Implementation Plan](./dbdesign-sandbox-state-first-plan.md)
を優先する。

## 実装済み

- `DatabaseSchemaJson` / `DataBindingJson` / `ScreenJSON.dataBindings` の schema contract。
- `database_schema_jsons.data_bindings` と `screen_jsons.data_bindings` の永続化カラム。
- `/api/database-design/propose` による Draft `DatabaseSchemaJson` / `DataBindingJson[]` 作成。
- DBDesign provider が返した bound `screen` の新規 `screen_jsons` version 保存。
- 保存した bound `ScreenJSON` への `databaseSchemaJsonId` / persisted `dataBindings` 紐づけ。
- prompt session / DBDesign session の active screen pointer 更新。
- provider が bound `screen` を返さない場合、既存 `screenJsonId` を維持する後方互換。
- provider screen の `sections[].dataBindingId` が `dataBindings[]` に存在することの service 層 validation。
- duplicate `DataBindingJson.id` の validation。
- `/api/database-design/drafts` における bound `screenJsonId` / prompt `sessionId` の返却。
- DBDesign main を SandboxDB current state と Draft list に限定し、AI prompt を置かない構成。
- Draft detail を `/dbdesign/drafts/:databaseSchemaJsonId` の別画面に分離し、会話履歴付きの再提案用 AI prompt を置く構成。
- Draft list / detail から Draft を物理削除する導線。
- Draft detail から bound UI を `/prompt/session/:sessionId` で開く導線。
- `PromptWorkspace` における active `ScreenJSON.dataBindings` の runtime 解決。
- `list` binding の SandboxDB rows 取得と `JsonRenderRenderer.bindingRows` 注入。
- `create` binding の `FormSection` submit から generic sandbox insert API への接続。
- applied-state mismatch / missing table / unmanaged table 時の read/write gate。
- gate 失敗・rows query 失敗・submit 失敗を preview banner に表示する処理。
- `DataTableSection` への rows 注入は binding rows を優先し、未取得時は static rows を preview fallback として維持する。
- unsupported component は binding rows で props shape を壊さない。

## Runtime Contract

生成 UI runtime で参照する binding source は active `ScreenJSON.dataBindings` のみとする。

`DatabaseSchemaJson.dataBindings` は DBDesign Draft detail / migration review のための draft metadata として扱う。`PromptWorkspace` は Draft list や DBDesign session から binding を推測しない。

許可する解決:

- `ScreenJSON.schema.sections[].dataBindingId`
- `ScreenJSON.dataBindings[].id`
- `ScreenJSON.dataBindings[].table`
- `ScreenJSON.dataBindings[].operation`
- `ScreenJSON.dataBindings[].fields`

禁止する解決:

- `DataTableSection.props.title` から table 名を推測する。
- `FormSection.props.fields` だけを見て table を推測する。
- active Draft から runtime binding を補う。
- `ScreenJSON.dataBindings[]` に存在するが画面 section から参照されていない binding の rows を取得する。

## Applied-State Gate

DB read/write を許可する条件:

```ts
binding.databaseSchemaJsonId === sandboxState.appliedDatabaseSchemaJsonId
```

追加で、対象 table が `sandboxState.tables` に存在し、`managed: true` であることを確認する。

許可しない場合:

- `list` binding は `/api/sandbox-db/tables/:table/rows` を呼ばない。
- `create` binding は submit を受けても `/api/sandbox-db/tables/:table/rows` を呼ばない。
- UI 上部に mismatch / missing table / unmanaged table の理由を表示する。
- static rows が `section.props.rows` にある場合は、DB rows ではなく preview fallback として表示してよい。

submit 時点で SandboxDB state が未ロードの場合も insert は行わない。

## Backend Flow

`source: "screen"` で `screenJsonId` が渡され、provider result に `draft.screen` がある場合だけ、新しい ScreenJSON version を作る。

新しい row は以下を持つ。

- `sessionId`: 元 ScreenJSON の session。
- `version`: 同 session の次 version。
- `schema`: `generated.draft.screen`。
- `databaseSchemaJsonId`: 保存した `database_schema_jsons.id`。
- `dataBindings`: service が schema id / version を埋めた persisted bindings。
- `trigger`: `chat-edit`。
- `prompt`: DBDesign propose prompt。
- `inferredIntent`: `generated.draft.screen.intent`。
- `contextSnapshot.previousScreen`: 元 ScreenJSON schema。

保存後、prompt session と DBDesign session の active screen を新しい ScreenJSON id に更新する。

provider が `screen` を返さない場合:

- service は heuristics で `dataBindingId` を ScreenJSON に埋め込まない。
- `DatabaseDesignResponse.screenJsonId` は入力 `screenJsonId` を返す。
- prompt session active screen は変更しない。

DBDesign propose は migration apply を呼ばない。

## Frontend Flow

`/dbdesign` は SandboxDB current state と Draft list だけを表示する。Draft 作成・編集の AI prompt は main には置かない。

Draft の table list、DDL preview、migration preview、apply、conversation、reproposal prompt は `/dbdesign/drafts/:databaseSchemaJsonId` で扱う。DBDesign の table list は Accordion コンポーネントで表示し、展開時に column 構造を table で表示し、index / foreign key の要約も表示する。詳細な DDL は DDL preview を確認対象にする。SandboxDB current state 側の Accordion は、展開した table に限って `GET /api/sandbox-db/tables/:table/contents` の登録値閲覧導線と `DELETE /api/sandbox-db/tables/:table` の DROP 導線を表示する。登録値閲覧は read-only の modal で最大 100 rows を table 表示し、managed / unmanaged に関わらず public table として実在する場合だけ許可する。DROP は `DROP TABLE ... CASCADE` を実行し、関連する managed object を `dropped` に更新するが、applied migration run 全体は `reverted` にしない。

Draft 削除は `DELETE /api/database-design/schema-jsons/:databaseSchemaJsonId` で `database_schema_jsons` を物理削除する。関連する DBDesign message / migration run は DB の FK cascade に任せ、bound ScreenJSON と managed object の `database_schema_json_id` は FK の `set null` に任せる。削除対象が DBDesign session の active Draft だった場合、active pointer は残存する最新 Draft へ更新し、残存 Draft がなければ null にする。

`PromptWorkspace` は active screen から以下を解決する。

1. `schema.sections[].dataBindingId` を列挙する。
2. `ScreenJSON.dataBindings[].id` に解決できる binding だけ runtime 対象にする。
3. runtime 対象のうち `operation: "list"` かつ applied-state gate を満たす binding だけ rows query を有効化する。
4. rows query 結果を `Record<dataBindingId, rows>` に変換し、`JsonRenderRenderer` に渡す。
5. `operation: "create"` の binding は `FormSection` submit から `insertSandboxRow(binding.table, payload)` を呼ぶ。
6. 成功後、sandbox state と該当 table rows query を invalidate する。

binding が存在しない、`create` ではない、applied-state gate を満たさない、または API error が返った場合は、API 呼び出しを止めて banner に理由を表示する。

## Renderer Scope

MVP で rows 注入する component:

- `DataTableSection`: binding rows がある場合 `props.rows` を上書きする。

MVP で submit binding を扱う component:

- `FormSection`: `dataBindingId` と `onSubmitBinding` で create を扱う。

後続候補:

- `CardGridSection` / `MasterDetailSection` の rows 注入。
- relation option injection。
- update form / delete button。
- many-to-many attach-detach UI。

## 非ゴール

- table ごとの React component / route / Drizzle schema 生成。
- update form、delete button、relation select、many-to-many attach-detach UI。
- arbitrary SQL UI。
- migration diff の高度化。
- DBDesign workspace の ER graph 専用コンポーネント化。
- 旧 Phase 1-7 計画の再実装。

## 対象ファイル

- `api/modules/database-design/database-design.service.ts`
- `api/modules/database-design/database-design.repository.ts`
- `api/modules/database-design/database-design.routes.ts`
- `api/modules/database-design/database-schema-validator.service.ts`
- `shared/schemas/database-design.schema.ts`
- `src/modules/database-design/components/DatabaseDesignerWorkspace.tsx`
- `src/modules/database-design/hooks/database-design.hooks.ts`
- `src/modules/database-design/repositories/database-design.repository.ts`
- `src/routes/dbdesign.drafts.$databaseSchemaJsonId.tsx`
- `src/modules/screen-history/components/PromptWorkspace.tsx`
- `src/modules/screen-history/services/binding-runtime.service.ts`
- `src/modules/ui-schema/services/ui-schema-to-json-render.service.ts`
- `src/modules/component-registry/components/sections/FormSection.tsx`

## 検証

実行済みの品質ゲート:

- `pnpm test run tests/database-design.service.test.ts tests/binding-runtime.service.test.ts tests/database-schema-validator.test.ts tests/routes.database-design.test.ts tests/ui-schema-renderer.test.tsx`
- `pnpm verify`
- `pnpm build`
- `git diff --check`

重点的に固定していること:

- UI から DBDesign propose しても migration run は作成されない。
- bound `ScreenJSON` は provider が `screen` を返したときだけ保存される。
- bound `ScreenJSON` 保存前に `dataBindingId` 参照整合性を検証する。
- matching binding だけ rows fetch 対象になる。
- 画面で参照されていない binding は rows fetch 対象にしない。
- mismatch / missing / unmanaged table の binding は rows fetch / insert を実行しない。
- `DataTableSection` は binding rows を優先し、未取得時は static rows を保持する。
- unsupported component に binding rows があっても props shape を壊さない。

## 残スコープ

未実装として残すべき必須項目はない。

残っているものは MVP 外の拡張であり、実装する場合は別タスクとして扱う。

- `CardGridSection` / `MasterDetailSection` の rows 注入。
- relation option injection。
- update / delete / attach / detach の UI binding。
- DBDesign workspace の ER graph 専用 UI。
- component-level interaction test の追加。現状は service / renderer / validator の単体テストで runtime 契約を固定している。
