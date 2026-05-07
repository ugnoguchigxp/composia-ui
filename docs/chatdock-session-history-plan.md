# ChatDock Session History, Checkpoint, And Screen Re-Edit Plan

## 目的

履歴詳細で保存済み画面を見ているとき、右側の ChatDock から「今見ている画面」を会話で再編集できるようにする。

同時に、初回プロンプトから派生した生成・アクション遷移・再編集を 1 つの Session として扱い、過去の会話と画面の時点を保存・復元できるようにする。

生成が完了した ChatDock の assistant message にはチェックポイントボタンを表示する。ユーザーはそのボタンから、生成されたバージョンへいつでも戻れる。

## 現状整理

既に存在するもの:

- `prompt_sessions`
  - `id`, `title`, `createdBy`, `createdAt`, `updatedAt`
  - 初回 prompt 生成時に作られる session。
- `generated_screens`
  - `sessionId`, `parentScreenId`, `trigger`, `prompt`, `schema`, `contextSnapshot`, `providerMeta`
  - 初回生成、action click、regenerate の結果を保存する。
  - `parentScreenId` により画面生成の親子関係は持っている。
  - 今回の設計では互換用の既存テーブルとして扱い、新しい永続化先は `screen_jsons` に寄せる。
- `/history`
  - 保存済み screen をフラットに一覧表示する。
- `/prompt/$screenId`
  - 現行 route は保存済み screen を LLM なしで再描画する。
  - 新設計では session workspace route へ置き換える。
- `PromptWorkspace` / `ChatDock`
  - 画面生成と action click からの次画面生成はできる。
  - ただし ChatDock の `messages` はローカル state のみで永続化されない。
  - 現行の `screenId` を見ている状態で通常送信しても、「現在の screen を編集する」意味にはなっていない。

不足しているもの:

- screen 詳細を開いたときに、その時点までの会話が復元されない。
- ChatDock から現在の screen を編集する専用 API / hook / UI がない。
- 過去の会話の時点に戻る UI がない。
- ChatDock の生成結果に「このバージョンへ戻る」ためのチェックポイント操作がない。
- JSON 本体が session/screen 履歴の概念と密結合しており、ScreenJSON として独立して参照・閲覧できない。
- Session 単位の履歴表示・会話表示がまだ弱く、screen のフラット履歴に寄っている。

## 推奨する基本方針

`Session` と `ScreenJSON` を分離する。

新しい中心概念は「生成された JSON を ScreenJSON として version 管理する」ことにする。生成・再編集のたびに新しい `screen_jsons` row を作る。Session は JSON 本体を持たず、現在表示している ScreenJSON の id だけを持つ。

ChatDock の assistant message には、その生成結果に対応する ScreenJSON checkpoint button を表示する。ボタンを押すと該当 ScreenJSON を読み込み、Session の current pointer をその id に戻して表示する。LLM は呼ばない。

今回は branch 機能は扱わない。過去 checkpoint に戻って編集した場合、その後の checkpoint / message は削除または無効化してよい。つまり履歴は基本的に 1 本の timeline として扱う。

この方針にすると、以下が単純になる。

- JSON のチェックポイント: `screen_jsons.id`
- JSON の version: `screen_jsons.version`
- Session の現在値: `prompt_sessions.activeScreenJsonId`
- 会話復元: session の messages を version 順に読む
- checkpoint へ戻る: ChatDock の checkpoint button から `activeScreenJsonId` を戻す
- checkpoint から編集: active ScreenJSON を元に新しい ScreenJSON version を作る
- replay: 保存済み ScreenJSON を読み込んで json-render で表示するだけ。LLM は呼ばない。

今回のスコープ外:

- branch / sibling checkpoint の保持
- Session / ScreenJSON / message の RBAC 設計
- 複数ユーザー間の共有・権限管理

既存の auth middleware や `createdBy` による所有者絞り込みがすでにある route では、それを壊さず維持する。ただし新しい RBAC ロール、共有権限、管理者権限は今回追加しない。

