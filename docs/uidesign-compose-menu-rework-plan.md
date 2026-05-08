# UIDesign Compose Menu Rework Plan

## 背景

現状の Compose menu は、期待している「実際の生成画面で押したボタンの遷移先を編集する」体験になっていない。

発生している問題は次の通り。

- 生成画面内のリンクボタンが `<a>` として動き、Compose menu を開く前に通常リンクとして遷移する。
- 画面内ボタンを押しても、そのボタンが選択中であることが画面側に出ない。
- Dock は Compose tab に切り替わるが、リンク先設定コントロールへフォーカスされない。
- 「新しいページを生成」を選ぶ導線が Compose の中で明確ではなく、ページ遷移後にも生成が走らない。
- Compose 内の Actions 一覧が、実際にはリンク先一覧のように見えてしまい、何を選ぶ UI なのか曖昧。
- `NavigationPanel.links` や card item の `href` のように props 側にある `/cart` が、保存可能な `AppAction` として扱えない場合がある。

## 目標

UIDesign の編集画面では、生成画面内のクリック可能要素をすべて「編集対象の action 選択」として扱う。

ユーザーが画面内の「カート」「商品詳細」「タイムセール」などを押すと、通常遷移や即時生成は行わず、該当ボタンが選択状態になり、Dock の Compose tab が開く。Compose には選択中 action のリンク先 SelectBox だけを表示し、そこで既存ページ、新規生成、パスリンクを選ぶ。

## 非目標

- 本格的な preview/runtime mode の実装は今回扱わない。
- json-render の構造粒度を変更しない。
- 複数 action を一括編集する UI は作らない。
- drag and drop やビジュアルページマップは作らない。

## UX 方針

### 画面内ボタンの押下

編集画面では、生成画面内の action は常に Compose 選択として動く。

- `generate-screen`, `navigate`, `submit` の kind に関係なく、`onAction` がある場合は `<button>` として描画する。
- `fallbackHref` しかないリンクも、編集画面では `<a>` にしない。
- 押下時に `selectedActionId` を更新する。
- 押下したボタンには選択中の見た目を出す。
  - 例: `ring-2 ring-primary`, `border-primary`, `aria-pressed=true`, `data-selected=true`
- Dock が閉じていれば開く。
- Dock tab は `compose` に切り替える。
- Compose のリンク先 SelectBox に focus する。

### Compose menu

Compose 内の Actions 一覧は削除する。

Compose は「現在選択中の action を編集するフォーム」にする。

表示するもの:

- 選択中 action のラベル
- 選択中 action の id
- source page
- リンク先 SelectBox
- 必要に応じた補助入力
- 開くボタン
- AI生成ボタン

表示しないもの:

- Action 一覧
- action ごとのリンク先一覧
- `Open` リンク中心の表示
- link 単位の `保存`
- `Unlink` / `未設定`

### Link SelectBox

現在 `Link /cart` や `schema -> /cart` と表示している領域を SelectBox 化する。

SelectBox の候補:

- `既存ページ: <page title>`
  - 選択時に `/prompt/session/<sessionId>` を元 ScreenJSON の action target / props href に反映する。
  - 操作は `開く`。
- `パス: /cart`
  - schema 側の `action.target` または props 側の `href` を候補に出す。
  - 選択時に元 ScreenJSON の action target / props href に反映する。
  - 操作は `開く`。
- `カスタムパス`
  - 選択時だけ `/path` 入力欄を表示する。
  - `開く` 時に元 ScreenJSON の action target / props href に反映する。

SelectBox の値は現在の優先順位で初期化する。

1. schema action の `target`
2. props 側の fallback href
3. 互換用の保存済み `screen_action_links.targetSessionId`
4. 互換用の保存済み `screen_action_links.targetPath`
5. `カスタムパス`

### 生成と遷移

画面内クリックでは生成も遷移もしない。

生成は Compose の `AI生成` ボタンで明示的に実行する。

生成成功時の動作:

1. `POST /api/sessions/:sessionId/actions/:actionId/generate`
2. backend は返却された `screen.sessionId` への path を元 ScreenJSON schema に反映する
3. 元 session に生成先 session path を反映した新しい ScreenJSON version を保存する
4. `openSession(generated.screen.sessionId)` で生成先 Prompt ページを開く
5. 生成元ページへ戻っても、その action は生成先 Prompt ページを開く target を持つ

既存ページ選択時の動作:

1. SelectBox 変更で preview 上の ScreenJSON schema を更新する
2. `開く` で該当ページへ遷移する

パス選択時の動作:

1. SelectBox 変更で preview 上の ScreenJSON schema を更新する
2. `開く` で該当 path へ遷移する

## action の扱い

### 問題

現状は `section.actions` にある action だけが backend の `findAction()` で扱える。

一方で UI には `NavigationPanel.links`, `CardGridSection.items[].href`, `CarouselSection.items[].href`, `SplitHeroSection.primaryAction.href` のような props 側リンクもある。これらが `section.actions` に対応していないと、画面上は押せるのに Compose で保存・生成対象にできない。

### 方針

表示上クリック可能なリンクは、必ず安定した `AppAction` として扱えるようにする。

実装候補:

- `shared` か `src/modules/ui-schema` に `collectRenderableActions(schema)` を作る。
- `section.actions` にある action を最優先する。
- props 側 href からも action candidate を作る。
- candidate id は deterministic にする。
  - 例: `section-${index}-${slug(label || href)}`
