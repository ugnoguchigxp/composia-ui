# Composia UI Project Plan

## 1. 目的

Composia UI は、Hono + React + Drizzle + TanStack Router/Query で構成された現在のフルスタック構成を土台に、Vercel Labs の json-render を描画基盤として採用し、以下を段階的に実装する。

```txt
複数データソース
→ 正規化された Entity
→ App UI Schema
→ json-render Spec
→ json-render Catalog / Registry
→ React Renderer
→ AI Layout Planner
→ Prompt Workspace / History Replay / Intent Navigation
```

AI が任意の HTML / React / SQL を生成するのではなく、アプリケーションが許可した catalog component と action だけを使って画面構成を提案する。初期スコープは、Prompt から生成した画面を履歴として保存・再現し、画面内のボタンやリンク操作から次に期待される画面を LLM が判断して生成する SPA 型の動的 UI 生成基盤とする。SEO / SSR / SSG は後回しにする。

`admin` と `showcase` は実装検証用の仮画面として扱い、今後の product surface から外す。管理画面や固定 showcase をユーザー導線として維持せず、生成画面・履歴・再現・次画面生成を主導線にする。

既存の `designSystem/` workspace、Storybook、Pencil 同期は今後の基盤として踏襲しない。一方で、既存の design token / theme 設定は root app 側へ移管し、json-render registry component が CSS variables / Tailwind v4 token を使って描画する。

## 2. 現在のコードベース

現行の実装は、すでに domain 単位のモジュラー構成へ寄っている。計画ではこの構成を壊さず、足りない domain を同じ形で追加する。

```txt
api/
  app.ts
  modules/
    <domain>/
      <domain>.routes.ts
      <domain>.service.ts
      <domain>.repository.ts
  routes/
    auth.ts
    health.ts
    oauth.ts
  services/
    auth.service.ts
    token.service.ts
    user.service.ts
  db/
    schema.ts
    client.ts

src/
  routes/
    history.tsx
    index.tsx
    login.tsx
    oauth.callback.tsx
    prompt.tsx
    prompt.$screenId.tsx
  modules/
    <domain>/
      components/
      hooks/
      repositories/
      services/      optional
  lib/
    api.ts
    auth.tsx

shared/
  schemas/
    auth.schema.ts
    ai.schema.ts
    app-catalog.schema.ts
    cache.schema.ts
    component-registry.schema.ts
    entities.schema.ts
    sources.schema.ts
    screen-history.schema.ts
    ui-schema.schema.ts
    visual-intent.schema.ts
```

`src/routes/admin.tsx` と `src/routes/showcase.tsx` は削除済み。`admin` で確認していた sources / entities / cache / preview は backend domain と service test に残し、ユーザー向け route と navigation からは外す。固定 showcase で確認していた renderer は route ではなく unit test と history replay E2E で担保する。

### 2.1 Backend の現在形

新規 backend domain は、以下の 3 層で実装する。

```txt
api/modules/<domain>/<domain>.routes.ts
  Hono route / request validation / response

api/modules/<domain>/<domain>.service.ts
  use case / business rule / error decision

api/modules/<domain>/<domain>.repository.ts
  Drizzle query / persistence
```

既存の `api/routes/auth.ts` と `api/services/*.ts` は現行資産として維持し、新規の業務 domain は原則 `api/modules/<domain>` に追加する。

### 2.2 Frontend の現在形

新規 frontend domain は、route から domain 実装を切り出して配置する。

```txt
src/routes/<feature>/*.tsx
  route shell / page composition

src/modules/<domain>/hooks/<domain>.hooks.ts
  TanStack Query / mutation / cache invalidation

src/modules/<domain>/repositories/<domain>.repository.ts
  Hono RPC client call

src/modules/<domain>/components/
  domain UI
```

frontend はこの構成を無理に変更しない。`services/` は常に必須ではなく、以下のどれかが発生した domain から追加する。

- API response を画面用 view model に変換する処理が複数箇所で必要になる
- query / mutation 以外の domain rule が増える
- repository を差し替えて unit test したい use case がある
- hooks が肥大化し、React 非依存でテストしたいロジックが出てきた

つまり frontend の標準依存は次のように扱う。

```txt
src/routes/*
  → src/modules/<domain>/hooks
  → src/modules/<domain>/services        optional, when behavior exists
  → src/modules/<domain>/repositories
  → src/lib/api.ts
```

薄い CRUD domain は、最初から `services/` を作らず repository + hooks + components で始めてよい。

## 3. 技術スタック

今後の採用方針と現行実装に合わせる。json-render は導入済みの frontend dependency として扱う。

```txt
Frontend:
  React 19
  Vite
  TypeScript
  TanStack Router
  TanStack Query
  TanStack Table
  Tailwind CSS v4
  @json-render/core
  @json-render/react
  App-local high-level registry components
  CSS variables based design tokens
  data-theme / data-density themes
  Zod
  MSW

Backend:
  Hono
  @hono/zod-openapi
  Hono RPC
  TypeScript
  Drizzle ORM
  PostgreSQL
  postgres.js

Quality:
  Vitest
  Playwright
  Biome
  OpenAPI document at /api/doc and /api/ui
```

## 4. Architecture Rule

### 4.1 Domain を `modules` に集約する

新規 domain は backend / frontend の両方で domain 名を合わせる。

```txt
api/modules/sources
src/modules/sources
shared/schemas/sources.schema.ts

api/modules/entities
src/modules/entities
shared/schemas/entities.schema.ts

api/modules/ui-schema
src/modules/ui-schema
shared/schemas/ui-schema.schema.ts
```

`src/routes` は TanStack Router の file based routing のため残す。route file は page composition のみを担当し、domain logic は `src/modules/<domain>` に置く。
`ui-schema` は現行 MVP では frontend/shared domain として実装済みで、backend API が必要になった時点で `api/modules/ui-schema` を追加する。