## データモデル

### 追加テーブル

`screen_jsons`

```ts
export const screenJsons = pgTable(
  'screen_jsons',
  {
    ...commonColumns,
    sessionId: uuid('session_id')
      .notNull()
      .references(() => promptSessions.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    prompt: text('prompt').notNull(),
    trigger: text('trigger').notNull(), // initial-prompt | action-click | regenerate | chat-edit
    schema: jsonb('schema').$type<AppUiSchema>().notNull(),
    contextSnapshot: jsonb('context_snapshot')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    providerMeta: jsonb('provider_meta').$type<ScreenProviderMeta>().notNull(),
  },
  (table) => ({
    sessionVersionUniqueIdx: uniqueIndex('screen_jsons_session_version_uidx').on(
      table.sessionId,
      table.version
    ),
    sessionIdx: index('screen_jsons_session_idx').on(table.sessionId),
  })
);
```

`prompt_sessions` には current pointer を追加する。

```ts
activeScreenJsonId: uuid('active_screen_json_id')
```

注意:

- Session は JSON 本体を持たない。
- edit / generate の結果は `screen_jsons` にだけ保存する。
- Session は常に現在表示中の `activeScreenJsonId` を持つ。
- `activeScreenJsonId` は初回 ScreenJSON 作成後に更新する。DB migration 上の循環参照が面倒なら FK は後続 migration で追加してもよい。
- JSON は DB でも API 内部でも pretty print しない。ユーザー表示が必要な場合だけ pretty print する。

### 既存データ移行

既存 `generated_screens` は `screen_jsons` へ線形移行する。

- `sessionId` ごとに `generated_screens.createdAt ASC` で並べる。
- 並び順を `screen_jsons.version` として採番する。
- `generated_screens.prompt`, `trigger`, `schema`, `contextSnapshot`, `providerMeta` を `screen_jsons` へ移す。
- 各 session の `activeScreenJsonId` は、移行後の最大 version の ScreenJSON id にする。
- 既存の `parentScreenId` による branch 構造は MVP では保持しない。
- 既存 `generated_screens` は互換読み取り用に残してよいが、新規書き込みは `screen_jsons` のみにする。
- 既存 message はないため、conversation API の fallback message で補う。

`prompt_session_messages`

```ts
export const promptSessionMessages = pgTable(
  'prompt_session_messages',
  {
    ...commonColumns,
    sessionId: uuid('session_id')
      .notNull()
      .references(() => promptSessions.id, { onDelete: 'cascade' }),
    screenJsonId: uuid('screen_json_id')
      .notNull()
      .references(() => screenJsons.id, { onDelete: 'cascade' }),
    role: text('role').notNull(), // user | assistant | system
    content: text('content').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => ({
    sessionIdx: index('prompt_session_messages_session_idx').on(table.sessionId),
    screenJsonIdx: index('prompt_session_messages_screen_json_idx').on(table.screenJsonId),
    createdAtIdx: index('prompt_session_messages_created_at_idx').on(table.createdAt),
  })
);
```

理由:

- 1 ScreenJSON に、その version を生んだ user message と assistant message を紐づける。
- session の timeline を辿るだけで、その時点の会話を復元できる。
- ScreenJSON 削除時に、その version 由来の message も削除される。
- assistant message の `metadata.checkpointScreenJsonId` で ChatDock の checkpoint button を描画できる。

message metadata の推奨形:

```ts
type PromptSessionMessageMetadata = {
  checkpointScreenJsonId?: string;
  checkpointLabel?: string;
  generatedPage?: string;
  version?: number;
  trigger?: 'initial-prompt' | 'action-click' | 'regenerate' | 'chat-edit';
};
```

checkpoint button は `metadata.checkpointScreenJsonId` がある assistant message にだけ出す。user message には出さない。

### Schema 追加

`shared/schemas/screen-history.schema.ts`

- `screenTriggerSchema`
  - 追加: `"chat-edit"`