- 既存 action と label/target が一致する場合は重複させない。
- backend の `findAction()` も同じ helper か同じルールを使う。

これにより、`/cart` のような link props も Compose の SelectBox 候補になり、保存対象にもできる。

## 実装ステップ

### Step 1: action collection helper

追加/更新候補:

- `shared/schemas/ui-action-collector.ts`
- `api/modules/screen-history/screen-history.service.ts`
- `src/modules/screen-history/components/PromptWorkspace.tsx`
- `src/modules/component-registry/components/AppActionControl.tsx`

やること:

- `collectRenderableActions(schema)` を追加する。
- `section.actions` と props 側 href から action を収集する。
- backend `findAction()` を `collectRenderableActions()` ベースに変える。
- `PromptWorkspace.availableActions` も同じ helper を使う。

### Step 2: canvas action interception

更新候補:

- `src/modules/component-registry/components/AppActionControl.tsx`
- `src/modules/ui-schema/components/JsonRenderRenderer.tsx`
- `src/modules/screen-history/components/PromptWorkspace.tsx`

やること:

- `AppActionRenderProvider` に `selectedActionId` を追加する。
- `JsonRenderRenderer` に `selectedActionId` prop を追加する。
- `PromptWorkspace` から `selectedAction?.action.id` を渡す。
- `onAction` がある場合、`navigate` と fallback href も `<button>` として描画する。
- 選択中 action に selected style を付ける。

### Step 3: ComposePanel simplification

更新候補:

- `src/modules/screen-history/components/PromptWorkspace.tsx`

やること:

- ComposePanel の Actions 一覧 section を削除する。
- selected action がない場合は「画面内のボタンを選択してください」だけを表示する。
- selected action がある場合だけ Link SelectBox を表示する。
- `selectedAction` 変更時に SelectBox へ focus する。
- `session:<id>`, `path:<path>`, `custom-path` を単一 select state にまとめる。
- 主導線は `開く` と `AI生成` にする。
- `ScreenJSON 保存` ボタンは表示しない。

### Step 4: new page generation as compose action

更新候補:

- `src/modules/screen-history/components/PromptWorkspace.tsx`
- `src/modules/screen-history/hooks/screen-history.hooks.ts`
- `api/modules/screen-history/screen-history.service.ts`

やること:

- Compose の `AI生成` ボタンを押す。
- `AI生成` は link target の選択状態に依存しない。
- `kind: generate-screen` の action だけ `AI生成` を有効化する。
- 成功時に生成先 session path を元 ScreenJSON schema に反映した新 version を保存する。
- 生成後 `openSession(generated.screen.sessionId)` で新しい Prompt ページへ遷移する。
- 生成元へ戻った時に action target / props href が生成先 path を持つことを確認する。

### Step 5: tests

追加/更新候補:

- `tests/ui-schema-renderer.test.tsx`
- `tests/component-registry.service.test.ts`
- `tests/modules.screen-history.service.test.ts`
- `tests/e2e/history.spec.ts`

確認項目:

- `onAction` があるとき `navigate` action は `<a>` ではなく `<button>` になる。
- fallback href だけのリンクも Compose 選択として扱われる。
- selected action は canvas 上で selected style を持つ。
- `collectRenderableActions()` が props 側 `/cart` を action として収集する。
- backend `findAction()` が props 側 action id を解決できる。
- ComposePanel に Actions 一覧が出ない。
- selected action 変更時に SelectBox が focus される。
- `AI生成` 成功後に元 ScreenJSON が生成先 path を持つ新 version として保存される。
- 既存ページ / path 選択は link 単位ではなく preview ScreenJSON schema を更新する。
- `ScreenJSON 保存` ボタンは表示されない。

## 受け入れ条件

- 生成画面内のリンクボタンを押しても、通常のリンク遷移は発生しない。
- 押した画面内ボタンが選択状態に見える。
- Dock が Compose tab で開き、リンク先 SelectBox に focus される。
- Compose 内に Actions 一覧は表示されない。
- `/cart` のような link target は SelectBox 候補として表示される。
- 既存ページを選ぶと preview ScreenJSON の target / href が `/prompt/session/<sessionId>` に更新される。
- `AI生成` を押すとページ生成が走り、生成先 path を反映した元 ScreenJSON version が保存される。
- path を選ぶと preview ScreenJSON の target / href が更新される。
- link 単位の保存ボタンや Unlink ボタンは表示されない。
- `ScreenJSON 保存` ボタンは表示されない。
- `pnpm verify` が通る。

## リスク

- props 側 href から生成する synthetic action id が後で変わると、編集中 action を再選択できなくなる。
- label / props path 変更で synthetic id が変わる設計にすると、編集中選択が外れる。
- action collection helper を frontend/backend で別実装にするとズレる。
- 編集画面と将来の preview/runtime mode の責務を混ぜると、また「押したら編集」か「押したら遷移」かが曖昧になる。

## 推奨順序

1. `collectRenderableActions()` を shared helper として作る。
2. canvas action をすべて button 化し、selected style を出す。
3. ComposePanel から Actions 一覧を消し、Link SelectBox に置き換える。
4. new page generation 後の auto link を実装する。
5. e2e で「画面内ボタン押下 -> Compose focus -> 新規生成 -> 生成先 open」を確認する。