### 4.2 依存方向

Backend:

```txt
api/app.ts
  → api/modules/<domain>/<domain>.routes.ts
  → api/modules/<domain>/<domain>.service.ts
  → api/modules/<domain>/<domain>.repository.ts
  → api/db/client.ts / api/db/schema.ts
```

Frontend:

```txt
src/routes/<feature>/*.tsx
  → src/modules/<domain>/hooks
  → src/modules/<domain>/services
  → src/modules/<domain>/repositories
  → src/lib/api.ts
```

Shared:

```txt
shared/schemas/*.schema.ts
  → request schema
  → response schema
  → common type inference
```

守ること:

- route から repository を直接呼ばない
- component から repository を直接呼ばない
- backend service から Hono context を受け取らない
- repository に認可判断や UI 都合を入れない
- frontend repository に React / TanStack Query を入れない
- domain 間の直接 import は最小限にし、共通 contract は `shared/schemas` に寄せる
- 生の `fetch` は `src/lib/api.ts` 以外では使わず、Hono RPC client を経由する

## 5. Domain Module Contract

### 5.1 Backend domain

標準形:

```txt
api/modules/<domain>/
  <domain>.routes.ts
  <domain>.service.ts
  <domain>.repository.ts
```

必要になった場合だけ追加する。

```txt
api/modules/<domain>/
  <domain>.types.ts
  <domain>.metadata.ts
  <domain>.mapper.ts
```

責務:

| Layer | 責務 | 禁止 |
| --- | --- | --- |
| routes | Hono route 定義、`c.req.valid`、status code、cookie/header 操作 | DB query、複雑な business rule |
| service | use case、認可前提の業務判断、validation 後の整合性確認、domain error | Hono context、Drizzle table 直参照 |
| repository | Drizzle query、transaction 境界、永続化 DTO | HTTP status、UI 表示都合 |

テストしやすさが必要な domain は、service を factory にする。

```ts
export type SourceRepository = {
  findFeedById: (id: string) => Promise<Feed | null>;
  listFeeds: () => Promise<Feed[]>;
};

export const createSourceService = (repo: SourceRepository) => ({
  listFeeds: () => repo.listFeeds(),
  getFeed: async (id: string) => {
    const feed = await repo.findFeedById(id);
    if (!feed) throw new NotFoundError("Feed not found");
    return feed;
  },
});
```

route 側は default instance を import するだけにする。

### 5.2 Frontend domain

標準形:

```txt
src/modules/<domain>/
  components/
  hooks/
  repositories/
```

service が必要になった domain は追加する。

```txt
src/modules/<domain>/
  services/
```

責務:

| Layer | 責務 | 禁止 |
| --- | --- | --- |
| routes | URL param、layout composition、auth による表示分岐 | API call、domain data 加工 |
| hooks | TanStack Query、mutation、cache invalidation、route から使う facade | Hono RPC の詳細実装 |
| services | React 非依存の view model 変換、domain rule、repository 合成 | JSX、TanStack Query |
| repositories | Hono RPC client call、response unwrap、transport error 変換 | React state、DOM、画面表示文言 |
| components | props を受け取って描画、フォームの局所 state | API call、router 依存の増殖 |

hooks が薄い場合は `services/` を作らない。新規 domain でも、薄い CRUD だけなら repository + hooks + components で始める。

## 6. Core Concepts

### 6.1 UI Schema

画面構成は JSON で表現し、Zod で検証する。ただし、domain contract を json-render の package 内部仕様に完全固定しない。アプリ側では大雑把な要求から整った UI を生成しやすい高抽象度の `AppUISchema` を持ち、frontend service で json-render の `Spec` に変換する。

```ts
type AppUISchema = {
  page: string;
  intent: string;
  layout:
    | "dashboard"
    | "entity-list"
    | "entity-detail"
    | "form"
    | "article-feed"
    | "screen"
    | "sidebar";
  density?: "compact" | "normal" | "spacious";
  tone?: "neutral" | "primary" | "success" | "warning" | "danger";
  sections: AppUISchemaSection[];
  navigation?: NavigationSchema;
};

type AppUISchemaSection = {
  component: string;
  source: string;
  variant?: string;
  props?: Record<string, unknown>;
  actions?: AppAction[];
};

type AppAction = {
  id: string;
  label: string;
  kind: "generate-screen" | "navigate" | "submit";
  intentHint?: string;
  target?: string;
  carry?: {
    navigation?: boolean;
    visualIntent?: boolean;
    sourceContext?: boolean;
  };
};
```

配置先:

```txt
shared/schemas/ui-schema.schema.ts
src/modules/ui-schema/
api/modules/ui-schema/
```

frontend renderer は `shared/schemas/ui-schema.schema.ts` で parse 済みの値だけを受け取り、`src/modules/ui-schema/services/ui-schema-to-json-render.service.ts` で json-render `Spec` に変換してから描画する。

現行 schema / provider prompt に残っている `layout: "admin"` は Phase 8 で `layout: "screen"` へ寄せる。互換が必要な期間だけ backend validation 側で alias として扱い、保存する `GeneratedScreen.schema` は新しい語彙へ正規化する。

今後はリンクやボタンを単なる `href` だけで表現しない。画面生成に関係する操作は `AppAction` として保存し、クリック時に「現在の画面」「元のプロンプト」「クリックされた component/action」「選択中の entity/source context」を backend に送り、LLM が次の画面意図を判断する。

### 6.2 json-render Catalog / Registry

AI が使える component は json-render catalog に登録したものだけにする。Catalog は AI が生成できる語彙、Registry は実 React component への対応付けとして扱う。

```ts
type ComponentDefinition = {
  name: string;
  description: string;
  allowedSources: string[];
  propsSchema: z.ZodTypeAny;
  variants?: string[];
};
```

