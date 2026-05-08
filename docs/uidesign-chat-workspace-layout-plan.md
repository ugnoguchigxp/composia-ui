# UIDesign Chat Workspace Layout Plan

## 背景

Slack ライクなチャットアプリ UI を生成した際、現在の UIDesign では期待される 3 カラム構成にならず、左サイドバー / チャンネル一覧 / メッセージ本文の関係も曖昧になった。

現状の生成結果は `SidebarPage`、`FilterBarSection`、`MasterDetailSection`、`ChatPanelSection` などを直列 section として組み合わせている。これにより、一見チャットアプリに近い要素は出るが、Slack / Teams / Discord 風のワークスペース UI としては以下が不足する。

- ワークスペースナビ、会話リスト、会話本文を同一 viewport 内で固定配置できない。
- 3 カラム幅、スクロール領域、composer の位置を schema 側で厳密に指定できない。
- `sections[]` が page shell 内に上から積まれるため、複数 section を横方向の layout region として扱えない。
- `schema.intent` が `SidebarPage` の visible description に流れ、プロンプト由来の説明文が画面に露出する。

## 現状実装の診断

### AppUiSchema

`shared/schemas/ui-schema.schema.ts` の `AppUiSchema` は、page 全体に対して `layout` と `sections[]` を持つ。

```ts
{
  page: string;
  intent: string;
  layout: AppUiLayout;
  sections: AppUiSchemaSection[];
  navigation?: { items: NavigationItem[] };
}
```

`sections[]` には `region`、`slot`、`column`、`span` のような配置情報がない。そのため、AI が複数 section を返しても renderer は順序通りに並べるだけになる。

### Page Shell

`src/modules/component-registry/components/pages/PageShell.tsx` は通常 layout を `max-w-6xl` の縦積みページとして描画する。

`src/modules/component-registry/components/pages/SidebarPage.tsx` は `lg:grid-cols-[17rem_minmax(0,1fr)]` の 2 カラム固定で、左側には `navigation.items` だけを表示し、右側には全 section を縦積みする。

したがって現在の `layout: "sidebar"` は「サイドナビ付きページ」であり、「アプリケーションワークスペース」ではない。

### Catalog Components

現行 catalog にはチャットに使える `ChatPanelSection` と、2 カラムの `MasterDetailSection` がある。

ただしこれらは section 単体の部品であり、ワークスペース全体の 3 カラム構造を所有しない。`SidebarPage + MasterDetailSection + ChatPanelSection` のように組み合わせても、左カラム / 中央カラム / 右カラムを同一コンテキストで管理できない。

### AI Provider

`api/modules/ai/ai.provider.ts` の catalog guidance は、会話 UI には `ChatPanelSection` を使うことを示しているが、Slack 風の multi-pane chat workspace をどう生成するかは明示していない。

そのため AI は既存コンポーネントを寄せ集め、結果として section の縦積みや 2 カラム内の擬似チャット UI になりやすい。

## 方針

任意の 3 カラム layout engine を `AppUiSchema.sections[]` に追加するのではなく、初期実装では `ChatWorkspaceSection` という専用 catalog component を追加する。

理由:

- Slack ライクな UI は汎用カラム配置ではなく、よく定義された app pattern である。
- section の `region` / `slot` / `grid` 機能を入れると、json-render 変換、Compose 編集単位、AI schema 生成制約に広く影響する。
- 専用 component なら schema contract、renderer、AI guidance、テストを狭い範囲で追加できる。
- `ChatWorkspaceSection` は将来 `MailWorkspaceSection`、`ProjectWorkspaceSection`、`AdminWorkspaceSection` などへ横展開できる。

## ゴール

- Slack / Teams / Discord 風の依頼で、1 つの `ChatWorkspaceSection` が生成される。
- 左の workspace rail、中央の channel / DM list、右の message pane を同一 component 内で描画する。
- message pane は header、messages、composer を持つ。
- viewport 内でチャットアプリらしい密度とスクロール構造を表現する。
- `schema.intent` は画面上の説明文として表示しない。
- 既存の `SidebarPage` は汎用サイドナビページとして維持する。

## 非ゴール

- 初期実装では `sections[]` に自由な `region` / `slot` / `grid` 指定を追加しない。
- 初期実装では draggable layout builder や Compose の本格的な layout editor は実装しない。
- 初期実装では runtime messaging、リアルタイム通信、実データ保存は扱わない。
- 初期実装では Slack 固有のブランド・名称・色を直接コピーしない。

## 追加する Component

### `ChatWorkspaceSection`

配置:

- `shared/schemas/app-catalog.schema.ts`
- `src/modules/component-registry/components/sections/ChatWorkspaceSection.tsx`
- `src/modules/component-registry/components/registry.tsx`
- `src/modules/component-registry/services/catalog.service.ts`

props contract:

```ts
type ChatWorkspaceSectionProps = {
  workspace: {
    name: string;
    status?: string;
  };
  primaryNav: Array<{
    label: string;
    icon?: 'home' | 'messages' | 'activity' | 'files' | 'settings';
    href?: string;
    active?: boolean;
  }>;
  channels: Array<{
    id: string;
    name: string;
    unread?: number;
    muted?: boolean;
    active?: boolean;
  }>;
  directMessages?: Array<{
    id: string;
    name: string;
    status?: 'online' | 'away' | 'offline';
    unread?: number;
  }>;
  activeConversation: {
    title: string;
    subtitle?: string;
    topic?: string;
  };
  messages: Array<{
    id: string;
    author: string;
    role?: 'user' | 'assistant' | 'system';
    avatarLabel?: string;
    content: string;
    timestamp?: string;
    reactions?: Array<{
      label: string;
      count: number;
    }>;
  }>;
  composerPlaceholder?: string;
  actions?: AppAction[];
  visualIntent?: VisualIntent;
};
```

制約:

- `primaryNav` は 3-7 件。
- `channels` は 2-12 件。
- `directMessages` は 0-8 件。
- `messages` は 2-16 件。
- visible label に `Slack` など外部サービス名を必須化しない。

## 描画仕様

Desktop:

```txt
┌────────────┬────────────────────┬───────────────────────────────┐
│ rail       │ channels / DMs      │ conversation                  │
│ fixed      │ scroll list         │ header + messages + composer  │
└────────────┴────────────────────┴───────────────────────────────┘
```

実装 CSS 方針:

- root: `grid min-h-[calc(100vh-8rem)] overflow-hidden rounded-lg border bg-card`
- desktop columns: `lg:grid-cols-[4.5rem_18rem_minmax(0,1fr)]`
- rail: dense icon navigation, `border-r`, `bg-muted/40`
- list pane: `min-w-0 border-r`, channel / DM sections, `overflow-y-auto`
- message pane: `grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto]`
- messages: `overflow-y-auto`
- composer: bottom row with input and send icon button

Mobile:

- 初期実装では 3 カラムを横スクロールにしない。
- `primaryNav`、conversation list、message pane を縦積みにして、message pane を主表示にする。
- 画面破綻を避けるため `lg:` 以上で 3 カラム化する。

## `schema.intent` 表示の修正

現状 `JsonRenderRenderer` は `schema.intent.trim()` を `pageDescription` として page props に渡す。

この挙動は修正する。

変更対象:

- `src/modules/ui-schema/components/JsonRenderRenderer.tsx`
- `src/modules/ui-schema/services/ui-schema-to-json-render.service.ts`

変更方針:

- `schema.intent` は visible description に変換しない。
- PageShell / SidebarPage の `description` は、必要な場合だけ schema の別フィールドか section props から出す。
- 初期実装では page props から `description` を渡さない。

受け入れ条件:

- 「SlackライクなチャットアプリのUIを作ってください」のような依頼文がそのまま画面上に表示されない。
- 既存 section の `props.description` は従来通り表示される。

## AI Provider Guidance

`api/modules/ai/ai.provider.ts` の `layoutSystemContext` と catalog definitions を更新する。

追加ルール:

- Slack / Teams / Discord / chat workspace / チャットアプリ / チームチャット / DM / channel を含む依頼では、原則 `ChatWorkspaceSection` を使う。
- `SidebarPage + MasterDetailSection + ChatPanelSection` に分解しない。
- チャットワークスペースでは page-level title / intent を説明文として使わず、workspace name と conversation title を component props に入れる。
- navigation links ではなく、workspace rail / channel list / direct messages に分ける。

catalog `promptProps` 例:

```txt
workspace[name,status?],
primaryNav[label,icon?,href?,active?],
channels[id,name,unread?,muted?,active?],
directMessages[id,name,status?,unread?],
activeConversation[title,subtitle?,topic?],
messages[id,author,role?,avatarLabel?,content,timestamp?,reactions?],
composerPlaceholder?
```

## Schema / Catalog 更新

`shared/schemas/app-catalog.schema.ts`:

- `chatWorkspaceNavItemSchema`
- `chatWorkspaceChannelSchema`
- `chatWorkspaceDirectMessageSchema`
- `chatWorkspaceMessageSchema`
- `chatWorkspaceReactionSchema`
- `componentPropsSchemas.ChatWorkspaceSection`
- `componentDefinitions` への追加

`componentDefinitions`:

```ts
{
  name: 'ChatWorkspaceSection',
  description: 'A dense multi-pane team chat workspace with workspace rail, channel list, conversation, and composer.',
  allowedSources: ['app', 'api', 'markdown'],
  placement: 'section',
  propsSchema: componentPropsSchemas.ChatWorkspaceSection,
  promptProps: 'workspace[name,status?], primaryNav[...], channels[...], directMessages?[...], activeConversation[...], messages[...], composerPlaceholder?',
  promptGuidance: 'use for Slack-like, Teams-like, Discord-like, team chat, channel, DM, or messaging workspace requests',
}
```

