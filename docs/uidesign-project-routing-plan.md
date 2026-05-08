# UIDesign Project Routing Plan

## 背景

現在の UIDesign は、生成された各 ScreenJSON を `prompt_sessions` 単位で扱っている。画面 URL も `/prompt/session/:sessionId` が中心で、1 session が 1 つの生成ページ履歴を表す。

一方、EC サイトやチャットアプリのような複数ページ UI では、`/basket`、`/cart`、`/products/1` のようなリンク先が生成される。この path をそのまま開くと、Composia UI の router には対応 route がないため異常リンクになる。

今後は「1 つの生成プロジェクトの中に複数ページがある」構造へ寄せる。

## 現状の問題

### `+ AI生成` が disabled になる

現在の Compose UI は、選択 action が `kind: "generate-screen"` の場合だけ AI生成を有効化している。

しかし実際のボタンやリンクは以下の形になりうる。

- `kind: "navigate"` で `target: "/basket"` を持つ action
- `NavigationPanel.links[].href` や card item `href` から synthetic action 化された link
- provider が明示的な `actions[]` ではなく props 側に href だけを出した link

これらも「ボタンの意味に沿ったページ生成」の対象にすべきなので、AI生成の可否は `generate-screen` だけに限定しない。

### `/basket` がアプリ内 URL として成立しない

`/basket` は生成されたアプリ内の概念的な page path であり、Composia UI 自体の route ではない。

そのため、生成後の実 URL は以下のような Composia UIDesign route である必要がある。

```txt
/prompt/project/<projectId>/basket?id=<pageSessionId>
```

初期ページは以下にする。

```txt
/prompt/project/<projectId>/index?id=<pageSessionId>
```

ここで:

- `projectId`: 生成されたサイト / アプリ全体を表す共通 ID
- `pageSessionId`: その page の Prompt session ID
- `index`, `basket`: project 内 page path

## 方針

`prompt_sessions.id` を project ID として再利用しない。`prompt_sessions.id` は「1 ページの編集履歴 / checkpoint timeline」として残す。

新しく project 概念を追加し、URL の path segment には project ID を置く。

```txt
/prompt/project/:projectId/:pagePath?id=:pageSessionId
```

`id` query は、現在表示する page の session を明示するために使う。実装内部では `pageSessionId` と呼ぶ。

## 用語

| 用語 | 意味 |
| --- | --- |
| UIDesign Project | 1 つの生成サイト / アプリ。EC サイト全体、チャットアプリ全体など |
| Page Path | project 内の論理 URL。`index`, `basket`, `products/:id` 相当 |
| Prompt Session | 1 page の ScreenJSON version / chat edit 履歴 |
| ScreenJSON | Prompt Session 内の 1 version |

## DB 設計

### 新規 table: `ui_projects`

```ts
uiProjects = pgTable('ui_projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  title: text('title').notNull(),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  rootSessionId: uuid('root_session_id'),
});
```

index:

- `ui_projects_created_by_idx(created_by)`

### `prompt_sessions` 追加カラム

```ts
projectId: uuid('project_id').references(() => uiProjects.id, { onDelete: 'cascade' }),
pagePath: text('page_path'),
```

index:

- `prompt_sessions_project_idx(project_id)`
- `prompt_sessions_project_page_uidx(project_id, page_path)` where both are not null

`prompt_sessions` は page を表す session として扱う。1 page につき 1 session を基本とし、ScreenJSON versions はその session の中で増える。

## 既存データ migration

既存 `prompt_sessions` は project 情報を持たないため、初期 migration では session ごとに 1 project を作る。

1. 各 existing `prompt_sessions` に対して `ui_projects` を作成する。
2. `ui_projects.title = prompt_sessions.title`
3. `ui_projects.created_by = prompt_sessions.created_by`
4. `ui_projects.root_session_id = prompt_sessions.id`
5. `prompt_sessions.project_id = ui_projects.id`
6. `prompt_sessions.page_path = 'index'`

これにより既存 URL `/prompt/session/:sessionId` は互換 route として残しつつ、新 URL へ誘導できる。

## URL 設計

### 新 canonical route

```txt
/prompt/project/:projectId/:pagePath?id=:pageSessionId
```

例:

```txt
/prompt/project/8d22.../index?id=faead392-21e5-445f-87b7-33b1c5813aac
/prompt/project/8d22.../basket?id=ebc6c63f-6c42-4d0d-a658-ec74ce73d555
```

### 互換 route

既存 route は残す。

```txt
/prompt/session/:sessionId
```