配置先:

```txt
src/modules/component-registry/
  components/
    primitives/
    sections/
    pages/
  services/
  repositories/

shared/schemas/component-registry.schema.ts
```

初期 catalog は低レベル UI 部品を大量に渡さず、粗い要求でも整った画面になりやすい高レベル component を中心にする。

```txt
DashboardPage
EntityListPage
EntityDetailPage
EditableFormPage
ArticleFeedPage
SidebarPage
KpiSummarySection
TimelineSection
InsightPanel
ImageSection
SplitHeroSection
CarouselSection
ProcessStepperSection
CardGridSection
FilterBarSection
FormSection
MasterDetailSection
KanbanSection
CalendarSection
ChatPanelSection
EditorPreviewSection
ComparisonSection
ActionFooterSection
DataTableSection
NavigationPanel
EmptyState
ErrorState
```

AI に `Button`、`Card`、`Input`、`Grid` のような低レベル部品を主な語彙として渡さない。低レベル UI は registry component の内部実装に閉じる。`@json-render/shadcn` は試作の参照候補に留め、初期実装では `@json-render/core` と `@json-render/react` を使い、app-local registry component で品質を制御する。

レイアウトの単調化を避けるため、AI layout planner は分析系 prompt 以外で KPI / table へ寄せすぎない。新規生成では汎用サイドメニューを既定パターンにせず、`layout: "sidebar"` と top-level `navigation.items` は legacy renderer 互換用に留める。タブ的な局所ナビゲーションが明示的に必要な場合のみ `NavigationPanel` を使い、階層メニュー、記事アーカイブ、関連ポスト一覧のような用途は専用 content section として扱う。EC / product / venue / portfolio には `SplitHeroSection`、商品・記事・ギャラリー・推薦には `CarouselSection`、オンボーディング・注文・障害対応・サポートには `ProcessStepperSection` を優先候補にする。さらに、検索・絞り込みには `FilterBarSection`、カード一覧には `CardGridSection`、作成・編集・設定には `FormSection`、チケット・メール・CRM には `MasterDetailSection`、タスク・案件管理には `KanbanSection`、予定・予約には `CalendarSection`、会話 UI には `ChatPanelSection`、エディタ系には `EditorPreviewSection`、比較・差分には `ComparisonSection`、確認・次アクションには `ActionFooterSection` を使う。

### 6.3 Normalized Entity

RSS、PostgreSQL、REST API、Markdown を共通形式に寄せる。

```ts
type NormalizedEntity = {
  id: string;
  source: "rss" | "postgres" | "api" | "markdown";
  entityType: string;
  title?: string;
  body?: string;
  summary?: string;
  url?: string;
  author?: string;
  tags?: string[];
  status?: string;
  publishedAt?: string;
  updatedAt?: string;
  raw: unknown;
};
```

配置先:

```txt
shared/schemas/entities.schema.ts
api/modules/entities/
src/modules/entities/
```

### 6.4 Entity Metadata

Drizzle schema から自動抽出できる情報と、UI metadata を組み合わせる。

```ts
type EntityMetadata = {
  name: string;
  label: string;
  source: "postgres" | "rss" | "api" | "markdown";
  mode: "readonly" | "readwrite";
  fields: FieldMetadata[];
  views: {
    list: string[];
    detail: string[];
    form?: string[];
    filter?: string[];
    search?: string[];
  };
};
```

Drizzle schema だけでは label、widget、検索可否、表示順を決められないため、UI metadata を併用する。

```ts
export const threadUiMeta = {
  label: "スレッド",
  fields: {
    title: {
      label: "タイトル",
      ui: "text",
      searchable: true,
      sortable: true,
    },
    content: {
      label: "本文",
      ui: "textarea",
    },
  },
};
```

### 6.5 Design Token / Theme

`designSystem/` workspace は廃止方向だが、既存の design token / theme は root app に移管して維持する。

移管先:

```txt
src/styles/tokens.css
src/styles/themes.css
src/styles/tailwind-theme.css
src/lib/theme-tokens.ts
```

維持するもの:

- `--background`、`--foreground`、`--card`、`--primary`、`--border`、`--ring` などの semantic color token
- `--ui-component-height`、`--ui-component-padding-*`、`--ui-gap-base` などの density token
- `data-theme` による theme 切り替え
- `data-density` による density 切り替え
- Tailwind v4 `@theme` による `bg-background`、`text-foreground`、`border-border`、`h-ui` などの utility 接続

AI は token 名や className を直接生成しない。AI が返せるのは次のような抽象 props までにする。

```ts
type VisualIntent = {
  density?: "compact" | "normal" | "spacious";
  tone?: "neutral" | "primary" | "success" | "warning" | "danger";
  emphasis?: "low" | "medium" | "high";
};
```

Registry component が `VisualIntent` を CSS variable / Tailwind class に変換する。

### 6.6 Prompt History / Screen Replay

Prompt で生成した画面は、再現可能な履歴として保存する。履歴再現は LLM を呼ばず、保存済みの検証済み `AppUISchema` と生成時 context snapshot を使って同じ画面を描画する。

```ts
type PromptSession = {
  id: string;
  title: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

type GeneratedScreen = {
  id: string;
  sessionId: string;
  parentScreenId?: string;
  trigger: "initial-prompt" | "action-click" | "regenerate";
  prompt: string;
  inferredIntent: string;
  action?: {
    id: string;
    label: string;
    component: string;
    intentHint?: string;
  };
  schema: AppUISchema;
  contextSnapshot: {
    sources: unknown[];
    entities: unknown[];
    previousScreen?: AppUISchema;
  };
  providerMeta: {
    provider: "openai" | "azure-openai" | "mock";
    model?: string;
    componentRegistryVersion: string;
  };
  createdAt: string;
};
```