- `screenJsonSchema`
  - `id`, `sessionId`, `version`, `prompt`, `trigger`, `schema`, `contextSnapshot`, `providerMeta`, `createdAt`, `updatedAt`
- `promptSessionMessageSchema`
  - `id`, `sessionId`, `screenJsonId`, `role`, `content`, `metadata`, `createdAt`, `updatedAt`
  - `metadata.checkpointScreenJsonId` は optional uuid
  - `metadata.checkpointLabel` は optional string
- `screenConversationResponseSchema`
  - `session`
  - `activeScreenJsonId`
  - `screenJsons: ScreenJsonSummary[]`
  - `messages: PromptSessionMessage[]`
- `screenEditRequestSchema`
  - `prompt: string`
- `screenEditResponseSchema`
  - 新しい ScreenJSON と conversation activities を返す

## Backend 設計

### Repository

`api/modules/screen-history/screen-history.repository.ts`

追加:

- `createScreenJson(input)`
- `listScreenJsons(sessionId)`
- `findScreenJsonById(screenJsonId)`
- `deleteScreenJsonsAfterVersion(sessionId, version)`
- `updateSessionActiveScreenJson(sessionId, screenJsonId)`
- `createMessages(input[])`
- `listSessionMessages(sessionId)`
- `deleteMessagesAfterVersion(sessionId, version)`

今回は branch を扱わないため、recursive CTE は不要。`screen_jsons.version` の単純な昇順 timeline として扱う。

### Service

`api/modules/screen-history/screen-history.service.ts`

追加:

- `conversation(sessionId)`
  - session を取得
  - session の `activeScreenJsonId` を取得
  - session 内の ScreenJSON / messages を全件取得する
  - active ScreenJSON の `version` を `activeVersion` として返す
  - UI は `activeVersion` 以前を現在の会話として扱い、それ以降は future 履歴として保持できる
  - `{ session, activeScreenJsonId, activeVersion, screenJsons, messages }` を返す
- `edit(sessionId, input)`
  - session の active ScreenJSON を取得
  - AI prompt を組み立てる
  - active version より後の ScreenJSON / messages を削除する
  - same session に次 version の ScreenJSON を保存する
  - session の `activeScreenJsonId` を新 ScreenJSON id に更新する
  - `trigger: "chat-edit"`
  - new ScreenJSON に user message / assistant message を保存する

重要: edit prompt には会話全文を入れない。ChatDock の会話履歴は UI 復元と checkpoint 表示のために保存するが、LLM への edit 入力には使わない。

編集用 prompt は以下だけに絞る。

- App UI Schema / catalog の最小制約
- 現在表示中の minified App UI Schema JSON
- 最新のユーザー修正指示

JSON の扱い:

- ユーザーが JSON を読む画面以外では常に minify する。
- LLM prompt に入れる active ScreenJSON の schema payload は必ず `JSON.stringify(schema)` 相当の minified JSON にする。
- API 内部、message metadata、checkpoint metadata、provider 入力、テスト fixture の比較対象も、可読性が不要な経路では minified JSON を基準にする。
- ユーザー向けの JSON preview / debug panel / copy 用表示だけ pretty print を許可する。

入力予算:

- edit prompt は最大 24k tokens まで許容する。
- 既存の 8k 文字程度の制限を前提にしない。
- 24k tokens を超える場合は、会話を足して救済しない。active ScreenJSON の schema payload は常に minified なので、それでも超える場合は「現在の JSON が大きすぎて編集できない」として明示エラーにする。
- token 計測は provider の tokenizer が使えるならそれを使う。難しい場合は保守的な近似で `characters / 3` を上限判定に使う。

```text
Revise the current App UI Schema according to the user's latest instruction.

App UI Schema constraints:
- Return strict JSON only.
- Use catalog components only.
- Preserve existing schema shape unless the user asks to change it.
- Keep visible labels as product copy.

Active ScreenJSON schema payload, minified:
...

Latest user instruction:
...

Return a complete App UI Schema. Preserve useful structure unless the user asks to change it.
Do not explain changes in visible UI labels.
```