## Renderer / Registry 更新

`src/modules/component-registry/components/sections/ChatWorkspaceSection.tsx`:

- lucide icons を使用する。
- icon 名は `home`, `messages`, `activity`, `files`, `settings` の小さな enum に閉じる。
- unknown icon は `messages` に fallback する。
- active channel を visually selected にする。
- unread count を badge 表示する。
- message row は avatar label、author、timestamp、content、reactions を表示する。
- composer は read-only input と send icon button にする。
- `AppActionList` は message pane footer ではなく、必要な場合だけ composer 周辺に表示する。

`src/modules/component-registry/components/registry.tsx`:

- `ChatWorkspaceSection` を import し `appJsonRenderComponentMap` に追加する。

`src/modules/component-registry/services/catalog.service.ts`:

- catalog component として登録する。

## Layout 追加の扱い

初期実装では `layout: "screen"` または既存 `layout` のまま `ChatWorkspaceSection` を section として出す。

ただし `PageShell` の `max-w-6xl` はワークスペース UI には狭い可能性がある。必要であれば第 2 段階で `layout: "workspace"` を追加する。

第 2 段階の追加対象:

- `shared/schemas/ui-schema.schema.ts`
- `api/modules/ai/ai.provider.ts`
- `src/modules/ui-schema/components/JsonRenderRenderer.tsx`
- `src/modules/ui-schema/services/ui-schema-to-json-render.service.ts`
- `src/modules/component-registry/components/pages/WorkspacePage.tsx`
- `src/modules/component-registry/services/catalog.service.ts`
- `src/modules/component-registry/components/registry.tsx`

`WorkspacePage` の方針:

- `max-w` を抑えず `max-w-[96rem]` 以上または full width に寄せる。
- page title / description を大きく表示しない。
- generated app surface を viewport 型で表示する。

初期実装で `ChatWorkspaceSection` の見た目が十分なら、`layout: "workspace"` は後続に回す。

## 実装順序

1. `schema.intent` を visible description に流さない修正を入れる。
2. `ChatWorkspaceSection` の props schema を追加する。
3. `ChatWorkspaceSection` の React component を実装する。
4. registry / catalog に component を登録する。
5. AI provider の `layoutSystemContext` と catalog prompt guidance を更新する。
6. schema validation test を追加する。
7. renderer test を追加する。
8. AI service test で Slack-like prompt が `ChatWorkspaceSection` を受け入れられることを確認する。
9. 必要なら `layout: "workspace"` を第 2 段階として追加する。

## テスト計画

### Unit

`tests/schemas.ui-schema.test.ts`

- `ChatWorkspaceSection` props が valid として通る。
- `messages` が空の場合は invalid。
- `channels` が空の場合は invalid。
- invalid `href` が rejected される。

`tests/ui-schema-renderer.test.tsx`

- `ChatWorkspaceSection` が render される。
- workspace rail、channel list、active conversation、messages、composer が表示される。
- `schema.intent` が画面に表示されない。
- section `props.description` は従来通り表示される component で表示される。

`tests/modules.ai.service.test.ts`

- provider が `ChatWorkspaceSection` を返した場合に catalog validation が通る。
- `ChatWorkspaceSection` が `schema outside the component catalog` にならない。

### Manual

- 「SlackライクなチャットアプリのUIを作ってください」で生成する。
- 期待結果:
  - 3 カラム相当の workspace UI が表示される。
  - 依頼文そのものは画面に表示されない。
  - チャンネル一覧とメッセージ pane が同一 card 内で整列する。
  - 右側 ChatDock と重なっても preview が破綻しない。

## Verify

実装後に最低限以下を実行する。

```bash
pnpm typecheck
pnpm test run tests/schemas.ui-schema.test.ts tests/ui-schema-renderer.test.tsx tests/modules.ai.service.test.ts
pnpm verify
git diff --check
```

## リスク

| リスク | 対応 |
| --- | --- |
| component props が大きくなり AI 出力が崩れる | enum と配列上限を小さく保ち、promptProps を短くする |
| Slack 専用に寄りすぎる | 名称は `ChatWorkspaceSection` とし、Teams / Discord / generic team chat も扱える props にする |
| `PageShell` の余白で workspace 感が弱い | 初期実装後の見た目で `layout: "workspace"` 追加を判断する |
| 汎用 layout 需要が後で出る | まず専用 component で品質を上げ、必要になった時点で slot/region schema を別計画にする |

## 完了条件

- Slack-like prompt の生成結果が `ChatWorkspaceSection` を使う。
- 3 カラム相当のチャットワークスペースが viewport 内で破綻なく表示される。
- page-level `intent` が visible copy として露出しない。
- catalog validation / renderer test / verify が通る。