配置先:

```txt
shared/schemas/screen-history.schema.ts
api/modules/screen-history/
  screen-history.routes.ts
  screen-history.service.ts
  screen-history.repository.ts
src/modules/screen-history/
  components/
  hooks/
  repositories/
```

履歴画面の責務:

- 過去に生成した画面を時系列で一覧できる
- prompt、inferred intent、生成元 action、parent screen を確認できる
- 保存済み schema から画面を即時再現できる
- child screen を辿って、EC トップ → 商品詳細 → カートのような生成フローを追える
- 再生成は明示操作にし、通常の再現では LLM を呼ばない

### 6.7 Intent Navigation

画面内のボタンやリンクを押したとき、常に固定 URL へ遷移するのではなく、必要に応じて次画面を生成する。

例:

```txt
初回 prompt:
  ECサイトのトップ画面

クリック:
  花の商品ボタン

backend が LLM に渡す判断材料:
  - 初回 prompt
  - 現在の AppUISchema
  - クリックされた component/action の label と props
  - 商品らしき source/entity context
  - 引き継ぐべき navigation / visual intent / cart summary

LLM が推定する next intent:
  ECサイト 花の商品の詳細画面

生成結果:
  parentScreenId を持つ新しい GeneratedScreen
```

この機能は「UI 生成」と「画面遷移」を同じ安全な App UI Schema / catalog validation に通す。LLM は React component や URL routing を直接生成しない。

## 7. Backend API Plan

新規 API は domain ごとに `api/modules/<domain>` へ追加し、`api/app.ts` の `apiRoutes` に mount する。

### 7.1 Sources API

```txt
GET    /api/sources
GET    /api/sources/:sourceId
GET    /api/sources/:sourceId/items
POST   /api/sources/rss
POST   /api/sources/:sourceId/refresh
DELETE /api/sources/:sourceId
```

Layer:

```txt
api/modules/sources/sources.routes.ts
api/modules/sources/sources.service.ts
api/modules/sources/sources.repository.ts
shared/schemas/sources.schema.ts
```

Repository は DB 永続化を担当する。RSS の fetch / parse は repository ではなく service 配下の adapter として扱う。

```txt
api/modules/sources/adapters/rss.adapter.ts
api/modules/sources/adapters/postgres.adapter.ts
```

### 7.2 Entities API

```txt
GET    /api/entities
GET    /api/entities/:entity
GET    /api/entities/:entity/:id
POST   /api/entities/:entity
PUT    /api/entities/:entity/:id
DELETE /api/entities/:entity/:id
```

`mode: readonly` の entity は write route で拒否する。認可や readonly 判定は service が行い、repository は単純な永続化に限定する。

### 7.3 Metadata API

```txt
GET  /api/metadata/entities
GET  /api/metadata/entities/:entity
POST /api/metadata/entities/:entity/refresh
```

Metadata generation は初期は手動 UI metadata + Drizzle table mapping で始める。`refresh` は現行の手動 metadata registry を再取得する軽い endpoint とし、完全自動生成は後続でよい。

### 7.4 UI Schema API

現行 MVP では frontend の `src/modules/ui-schema` に加えて、backend の `api/modules/ui-schema` でも同じ App UI Schema を検証できる。

```txt
GET  /api/ui-schema/pages/:pageId
POST /api/ui-schema/validate
POST /api/ui-schema/preview
```

AI を使わない固定 schema と、AI Layout Planner が返した schema の両方を同じ validation path に通す。

### 7.5 AI API

現行実装済み API:

```txt
POST /api/ai/layout
POST /api/ai/summarize
POST /api/ai/classify
POST /api/ai/navigation
```

AI API は backend に閉じる。frontend から OpenAI / local LLM を直接呼ばない。

### 7.6 Cache API

```txt
GET    /api/cache/status
POST   /api/cache/set
POST   /api/cache/invalidate
POST   /api/cache/rebuild
GET    /api/cache/:namespace/:key
DELETE /api/cache/:namespace/:key
```

AI layout など内部用途の cache key は service が生成する。汎用 cache API は namespace + key を受け取り、repository は key-value の保存と取得に限定する。

### 7.7 Screen History API

Prompt 生成、履歴再現、action click からの次画面生成は `screen-history` domain に集約する。

```txt
GET    /api/screens
GET    /api/screens/:screenId
GET    /api/screens/:screenId/children
POST   /api/screens/generate
POST   /api/screens/:screenId/actions/:actionId/generate
POST   /api/screens/:screenId/regenerate
DELETE /api/screens/:screenId
```

Layer:

```txt
api/modules/screen-history/screen-history.routes.ts
api/modules/screen-history/screen-history.service.ts
api/modules/screen-history/screen-history.repository.ts
shared/schemas/screen-history.schema.ts
```

責務:

- `generate` は初回 prompt から screen を作成して保存する
- `actions/:actionId/generate` は parent screen と action context から次 screen を作成して保存する
- `GET /api/screens/:screenId` は保存済み schema を返し、LLM を呼ばない
- `regenerate` は同じ prompt/context で明示的に再生成する
- repository は prompt、schema、context snapshot、parent-child 関係を PostgreSQL に保存する

## 8. Frontend Plan

### 8.1 Route は薄く保つ

TanStack Router の route file は次だけを担当する。

- URL params / search params を読む
- auth 状態による大枠の表示分岐をする
- module hooks を呼ぶ
- page layout を組む

例:

```txt
src/routes/prompt.$screenId.tsx
  → src/modules/screen-history/hooks/screen-history.hooks.ts
  → src/modules/ui-schema/components/JsonRenderRenderer.tsx
```

### 8.2 Repository は transport 層に閉じる

```txt
src/modules/<domain>/repositories/<domain>.repository.ts
```

Repository は `client` を使う。

```ts
import { client } from "../../../lib/api";
```