ただし session に `projectId` / `pagePath` がある場合、frontend は canonical route へ replace navigation してよい。

## Link target の扱い

### 生成前

provider が返す `/basket` は「project 内 page path」として扱う。Composia route として直接開かない。

Compose では:

- `/basket` は SelectBox 候補として表示する。
- 未生成の `/basket` に対して `開く` は disabled または warning 表示にする。
- `AI生成` は有効にする。

### 生成後

`AI生成` 成功後、backend は生成先 page session を作り、元 ScreenJSON の action target / props href を canonical route に置き換える。

```txt
/prompt/project/<projectId>/basket?id=<targetSessionId>
```

これにより次回以降は `開く` が成立する。

## `+ AI生成` の有効条件

AI生成は以下で有効にする。

- selected action が存在する。
- selected action が `kind: "submit"` ではない。
- active ScreenJSON / session が存在する。
- mutation pending ではない。

つまり `kind: "navigate"` や synthetic href action でも生成できる。

backend 側も同じく、`generateFromAction` / `generateFromSessionAction` で `navigate` を許可する。

reject するのは初期実装では `submit` のみとする。

## page path 正規化

`/basket` から `basket` を作る。

ルール:

- leading `/` を削除する。
- query/hash は削除する。
- 空なら `index`。
- `/` だけなら `index`。
- 末尾 slash は削除する。
- `//`、`\`、外部 URL は拒否する。
- segment は URL encode せず、router param では wildcard/splat route として受ける。

例:

| input | pagePath |
| --- | --- |
| `/` | `index` |
| `/basket` | `basket` |
| `/cart` | `cart` |
| `/products/detail` | `products/detail` |
| `/prompt/session/xxx` | canonical route として扱い、pagePath へ変換しない |

## Backend 変更計画

### schema / migration

変更対象:

- `api/db/schema.ts`
- `drizzle/migrations/*`

追加:

- `uiProjects`
- `promptSessions.projectId`
- `promptSessions.pagePath`

### repository

変更対象:

- `api/modules/screen-history/screen-history.repository.ts`

追加候補:

- `createProject(input)`
- `findProjectById(userId, projectId)`
- `findProjectPageSession(userId, projectId, pagePath)`
- `findSessionWithProject(userId, sessionId)`
- `updateSessionProjectPage(sessionId, projectId, pagePath)`
- `listProjectSessions(userId, projectId)`

### service

変更対象:

- `api/modules/screen-history/screen-history.service.ts`

変更内容:

1. 初回 `generate`
   - `ui_projects` を作成する。
   - root prompt session に `projectId` と `pagePath = 'index'` を設定する。
   - response に `projectId`, `pagePath`, `canonicalPath` を含める。

2. `generateFromSessionAction`
   - source session の `projectId` を取得する。
   - action target が `/basket` なら `pagePath = 'basket'`。
   - target page session を同じ `projectId` で作成する。
   - target session の `pagePath` を設定する。
   - source ScreenJSON の action target / href を `/prompt/project/<projectId>/<pagePath>?id=<targetSessionId>` に更新する。
   - 生成後 response に canonical path を返す。

3. `generateFromAction`
   - legacy screen 経由の場合も、対応 session の project を解決する。
   - project がなければ互換用 project を作成する。

4. `linkAction`
   - `targetPath` が `/basket` のような project-local path の場合、未生成ページとして扱う。
   - 既存 session への link は canonical project path へ正規化する。

## Shared schema 変更計画

変更対象:

- `shared/schemas/screen-history.schema.ts`
- `shared/schemas/ui-schema.schema.ts`

追加:

- `projectId`
- `pagePath`
- `canonicalPath`

返却型:

```ts
GeneratedScreen {
  id: string;
  sessionId: string;
  projectId?: string;
  pagePath?: string;
  canonicalPath?: string;
  ...
}
```

`canonicalPath` は frontend navigate の SSoT にする。

## Frontend route 変更計画

追加 route:

```txt
src/routes/prompt.project.$projectId.$.tsx
```

TanStack Router の splat route を使い、`pagePath` を受ける。

責務:

- `projectId` path param を読む。
- `id` query を `pageSessionId` として読む。
- `PromptWorkspace` に `projectId`, `pagePath`, `sessionId` を渡す。
- `id` がない場合は `/api/projects/:projectId/pages/:pagePath` で session を解決する。

既存 route:

- `src/routes/prompt.session.$sessionId.tsx`
  - session が project/page を持つ場合は canonical route に replace する。
  - 持たない場合は従来通り表示する。

## PromptWorkspace 変更計画

変更対象:

- `src/modules/screen-history/components/PromptWorkspace.tsx`

変更内容:

- props に `projectId?: string`, `pagePath?: string` を追加する。
- `openSession(sessionId)` を `openPage({ projectId, pagePath, sessionId })` へ置き換える。
- response の `canonicalPath` があれば必ずそれを使って遷移する。
- ComposePanel の AI生成有効条件を `action.kind !== 'submit'` に変更する。
- SelectBox の `/basket` が未生成なら `開く` は disabled にし、`AI生成` を案内する。
- 生成済み canonical path は `開く` で navigate する。

## AI prompt / provider 方針

provider には引き続き `target: "/basket"` のような project-local path を許可する。

ただし system context には以下を追加する。

- app-relative links are project-local paths, not Composia router paths.
- Use short app paths such as `/basket`, `/cart`, `/products`.
- Do not output `/prompt/project/...`; backend will canonicalize generated page links.

## テスト計画

### Backend

`tests/modules.screen-history.service.test.ts`

- initial generate creates project and root page `index`。
- action generate from `/basket` creates target session in same project with `pagePath = 'basket'`。
- generated source ScreenJSON target becomes `/prompt/project/<projectId>/basket?id=<targetSessionId>`。
- `navigate` action can generate a page。
- `submit` action still rejects action page generation。
- existing session without project creates compatibility project when generating child page。

### Routes

`tests/routes.screen-history.test.ts`

- response includes `projectId`, `pagePath`, `canonicalPath`。
- project page resolution endpoint returns target session for `projectId + pagePath`。

### Frontend

`tests/ui-action-collector.test.ts`

- `/basket` link remains collectable as action。
- canonical project route remains collectable and openable。

`tests/ui-schema-renderer.test.tsx`

- selected navigate/href action can trigger Compose。

E2E:

- initial page opens `/prompt/project/:projectId/index?id=:sessionId`。
- `/basket` button click opens Compose, `AI生成` is enabled。
- AI生成後、URL が `/prompt/project/:projectId/basket?id=:newSessionId` になる。
- root page に戻ると `/basket` link が canonical project route に更新されている。

## 実装順序

1. DB schema / migration を追加する。
2. shared schema に project/page/canonical fields を追加する。
3. repository に project/page 解決 API を追加する。
4. initial generate で project + index page を作る。
5. action generate で same project child page を作る。
6. canonical path builder を backend helper として追加する。
7. route と PromptWorkspace navigation を canonical path ベースに変更する。
8. ComposePanel の AI生成 disabled 条件を `submit` 以外に広げる。
9. `/basket` のような未生成 path は `開く` disabled / `AI生成` enabled にする。
10. 互換 route `/prompt/session/:sessionId` を canonical route へ誘導する。
11. テストを追加し、`pnpm verify` を通す。

## 判断ポイント

### `?id=` を使うか `?sessionId=` を使うか

ユーザー向け URL は要望通り `?id=<pageSessionId>` でよい。

内部コードでは `pageSessionId` と呼ぶ。`id` という変数名を内部まで持ち込むと、project id / session id / screen json id と衝突しやすい。

### `project_pages` table を作るか

初期実装では作らない。

`prompt_sessions(project_id, page_path)` で 1 page = 1 session として扱えば足りる。

将来、同じ pagePath に複数 session candidates や publish state が必要になった時点で `project_pages` table を追加する。

## リスク

| リスク | 対応 |
| --- | --- |
| 既存 session URL が壊れる | `/prompt/session/:sessionId` を互換 route として残す |
| `/basket` を直接開いて 404 になる | 未生成 path の `開く` を disabled にし、AI生成へ誘導する |
| projectId / sessionId / screenJsonId が混ざる | DB/型/変数名で `projectId`, `pageSessionId`, `screenJsonId` を明確に分ける |
| 既存 action target が canonical route と local path で混在する | path parser を用意し、canonical route はそのまま、local path は pagePath として扱う |
| URL が長くなる | path は project/page、query は page session と割り切る |

## 完了条件

- `+ AI生成` が navigate / href 由来 action でも有効になる。
- `/basket` のような project-local path を直接 Composia route として開かない。
- 初期ページ URL が `/prompt/project/:projectId/index?id=:sessionId` になる。
- 生成された子ページ URL が `/prompt/project/:projectId/:pagePath?id=:sessionId` になる。
- 同一 project 内で root page と child page が共通 projectId を持つ。
- 生成元 ScreenJSON の link target が canonical project route に更新される。
- 既存 `/prompt/session/:sessionId` は互換表示または canonical route への replace ができる。
- `pnpm verify` が通る。