初回生成・action click・regenerate でも message を保存する:

- `generate`
  - user: 初回 prompt
  - assistant: `${page} を保存しました。${sections} sections`
  - assistant metadata: `{ checkpointScreenJsonId: screenJson.id, checkpointLabel: "このバージョンへ戻る", generatedPage: page, version: screenJson.version, trigger: "initial-prompt" }`
- `generateFromAction`
  - user: clicked action label または action intent
  - assistant: `${page} を生成しました。`
  - assistant metadata: `{ checkpointScreenJsonId: screenJson.id, checkpointLabel: "このバージョンへ戻る", generatedPage: page, version: screenJson.version, trigger: "action-click" }`
- `regenerate`
  - user: regenerate prompt または元 prompt
  - assistant: `${page} を再生成しました。`
  - assistant metadata: `{ checkpointScreenJsonId: screenJson.id, checkpointLabel: "このバージョンへ戻る", generatedPage: page, version: screenJson.version, trigger: "regenerate" }`
- `edit`
  - user: 修正指示
  - assistant: `${page} を更新しました。`
  - assistant metadata: `{ checkpointScreenJsonId: screenJson.id, checkpointLabel: "このバージョンへ戻る", generatedPage: page, version: screenJson.version, trigger: "chat-edit" }`

既存 screen / ScreenJSON には message が存在しない場合があるため、conversation API では fallback message を組み立てる。

- user: `screenJson.prompt`
- assistant: `${screenJson.schema.page} を保存しました。`
- assistant metadata: `{ checkpointScreenJsonId: screenJson.id, checkpointLabel: "このバージョンへ戻る", generatedPage: screenJson.schema.page, version: screenJson.version, trigger: screenJson.trigger }`

これにより migration 前の履歴も壊れない。

### Routes

`api/modules/screen-history/screen-history.routes.ts`

追加:

- `GET /api/sessions/:sessionId/conversation`
  - session 全体の会話、checkpoint list、active ScreenJSON pointer を返す
- `POST /api/sessions/:sessionId/edit`
  - ChatDock から現在の ScreenJSON を再編集し、新しい ScreenJSON version を作る
- `POST /api/sessions/:sessionId/checkpoints/:screenJsonId/restore`
  - LLM を呼ばず、session の `activeScreenJsonId` を指定 ScreenJSON に戻す
- `GET /api/screen-jsons/:screenJsonId`
  - ScreenJSON を取得する。通常レスポンスは minified JSON を基準にする。

既存:

- `POST /api/screens/generate`
  - 新規 session と version 1 の ScreenJSON を作成する
- `POST /api/sessions/:sessionId/actions/:actionId/generate`
  - active ScreenJSON から action 結果の新 ScreenJSON version を作成する
- `POST /api/sessions/:sessionId/regenerate`
  - active ScreenJSON を同条件で再生成し、新しい ScreenJSON version を作成する

route 名は既存互換のため `POST /api/screens/generate` だけ残してもよいが、service / DB の実体は `Session` と `ScreenJSON` に寄せる。新規 API は `sessions` / `screen-jsons` の語彙に寄せる。

Frontend route:

- 新規作成: `/prompt`
- Session workspace: `/prompt/session/$sessionId`
- 既存 `/prompt/$screenId` は移行期間だけ互換 route とし、対応する Session が分かる場合は `/prompt/session/$sessionId` へ redirect する。

MCP:

- ScreenJSON 閲覧用 tool を用意する。
- 例: `get_screen_json({ screenJsonId })`
- 返却はユーザーが読む用途でない限り minified JSON text とする。
- 目的はデバッグと外部エージェントからの正確な ScreenJSON 確認であり、Session に JSON 本体を複製しない。
- 現状この repo には MCP surface がないため、実装時は最小の MCP endpoint / tool 定義を新設する。

## Frontend 設計