Repository の戻り値は `shared/schemas` 由来の型に揃える。HTTP status、RPC path、response unwrap は repository に閉じ込める。

### 8.3 Service は必要になったときに追加する

```txt
src/modules/entities/services/entities.service.ts
src/modules/ui-schema/services/ui-schema.service.ts
src/modules/component-registry/services/component-registry.service.ts
```

Service に置くもの:

- view model 変換
- UI Schema と Component Registry の照合
- props schema validation
- source binding validation
- 複数 repository の合成
- React 非依存で unit test したい判断
- App UI Schema から json-render Spec への変換
- visual intent から token class への変換

Service に置かないもの:

- JSX
- `useQuery`
- router navigation
- DOM event handling

### 8.4 Hooks は TanStack Query 境界

Hooks に置くもの:

- queryKey
- queryFn の指定
- mutation
- invalidateQueries
- optimistic update
- route / component に渡す loading/error state の整形

Hooks が長くなったら service に分ける。

### 8.5 Component は domain UI

`src/modules/<domain>/components` は domain 専用 UI を置く。json-render から使う汎用画面部品は `src/modules/component-registry/components` に置き、domain 固有 UI と分ける。

`designSystem/` workspace へ移す運用は廃止する。再利用したい UI は、まず app-local の registry component として整える。

## 9. Security Model

AI 出力は常に不信頼入力として扱う。

```txt
AI Output
→ JSON parse
→ Zod validation
→ json-render Catalog allowlist
→ propsSchema validation
→ source access validation
→ readonly / readwrite mode check
→ App UI Schema to json-render Spec conversion
→ json-render Renderer
```

禁止:

- 任意 HTML 生成
- 任意 JavaScript 生成
- React component 生成
- DB schema の自動変更
- 認可判断の AI 委譲
- 未検証 JSON の描画
- frontend から AI provider を直接呼ぶこと

既存の Cookie auth、CSRF、CSP、rate limiter は維持する。AI / screen-history / entity write API は既存 middleware と同じ error handling に通す。

## 10. Cache Model

Cache は AI cost と latency を抑えるために backend domain として扱う。

対象:

```txt
Raw RSS Cache
Normalized Entity Cache
Summary Cache
Classification Cache
Entity Metadata Cache
Layout Decision Cache
Navigation Decision Cache
```

Layout Decision Cache key:

```txt
userIntent
+ contentHash
+ sourceVersion
+ componentRegistryVersion
+ designTokenVersion
+ timeWindow
```

初期実装は PostgreSQL table でよい。SQLite / file cache は必要になるまで入れない。

## 11. Phased Implementation Plan

### 11.0 Current Progress

2026-05-07 時点の実装状況:

| Phase | Status | Notes |
| --- | --- | --- |
| Phase 0: Architecture Baseline | Done | BBS sample は削除済み。`designSystem/` workspace / Storybook / Pencil は今後の基盤から外し、root app 側に名称・設定・依存を寄せた。 |
| Phase 1: Shared Schema Foundation | Done for MVP | `ui-schema`、`component-registry`、`entities`、`sources`、`cache`、`visual-intent`、`ai` schema を追加済み。Sources / Entities / Cache の backend/frontend contract で利用中。 |
| Phase 2: json-render Catalog + Renderer | Done | `@json-render/core` / `@json-render/react`、catalog / registry、App UI Schema 変換、root token/theme 移管、`SidebarPage` / `SplitHeroSection` / `CarouselSection` / `ProcessStepperSection` / `CardGridSection` / `FilterBarSection` / `FormSection` / `MasterDetailSection` / `KanbanSection` / `CalendarSection` / `ChatPanelSection` / `EditorPreviewSection` / `ComparisonSection` / `ActionFooterSection` / `ImageSection` を実装済み。fixed showcase route は削除済み。 |
| Phase 3: Sources Domain | Done for MVP | RSS / API / Markdown / PostgreSQL adapters、source 登録、refresh、NormalizedEntity upsert、source item preview、service / route tests を実装済み。 |
| Phase 4: Entity Metadata + Internal Data Surface | Done for MVP | EntityMetadata、readonly enforcement、generic list/detail/form surface、metadata refresh API、service / route tests を実装済み。ユーザー向け admin route は削除対象。 |
| Phase 5: Cache Domain | Done for MVP | `cache_entries` table、`api/modules/cache`、`src/modules/cache`、status/invalidate/rebuild/get/set/delete、AI layout cache、route tests を実装済み。cache UI は Prompt/History から必要な範囲だけ見せる。 |
| Phase 6: AI Layout Planner | Done for MVP | `layout` / `summarize` / `classify` / `navigation` API、OpenAI / Azure provider、backend validation、frontend Chatdock、layout decision cache、source context integration、service / route tests を実装済み。 |
| Phase 7: Integration | Superseded | `/admin` route と fixed showcase は検証用として扱い、product surface から削除済み。以後は Prompt / History / Generated Screen を主導線にする。 |
| Phase 8: Surface Cleanup | Done | `/admin` と `/showcase` route、nav link、関連 E2E を削除し、backend domain と service tests に責務を戻した。 |
| Phase 9: Prompt History | Done for MVP | prompt 生成結果を PostgreSQL に保存し、`/history` と `/prompt/$screenId` で保存済み schema を再現する。 |
| Phase 10: Intent Navigation | Done for MVP | 画面内 action click から LLM が次画面 intent を判断し、parent-child 関係を持つ新しい generated screen を保存する。 |

新しい product 方針に対して、次に実装する項目:

| Area | 実装項目 | 扱い |
| --- | --- | --- |
| Surface | `/admin` と `/showcase` の削除 | Done |
| History | `prompt_sessions` / `generated_screens` table | Done |
| History | `/history` route | Done |
| Replay | `/prompt/$screenId` route | Done |
| Intent Navigation | `AppAction` schema | Done |
| Intent Navigation | action click generate API | Done |
| Prompt | prompt submission を screen-history 経由に変更 | Done |

### Phase 0: Architecture Baseline

目的:

- 既存構造を正とし、domain 追加時の型と依存方向を固定する

作業:

- `docs/project_plan.md` を現行構造に合わせる
- サンプル BBS は削除済み前提にし、今後の domain だけを `api/modules/<domain>` / `src/modules/<domain>` に追加する
- `designSystem/`、Storybook、Pencil は今後の基盤から外す
- design token / theme CSS を root app に移管する方針を固定する
- 新規 domain の skeleton rule を README または AGENT.md に必要最小限だけ反映する

検証:

```txt
pnpm typecheck
pnpm lint
```

### Phase 1: Shared Schema Foundation

目的:

- AI / renderer / entity 管理の contract を `shared/schemas` に置く
- json-render package の 0.x 変更に備え、domain contract と json-render Spec の境界を分ける

追加候補:

```txt
shared/schemas/ui-schema.schema.ts
shared/schemas/component-registry.schema.ts
shared/schemas/entities.schema.ts
shared/schemas/sources.schema.ts
shared/schemas/cache.schema.ts
shared/schemas/visual-intent.schema.ts
```

実装内容:

- AppUISchema / AppUISchemaSection
- ComponentDefinition
- NormalizedEntity
- EntityMetadata
- SourceDefinition
- CacheEntry
- VisualIntent

テスト:

```txt
tests/schemas.ui-schema.test.ts
tests/schemas.component-registry.test.ts
tests/schemas.entities.test.ts
```

完了条件:

- 不正 component name、未知 layout、invalid props を Zod で拒否できる
- backend / frontend の両方から型 import できる

### Phase 2: json-render Catalog + Renderer

目的:

- AI なしで App UI Schema を json-render 経由で描画できる frontend 基盤を作る

追加候補:

```txt
src/modules/component-registry/
  components/
    primitives/
    sections/
    pages/
  services/catalog.service.ts
  services/registry.service.ts
  repositories/component-registry.repository.ts

src/modules/ui-schema/
  components/JsonRenderRenderer.tsx
  services/ui-schema-to-json-render.service.ts
  hooks/useUiSchemaPreview.ts

src/styles/
  tokens.css
  themes.css
  tailwind-theme.css
```

実装内容:

- `@json-render/core` / `@json-render/react` 導入
- json-render catalog definition
- json-render registry definition
- component allowlist
- props validation
- source binding validation
- App UI Schema to json-render Spec conversion
- token/theme CSS の root app 移管
- high-level page/section component
- fallback error state
- fixed sample schema rendering

テスト:

```txt
tests/ui-schema-renderer.test.tsx
tests/component-registry.service.test.ts
```

完了条件:

- 固定 JSON の App UI Schema から、登録済み catalog component だけを描画できる
- 未登録 component を拒否できる
- component props が schema と合わない場合に描画前に止まる
- `designSystem/src/styles` に依存せず、root app の token/theme だけで見た目が成立する

### Phase 3: Sources Domain

目的:

- RSS / PostgreSQL / API / Markdown を `NormalizedEntity` に変換する入口を作る

追加候補:

```txt
api/modules/sources/
  sources.routes.ts
  sources.service.ts
  sources.repository.ts
  adapters/rss.adapter.ts
  adapters/api.adapter.ts
  adapters/markdown.adapter.ts
  adapters/postgres.adapter.ts

src/modules/sources/
  components/
  hooks/
  repositories/
  services/
```

実装内容:

- source 登録
- RSS / API / Markdown / PostgreSQL item fetch
- normalized entity 変換
- refresh endpoint
- source list UI
- source item preview

テスト:

```txt
tests/modules.sources.service.test.ts
tests/routes.sources.test.ts
tests/e2e/history.spec.ts
```

完了条件:

- RSS / API / Markdown / PostgreSQL source を登録できる
- refresh で item を取得し、NormalizedEntity として返せる
- frontend は repository から Hono RPC 経由で source list を取得できる

### Phase 4: Entity Metadata + Internal Data Surface

目的:

- PostgreSQL entity と readonly source entity を Prompt / History / Intent Navigation の source context として扱う

追加候補:

```txt
api/modules/entities/
  entities.routes.ts
  entities.service.ts
  entities.repository.ts
  entity-metadata.ts

src/modules/entities/
  components/EntityTable.tsx
  components/EntityDetail.tsx
  components/EntityForm.tsx
  hooks/
  repositories/
  services/
```

実装内容:

- EntityMetadata list/detail
- readonly / readwrite enforcement
- generic list/detail/form
- metadata refresh API

テスト:

```txt
tests/modules.entities.service.test.ts
tests/routes.entities.test.ts
tests/e2e/history.spec.ts
```

完了条件:

- 対象 Drizzle table を EntityMetadata として表示できる
- readonly entity は write route を拒否する
- frontend route は service/repository に依存し、DB 構造を知らない
- Prompt / History の生成 context として entity metadata を渡せる

### Phase 5: Cache Domain

目的:

- AI と source refresh の結果を再利用する

追加候補:

```txt
api/modules/cache/
  cache.routes.ts
  cache.service.ts
  cache.repository.ts

src/modules/cache/
  components/
  hooks/
  repositories/
```

実装内容:

- cache entry table
- get/set/delete/invalidate
- namespace + key strategy
- Prompt / History から必要に応じて参照する cache status

テスト:

```txt
tests/modules.cache.service.test.ts
tests/routes.cache.test.ts
```

完了条件:

- 同一 key の Layout Decision を再利用できる
- invalidate 後に再計算できる

### Phase 6: AI Layout Planner

目的:

- user intent、source summary、registry、metadata から UI Schema を生成する