### Repository / Hooks

`src/modules/screen-history/repositories/screen-history.repository.ts`

追加:

- `conversation(sessionId)`
- `edit(sessionId, input)`
- `restoreCheckpoint(sessionId, screenJsonId)`
- `getScreenJson(screenJsonId)`

`src/modules/screen-history/hooks/screen-history.hooks.ts`

追加:

- `useScreenConversation(sessionId, enabled)`
- `useEditSessionScreen(sessionId)`
- `useRestoreScreenJsonCheckpoint(sessionId)`
- `useScreenJson(screenJsonId, enabled)`

query key:

```ts
conversation: (sessionId: string) => ['screen-history', sessionId, 'conversation']
screenJson: (screenJsonId: string) => ['screen-json', screenJsonId]
```

mutation success:

- list invalidate
- active session invalidate
- new ScreenJSON detail set
- new conversation set or invalidate
- navigate to the session workspace
- optimistic assistant message を server response 後に checkpoint metadata 付き message へ置き換える

### PromptWorkspace

`src/modules/screen-history/components/PromptWorkspace.tsx`

変更:

- `sessionId` がある場合は `useScreenConversation(sessionId)` を読む。
- `messages` は local state を主にしない。server conversation を source of truth にする。
- mutation 中だけ optimistic message を足す。
- submit の意味を分岐する。
  - active ScreenJSON なし: `generate`
  - active ScreenJSON あり: `edit`
- action click は今まで通り次の ScreenJSON version を生成する。ただし成功後に conversation も更新する。
- ChatDock input の placeholder を active ScreenJSON の有無に応じて変える。
  - 新規: `作りたい画面を入力`
  - 既存: `この画面の修正内容を入力`
- 生成完了後の assistant message には checkpoint button を表示する。
- checkpoint button を押すと `metadata.checkpointScreenJsonId` を読み込み、Session の active ScreenJSON として表示する。
- checkpoint restore は LLM を呼ばない。保存済み ScreenJSON を読み込んで json-render 表示するだけにする。

### ChatDock

追加表示:

- Session title
- 現在の時点
- session 内の checkpoint list
- 生成済み assistant message ごとの checkpoint button
- active ScreenJSON の場合は「現在」表示

UI 方針:

- 過去 checkpoint へ戻るだけでは future checkpoint / message は削除しない。
- 「このバージョンへ戻る」は ScreenJSON の読み込みと current pointer 更新だけにする。
- 戻った時点で ChatDock から編集を送信すると、その checkpoint より後の履歴は削除してよい。
- branch 表示は今回扱わない。
- checkpoint button は ChatDock 内の assistant bubble 末尾に小さく表示する。
- active checkpoint の button は disabled にして `現在のバージョン` と表示する。押せる実装にする場合でも同じ ScreenJSON を再表示するだけにする。

### History Page

`/history` は Session 一覧そのものとして扱う。Session 一覧を `/history` とは別の UI / route として作らない。

MVP では既存 `/history` route を維持しつつ、表示単位を screen から Session に寄せる。ただし大きな一覧 UI 改修は Phase 1-3 の後でもよい。

- `sessionTitle` で grouping
- 同一 session 内では active version と checkpoint が分かる表示に寄せる
- item に trigger と version の情報を明示

最終形の `/history`:

- Session 一覧
- Session detail
- Session 内の checkpoint timeline
- active ScreenJSON preview へのリンク

## チェックポイントに戻る仕様

推奨仕様:

- チェックポイントに戻る = その ScreenJSON を読み込み、Session の `activeScreenJsonId` にセットする。
- LLM は呼ばない。
- 戻るだけでは、その checkpoint より後の ScreenJSON / messages は削除しない。
- その時点から編集すると、新しい ScreenJSON version を作る。
- 戻った checkpoint から編集した場合だけ、後続の ScreenJSON / messages は消えて構わない。
- branch 機能は今回は扱わない。

理由:

- 実装と UI が単純になる。
- ユーザーは ChatDock 内の checkpoint button で「このバージョンへ戻る」だけを理解すればよい。
- Session に JSON 本体を持たせず、常に ScreenJSON id を参照する構造にできる。
- ChatDock 上ではユーザーに branch という概念を強制せず、「このバージョンへ戻る」だけで操作できる。

## 実装フェーズ

### Phase 1: Schema / DB / Backend message persistence

対象:

- `api/db/schema.ts`
- Drizzle migration
- `shared/schemas/screen-history.schema.ts`
- `api/modules/screen-history/screen-history.repository.ts`
- `api/modules/screen-history/screen-history.service.ts`
- `api/modules/screen-history/screen-history.routes.ts`
- MCP tool 定義

実装:

- `screen_jsons` table 追加
- `prompt_sessions.activeScreenJsonId` 追加
- `prompt_session_messages` table 追加
- 既存 `generated_screens` から `screen_jsons` への backfill migration 追加
- `chat-edit` trigger 追加
- conversation / edit schemas 追加
- conversation / edit service 追加
- generate / action / regenerate 成功時に message 保存
- checkpoint restore service 追加
- ScreenJSON 取得 API 追加
- 既存履歴向け fallback message 実装

テスト:

- `tests/modules.screen-history.service.test.ts`
  - generate が version 1 の ScreenJSON を保存し、session の active id を更新する
  - migration が既存 `generated_screens` を session ごとの ScreenJSON version に変換する
  - migration が session の active id を最大 version の ScreenJSON に設定する
  - generate が messages を保存する
  - generate が checkpoint metadata 付き assistant message を保存する
  - edit が same session に次 version の ScreenJSON を作る
  - edit result は session に JSON 本体を持たず、ScreenJSON table に保存される
  - edit が checkpoint metadata 付き assistant message を保存する
  - edit prompt に catalog constraints / minified active ScreenJSON schema payload / latest user instruction が入る
  - edit prompt に過去の会話全文が入らない
  - edit prompt は 24k token budget を超えた場合に明示エラーになる
  - edit prompt の active ScreenJSON schema payload は pretty print されない
  - checkpoint restore は LLM を呼ばず activeScreenJsonId だけを戻す
  - checkpoint restore だけでは、戻した version より後の ScreenJSON / messages が削除されない
  - checkpoint restore 後の edit では、戻した version より後の ScreenJSON / messages が削除される
  - conversation が session 全体の messages / checkpoint list と activeVersion を返す
- `tests/routes.screen-history.test.ts`
  - `GET /conversation`
  - `POST /edit`
  - `POST /checkpoints/:screenJsonId/restore`
  - `GET /api/screen-jsons/:screenJsonId`

### Phase 2: Frontend ChatDock integration

対象:

- `src/modules/screen-history/repositories/screen-history.repository.ts`
- `src/modules/screen-history/hooks/screen-history.hooks.ts`
- `src/modules/screen-history/components/PromptWorkspace.tsx`

実装:

- conversation API client / hook 追加
- edit mutation 追加
- active ScreenJSON ありの submit を edit に変更
- server messages を ChatDock に表示
- optimistic user message と pending activity を維持
- edit 成功後に session workspace を再表示し、active ScreenJSON を新 version に更新
- checkpoint metadata を持つ assistant message に checkpoint button を表示
- checkpoint button click で restore API を呼び、該当 ScreenJSON を表示

テスト:

- `tests/e2e/history.spec.ts`
  - session workspace で ChatDock に保存会話が出る
  - ChatDock から修正を送ると `POST /api/sessions/:sessionId/edit`
  - 成功後に新 ScreenJSON version が表示される
  - 生成済み assistant message に checkpoint button が出る
  - checkpoint button を押すと、その message の ScreenJSON が LLM なしで表示される
  - 互換 route `/prompt/$screenId` は session workspace に redirect する

### Phase 3: Checkpoint navigation UI

対象:

- `PromptWorkspace.tsx`
- 必要なら `ScreenHistoryList.tsx`