追加候補:

```txt
api/modules/ai/
  ai.routes.ts
  ai.service.ts
  ai.repository.ts
  providers/openai.provider.ts
  providers/local-llm.provider.ts

src/modules/ai/
  hooks/
  repositories/
```

実装内容:

- provider abstraction
- prompt input builder
- output parser
- Zod validation
- cache lookup before provider call
- cache save after valid output
- source context integration
- summarize / classify / navigation

テスト:

```txt
tests/modules.ai.service.test.ts
tests/routes.ai.test.ts
```

完了条件:

- mocked provider で deterministic な UI Schema を返せる
- invalid AI JSON を拒否できる
- cache hit 時は provider を呼ばない
- source context を provider input に渡せる

### Phase 7: Integration

目的:

- Source → Entity → UI Schema → Renderer → Prompt / History / Intent Navigation を通す

実装内容:

- `/admin` と `/showcase` は検証用画面として廃止対象にする
- Prompt で生成した screen を履歴として保存する
- 保存済み screen を再現できる route を作る
- 画面内 action click から次 screen を生成する

テスト:

```txt
pnpm typecheck
pnpm lint
pnpm test run
pnpm test:e2e:smoke
```

完了条件:

- 保存済み screen を UI Schema 経由で再現できる
- parent-child screen を辿れる
- AI layout は allowlist component だけを使う

### Phase 8: Surface Cleanup

目的:

- product surface を Prompt / History / Generated Screen に絞る

作業:

- `src/routes/admin.tsx` を削除する
- `src/routes/showcase.tsx` を削除する
- `src/routeTree.gen.ts` から `/admin` と `/showcase` を外す
- root navigation から Admin / Showcase link を削除する
- admin/showcase E2E を削除または history replay E2E に置き換える
- admin でしか見られなかった renderer / source preview の確認を unit / route / history E2E に移す

完了条件:

- ユーザー向け route は `/`, `/prompt`, `/prompt/$screenId`, `/history`, `/login`, `/oauth/callback` に絞られている
- `pnpm verify` と history replay E2E が通る

### Phase 9: Prompt History

目的:

- Prompt で作った画面を保存し、あとから LLM なしで再現できるようにする

追加候補:

```txt
api/modules/screen-history/
  screen-history.routes.ts
  screen-history.service.ts
  screen-history.repository.ts

src/modules/screen-history/
  components/ScreenHistoryList.tsx
  components/ScreenReplayPanel.tsx
  hooks/screen-history.hooks.ts
  repositories/screen-history.repository.ts

src/routes/history.tsx
src/routes/prompt.$screenId.tsx
shared/schemas/screen-history.schema.ts
```

DB:

```txt
prompt_sessions
generated_screens
```

実装内容:

- 初回 prompt 生成時に `GeneratedScreen` を保存する
- 履歴一覧で title / prompt / inferred intent / createdAt を表示する
- 履歴詳細で保存済み schema を再描画する
- parentScreenId / trigger / action を保存する
- 通常 replay は LLM を呼ばない
- 明示的な regenerate だけ LLM を呼び直す

テスト:

```txt
tests/modules.screen-history.service.test.ts
tests/routes.screen-history.test.ts
tests/e2e/history.spec.ts
```

完了条件:

- Prompt で生成した screen が DB に保存される
- `/history` から過去 screen を選べる
- `/prompt/$screenId` で保存済み画面を再現できる

### Phase 10: Intent Navigation

目的:

- 生成画面内の操作から、LLM が期待される次画面を判断して作れるようにする

実装内容:

- `AppAction` を shared schema に追加する
- registry component の button/link は `AppAction` を発火できるようにする
- `POST /api/screens/:screenId/actions/:actionId/generate` を追加する
- action click 時に current screen、action、component props、source/entity context、visual intent を LLM provider に渡す
- LLM は next intent と App UI Schema を返す
- 返却 schema は既存の Zod + catalog validation に通す
- 生成した child screen は parentScreenId 付きで保存する
- navigation / header / cart summary / selected entity など、継続すべき要素を carry policy で引き継ぐ

テスト:

```txt
tests/modules.intent-navigation.service.test.ts
tests/routes.screen-actions.test.ts
tests/e2e/intent-navigation.spec.ts
```

完了条件:

- EC トップ画面 prompt から生成した画面で「花の商品」action を押すと、LLM が「ECサイト 花の商品詳細画面」と解釈して child screen を生成できる
- child screen は履歴に残り、parent screen へ戻れる
- action が不正 href / 未登録 component / catalog 外 props を生成しても描画前に拒否できる

## 12. Testing Strategy

### 12.1 Shared schema

対象:

- `shared/schemas/*.schema.ts`

観点:

- valid input を parse できる
- invalid input を拒否できる
- transform / sanitize がある schema は出力値を検証する

### 12.2 Backend service

対象:

- `api/modules/<domain>/<domain>.service.ts`

観点:

- repository を fake に差し替えて business rule を確認する
- not found / readonly / invalid state の error を確認する
- Hono context なしで実行できることを確認する

### 12.3 Backend routes

対象:

- `api/modules/<domain>/<domain>.routes.ts`

観点:

- `app.request` で status と payload を確認する
- validation error が既存 error handler の形式になる
- protected route は auth middleware を通る

### 12.4 Frontend service

対象:

- `src/modules/<domain>/services/*.ts`

観点:

- view model 変換
- UI Schema validation
- registry matching
- repository fake を使った branch test

### 12.5 Frontend hooks / components

対象:

- `src/modules/<domain>/hooks`
- `src/modules/<domain>/components`

観点:

- hooks は query/mutation の状態変換を確認する
- components は user-visible behavior を確認する
- snapshot test に頼らない

### 12.6 E2E

対象:

- `tests/e2e/*.spec.ts`

観点:

- route navigation
- API mock による主要導線
- auth required / anonymous state
- prompt generate / history replay / intent navigation smoke

## 13. Token / Theme Rule

`designSystem/` workspace、Storybook、Pencil 同期は踏襲しない。UI 生成の基盤は json-render catalog / registry に寄せる。

ただし、既存の design token / theme 設定は採用し、root app の CSS と TypeScript helper に移す。

```txt
designSystem/src/styles/variables.css → src/styles/tokens.css
designSystem/src/styles/themes.css    → src/styles/themes.css
designSystem/src/styles/index.css     → src/styles/tailwind-theme.css
designSystem/src/lib/design-tokens.ts → src/lib/theme-tokens.ts
```

AI が返せるのは抽象的な intent までにする。

```json
{
  "density": "compact",
  "emphasis": "high",
  "tone": "neutral"
}
```

json-render registry component が intent を実際の class、variant、CSS variable に変換する。

禁止:

- AI に Tailwind class を直接生成させる
- AI に CSS variable 名を直接選ばせる
- AI に arbitrary style object を生成させる
- `designSystem/` workspace を新規 UI の置き場にする

## 14. Initial Domain Priority

優先順位:

1. `theme-tokens`
2. `ui-schema`
3. `component-registry`
4. `entities`
5. `sources`
6. `cache`
7. `ai`
8. `screen-history`
9. `intent-navigation`

サンプル BBS は維持しない。新規 domain はこの計画の module contract に従って追加する。

## 15. Out of Scope

初期スコープ外:

```txt
SEO
SSR / SSG
OGP
canonical URL
構造化データ
Plugin Marketplace
外部 CMS 連携
複雑な multi-tenant 権限
Storybook / Pencil 同期
独立 workspace としての designSystem
汎用 UI component library の再構築
AI による DB migration 生成
AI による React component 生成
AI による Tailwind class 生成
```

## 16. Risks

| Risk | 対策 |
| --- | --- |
| AI が不正な JSON を返す | Zod validation と parse failure の明示 |
| AI が存在しない component を指定する | json-render Catalog allowlist |
| props が component と合わない | `propsSchema` validation |
| Renderer が肥大化する | registry service と renderer component を分離 |
| frontend hooks が肥大化する | React 非依存処理を `services/` へ移す |
| repository に business rule が漏れる | service test で rule を固定 |
| Drizzle schema だけでは UI が決まらない | UI metadata を併用 |
| AI cost が増える | Summary / Layout / Navigation cache |
| 生成履歴が肥大化する | session / screen の保持期間、削除 API、必要なら archive を用意する |
| json-render 0.x の破壊的変更 | App UI Schema と json-render Spec の変換層を挟む |
| design token 移管で見た目が崩れる | root `src/styles/*` へ先に移し、主要 route の visual smoke を確認 |
| 高抽象 component が不足して AI UI が粗くなる | catalog を page/section 粒度で育て、低レベル部品を AI 語彙にしない |

## 17. Definition of Done

MVP の完了条件:

| 条件 | Status | Notes |
| --- | --- | --- |
| `shared/schemas` に App UI Schema、ComponentDefinition、EntityMetadata、NormalizedEntity、VisualIntent が定義されている | Done | backend / frontend で共有中 |
| `@json-render/core` / `@json-render/react` を使って frontend renderer が検証済み App UI Schema だけを描画できる | Done | `src/modules/ui-schema` と renderer tests で確認 |
| json-render Catalog にない component は描画されない | Done | catalog validation で拒否 |
| `designSystem/` workspace に依存せず、root app の token/theme CSS で見た目が成立している | Done | `src/styles/*` に移管済み |
| `@repo/design-system` import が root app から除去されている | Done | root app は app-local registry を使用 |
| Sources domain が RSS / API / Markdown / PostgreSQL を NormalizedEntity に変換できる | Done for MVP | adapters / refresh / upsert / service + route tests 済み |
| Entities domain が PostgreSQL entity の list/detail を返せる | Done for MVP | backend detail と frontend detail/form surface 済み |
| AI Layout Planner が mocked provider で deterministic に動く | Done | provider fake と cache hit test 済み |
| AI 出力は backend で検証され、cache される | Done for MVP | layout は cache 済み。summarize / classify / navigation は validation 済み |
| frontend / backend とも domain module の依存方向が守られている | Done for current domains | routes -> hooks/service -> repository の形を維持 |
| `pnpm typecheck && pnpm lint && pnpm test run` が通る | Done | `pnpm verify` で確認対象 |

次の product MVP の完了条件:

| 条件 | Status |
| --- | --- |
| `/admin` と `/showcase` がユーザー向け route / nav から削除されている | Done |
| Prompt で生成した画面が `generated_screens` に保存される | Done |
| `/history` で生成履歴を一覧・検索・再現できる | Done |
| `/prompt/$screenId` が保存済み App UI Schema を LLM なしで再描画できる | Done |
| action click から次画面生成 API を呼べる | Done |
| LLM が action context から next intent を推定し、child screen を保存できる | Done |
| parent-child screen の履歴を辿れる | Done for API / storage |
| 全ての生成結果が Zod + catalog validation を通る | Done |

## 18. 実装開始時の最小手順

最初に作る単位は、AI provider ではなく deterministic にテストできる schema / renderer / registry とする。

```txt
1. design token / theme CSS を `src/styles/*` に移管
2. `@repo/design-system` import を root app から除去
3. `@json-render/core` / `@json-render/react` を導入
4. shared/schemas/ui-schema.schema.ts
5. shared/schemas/component-registry.schema.ts
6. src/modules/component-registry
7. src/modules/ui-schema
8. fixed sample App UI Schema rendering
9. renderer / registry service tests
```

この順に進めると、AI なしで安全な描画経路を先に固定できる。その後に Sources、Entities、Cache、AI を接続する。