実装:

- ChatDock header/body に session checkpoint list を表示
- list の各 ScreenJSON を checkpoint として表示
- assistant message の checkpoint button を実装する
- active ScreenJSON を強調

テスト:

- session の checkpoint が表示される
- checkpoint button を押すと該当 ScreenJSON が表示される
- 移動後の ChatDock 会話がその時点までに切り替わる

### Phase 4: History page session grouping

対象:

- `src/routes/history.tsx`
- `ScreenHistoryList.tsx`

実装:

- `sessionTitle` ごとに Session を group
- session の active version / checkpoint list を見やすくする
- 検索は session title, ScreenJSON page, prompt, inferred intent, message content に拡張

これは UX 改善なので、Phase 1-3 の後でよい。

## 品質ゲート

必須:

- `pnpm verify`
- `pnpm test run tests/modules.screen-history.service.test.ts tests/routes.screen-history.test.ts`
- `pnpm test:e2e:regression --grep history` または既存 e2e の history smoke

確認観点:

- checkpoint restore は LLM を呼ばず、保存済み ScreenJSON を読み込んで表示するだけにする。
- edit は現在表示中の ScreenJSON を元に、構造変更済みの新しい ScreenJSON version を作る。
- edit の LLM 入力は catalog constraints / minified active ScreenJSON schema payload / latest user instruction に限定される。
- edit の LLM 入力は最大 24k tokens まで許容し、それを超える場合は明示エラーになる。
- ユーザーが JSON を読む表示以外では、schema JSON は常に minified で扱う。
- edit 結果の JSON 本体は session には保存せず、ScreenJSON table に保存する。Session は active ScreenJSON id だけを持つ。
- checkpoint に戻るだけでは、その checkpoint より後の ScreenJSON / messages は残る。
- checkpoint に戻った後に edit すると、その checkpoint より後の ScreenJSON / messages は消えてよい。
- ChatDock の会話は reload 後も復元される。
- 生成済み assistant message には checkpoint button が表示される。
- active checkpoint の button は disabled または同じ ScreenJSON の再表示だけになる。
- MCP tool から ScreenJSON を閲覧できる。

## リスクと対策

| リスク | 対策 |
| --- | --- |
| 会話を全部 prompt に入れるとすぐ破綻する | edit prompt には会話全文を入れず、catalog constraints / minified active ScreenJSON schema payload / latest user instruction のみに限定する |
| active ScreenJSON だけでも 24k tokens を超える | active ScreenJSON schema payload は常に minify し、それでも超える場合は明示エラーにする |
| 既存履歴に message がない | conversation API で `screenJson.prompt` から fallback message を作る |
| checkpoint restore だけで future 履歴が消える | restore では削除しない。削除は restore 後に edit した時だけに限定する |
| edit が新規生成と同じ挙動になり画面が崩れる | edit prompt に minified active ScreenJSON schema payload と「必要な変更以外は維持」を明示する |
| checkpoint button が増えて ChatDock が重く見える | assistant message ごとに 1 つだけ小さく表示し、active checkpoint は disabled 表示にする |

## 決定事項

- ChatDock の checkpoint button 文言は `このバージョンへ戻る`。
- ScreenJSON table 名は `screen_jsons`。
- 「過去の会話の時点に戻る」は checkpoint button から該当 ScreenJSON を読み込み、Session の activeScreenJsonId を戻す。
- checkpoint へ戻るだけでは、それ以降の会話や履歴は残す。
- 戻った状態で送信した再編集は新しい ScreenJSON version として保存し、その後にあった履歴は消えてよい。
- ChatDock の通常送信は、active ScreenJSON がある場合は常に「現在画面の再編集」とする。
- 新規 session を始める場合は `/prompt` から開始する。
- `/history` は Session 一覧であり、別の Session 一覧 route は作らない。
- MVP では `/history` の大改修より、ChatDock の会話復元・再編集・checkpoint 復元を優先する。
