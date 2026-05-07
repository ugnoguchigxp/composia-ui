# Root App デザインシステム同期の実装詳細計画

## 1. 結論

この計画では、旧 `designSystem/` workspace、Storybook、Pencil 同期を新規基盤として復活させない。

Composia UI の現在の生成基盤は root app の App UI Schema、json-render catalog、app-local registry component で成立している。したがって、同期対象は次の 2 系統に限定する。

| 領域 | SSoT | 同期先 | 目的 |
| :--- | :--- | :--- | :--- |
| Component Catalog | `shared/schemas/app-catalog.schema.ts` | `api/modules/ai/ai.provider.ts`, `src/modules/component-registry/*`, tests | AI が使える高レベル component 語彙を一元化する |
| Token / Theme | `src/styles/tokens.css`, `src/styles/themes.css`, `src/styles/tailwind-theme.css` | `src/lib/theme-tokens.ts`, registry component | visual intent を CSS variable / Tailwind token に安全に対応させる |

推奨度は **8/10**。現行アーキテクチャに沿っており、AI 出力品質と保守性に直接効く。Pencil や低レベル UI component を同期対象に戻す旧案は採用しない。

## 2. 現状認識

### 2.1 採用する現行方針

- AI に `Button`、`Card`、`Input` のような低レベル UI 部品を直接選ばせない。
- AI が返すのは App UI Schema と抽象的な visual intent までにする。
- 低レベル UI、class、CSS variable の選択は app-local registry component の内部実装に閉じる。
- root app は `@repo/design-system` に依存せず、`src/styles/*` の token / theme CSS で見た目を成立させる。

### 2.2 実装で解消する重複

実装前は、`shared/schemas/app-catalog.schema.ts` の `componentDefinitions` / `componentPropsSchemas` と、`api/modules/ai/ai.provider.ts` の catalog prompt / provider JSON Schema が別々に管理されていた。

この重複が、component 追加時の漏れ、provider prompt の陳腐化、cache version 更新漏れを生む。

### 2.3 対象外

以下はこの計画では実装しない。

- `designSystem.pen` への partial patch。
- `designSystem/` 配下の Storybook / Pencil を root app の必須検証基盤に戻すこと。
- `.pen` と App UI Schema component の双方向 parity。
- AI prompt に低レベル UI component catalog を渡すこと。
- root から存在しない `pnpm build:tokens` や `pnpm pencil:check` を呼ぶこと。

## 3. 目標アーキテクチャ

```txt
shared/schemas/app-catalog.schema.ts
  -> componentDefinitions
  -> provider catalog instructions
  -> provider component/source enum
  -> catalog validation
  -> registry parity tests

src/styles/tokens.css
src/styles/themes.css
src/styles/tailwind-theme.css
  -> src/lib/theme-tokens.ts
  -> visual-intent.service.ts
  -> registry components
```

原則は「AI に渡す語彙」と「frontend が描画できる語彙」を同じ source から導くこと。Pencil 上の図形名や低レベル UI ファイル名は、この契約の外側に置く。

## 4. Phase 1: Component Catalog の SSoT 化

### 4.1 `componentDefinitions` に prompt metadata を持たせる

対象:

- `shared/schemas/component-registry.schema.ts`
- `shared/schemas/app-catalog.schema.ts`
- `tests/schemas.component-registry.test.ts`

変更内容:

1. `componentDefinitionSchema` に `promptProps` を追加する。
2. 必要なら `promptGuidance` を任意項目として追加する。
3. `componentDefinitions` の各 component に、AI provider へ渡す props の要約を明示する。

例:

```typescript
export const componentDefinitionSchema = z
  .object({
    name: appUiComponentNameSchema,
    description: z.string().min(1),
    allowedSources: z.array(z.string().min(1)).default([]),
    propsSchema: zodSchemaLike,
    promptProps: z.string().min(1),
    promptGuidance: z.string().min(1).optional(),
    variants: z.array(z.string().min(1)).optional(),
  })
  .strict();
```

Zod schema から props 説明を自動抽出しようとしない。Zod の AST から LLM 向けの安定した短文を作るのはコストに対して不安定なので、初期実装では明示 metadata を SSoT に含める。

### 4.2 AI provider の catalog rules を削除する

対象:

- `api/modules/ai/ai.provider.ts`
- `tests/ai.provider.test.ts`

変更内容:

1. `sectionCatalogRules` の手書き配列を削除する。
2. `componentDefinitions` から `componentInstructions` を生成する。
3. component enum と source enum も `componentDefinitions` から導く。
4. `FormSection` の JSON Schema だけは現行の詳細 schema を維持する。
5. それ以外の component props は、現行どおり provider schema では緩めに受け、backend の `assertAppUiSchemaCatalog` で最終検証する。

実装イメージ:

```typescript
import { componentDefinitions } from '../../../shared/schemas/app-catalog.schema';

const sectionComponentNames = componentDefinitions.map((definition) => definition.name);
const sectionSources = Array.from(
  new Set(componentDefinitions.flatMap((definition) => definition.allowedSources))
);

const componentInstructions = componentDefinitions
  .map((definition) => {
    const guidance = definition.promptGuidance ? `; guidance=${definition.promptGuidance}` : '';
    return `- ${definition.name}: sources=${definition.allowedSources.join('|')}; props=${definition.promptProps}${guidance}`;
  })
  .join('\n');
```

`allowedSources` に `*` を入れる場合は、provider の JSON Schema enum にそのまま混ぜない。現在の catalog には `*` はないが、将来追加するなら `sectionSources` 生成時に実 source へ展開する。

### 4.3 Catalog version を cache key に入れる

対象:

- `shared/schemas/app-catalog.schema.ts`
- `api/modules/ai/ai.service.ts`
- `api/modules/ai/ai.provider.ts`
- `tests/modules.ai.service.test.ts`

変更内容:

1. `appCatalogVersion` を `shared/schemas/app-catalog.schema.ts` から export する。
2. `layoutSystemContextVersion` と `appCatalogVersion` を組み合わせて AI layout cache key に入れる。
3. component の追加、削除、prompt metadata 変更時は `appCatalogVersion` を更新する運用にする。

例:

```typescript
export const appCatalogVersion = 'app-catalog-v4';
```

自動 hash 化は後続でよい。初期は手動 version で十分だが、テストで cache key に含まれることを確認する。

## 5. Phase 2: Registry / Catalog Parity の検証

### 5.1 高レベル component だけを比較する

対象:

- `src/modules/component-registry/services/catalog.service.ts`
- `src/modules/component-registry/components/registry.tsx`
- `tests/component-catalog.matrix.test.tsx`
- 新規 `tests/component-catalog.parity.test.ts`

比較対象は次の 3 つだけにする。

1. `componentPropsSchemas` の key。
2. `componentDefinitions[].name`。
3. `appJsonRenderRegistry` に登録される高レベル component 名。

`.pen` の `Button`、`Card`、`Dialog` などは比較対象にしない。

### 5.2 Registry map を明示 export する

`defineRegistry` の戻り値を無理に introspection しない。比較しやすいよう、registry component map を先に定義して export する。

例:

```typescript
export const appJsonRenderComponentMap = {
  DashboardPage: PageShell,
  EntityListPage: PageShell,
  // ...
  ErrorState,
} satisfies Record<AppComponentName, ComponentType<any>>;

export const { registry: appJsonRenderRegistry } = defineRegistry(appJsonRenderCatalog, {
  components: appJsonRenderComponentMap,
});
```

テストでは `Object.keys(appJsonRenderComponentMap)` と `componentDefinitions.map((d) => d.name)` を比較する。

### 5.3 Catalog config も明示 export する

`catalog.service.ts` も同様に、`defineCatalog` に渡す component config を export する。これにより catalog registration と schema 定義のズレをテストできる。

成功条件:

- component を `componentDefinitions` に追加して registry 登録を忘れると test が落ちる。
- registry component だけ追加して catalog schema を忘れると test が落ちる。
- provider prompt に存在しない component 名が残らない。

## 6. Phase 3: Token / Theme Contract の整理

### 6.1 root CSS の selector を SSoT とする

対象:

- `src/styles/tokens.css`
- `src/styles/themes.css`
- `src/styles/tailwind-theme.css`
- `src/lib/theme-tokens.ts`
- `tests/src.utils.test.ts` または新規 `tests/theme-tokens.test.ts`

現行 CSS は以下の契約を持つ。

- theme: `:root[data-theme="dark"]` のような `data-theme` selector。
- density: `:root[data-density="compact"]` / `:root[data-density="spacious"]`。
- Tailwind v4 theme token: `@theme { --color-primary: var(--primary) }`。

したがって、`src/lib/theme-tokens.ts` の `applyColorTheme` は `theme-*` class を付けるのではなく、`data-theme` を操作する。

例:

```typescript
export function applyColorTheme(theme: ColorThemeKey, root?: HTMLElement | null) {
  const rootElement = getRootElement(root);
  if (!rootElement) return;
  if (theme === 'light') {
    rootElement.removeAttribute('data-theme');
    return;
  }
  rootElement.setAttribute('data-theme', COLOR_THEME_PRESETS[theme].dataTheme);
}
```

### 6.2 visual intent と density 名を合わせる

現行の AI provider は `density: compact | normal | spacious` を使う。CSS も `compact` / `spacious` を持つ。TypeScript helper 側の `default` / `comfortable` のような別名は、root app の公開契約では使わない。

変更内容:

1. `DENSITY_PRESETS` を `compact | normal | spacious` にそろえる。
2. `normal` は `data-density` を外すか、`data-density="normal"` を CSS で明示するかを決める。
3. registry component は `visualIntent.density` を `data-density` と class の両方に使ってよいが、値の種類は統一する。

### 6.3 CSS 生成は後回しにする

初期実装では `src/styles/themes.css` を自動生成しない。まずは契約検証を入れる。

検証候補:

- `src/lib/theme-tokens.ts` の theme key が `src/styles/themes.css` の `data-theme` selector と一致する。
- `DENSITY_PRESETS` が `visualIntentSchema` の density enum と一致する。
- `tailwind-theme.css` の `@theme` に、registry component が使う semantic color token が登録されている。

CSS 生成を入れる場合は Phase 5 以降にする。生成先は `src/styles/themes.css` に限定し、`designSystem/src/styles.css` や `.pen` は触らない。

## 7. Phase 4: Provider Contract の強化

対象:

- `api/modules/ai/ai.provider.ts`
- `api/modules/ai/ai.service.ts`
- `tests/ai.provider.test.ts`
- `tests/ai-output-fixtures.test.ts`
- `tests/modules.ai.service.test.ts`

実装内容:

1. `layoutInstructions` が `componentDefinitions` 由来であることを test する。
2. provider JSON Schema の component enum が `componentDefinitions` と一致することを test する。
3. provider JSON Schema の source enum が catalog の `allowedSources` と一致することを test する。
4. `assertAppUiSchemaCatalog` が最終防衛線として未知 component / source / props を拒否する test を維持する。
5. `layoutSystemContextVersion` と `appCatalogVersion` の変更が cache key に反映される test を追加する。

provider に渡す prompt は短く保つ。component props の詳細説明を増やしすぎると LLM の安定性が落ちるため、`promptProps` は 1 component につき 1 行を原則にする。

## 8. Phase 5: Visual Regression は root app で行う

Pencil / Storybook 専用基盤は作らない。視覚検証が必要な場合は、root app の generated screen を対象に Playwright を追加する。

対象:

- `tests/e2e/basic.spec.ts`
- `tests/e2e/history.spec.ts`
- 新規 `tests/e2e/generated-screen-visual.spec.ts`

検証例:

- `compact` / `normal` / `spacious` の density で主要 component が破綻しない。
- `data-theme` を切り替えて背景、foreground、border が適用される。
- generated screen に未知 component が混入しない。

スクリーンショット検証を追加する場合は、既存 root Playwright 設定に寄せる。`designSystem/` 専用 Playwright 設定はこの計画では増やさない。

## 9. 実行順序

| 順序 | 作業 | 推奨度 | 理由 |
| :--- | :--- | :--- | :--- |
| 1 | `componentDefinitions` に `promptProps` を追加 | 高 | provider prompt 重複を消す前提 |
| 2 | `ai.provider.ts` の `sectionCatalogRules` を `componentDefinitions` 由来に変更 | 高 | component 追加漏れを直接防げる |
| 3 | catalog / registry parity test を追加 | 高 | SSoT 運用を test で固定できる |
| 4 | `appCatalogVersion` を cache key に入れる | 中 | 古い layout cache の混入を防ぐ |
| 5 | `theme-tokens.ts` を root CSS selector に合わせる | 中 | theme / density の実装契約を明確にする |
| 6 | root Playwright の visual smoke を追加 | 低 | UI 差分の検出には有効だが初期必須ではない |
| 7 | CSS 自動生成を検討 | 低 | まず契約検証を優先する |

## 10. 完了条件

- `api/modules/ai/ai.provider.ts` に component catalog の手書き重複が残っていない。
- `componentDefinitions`、catalog registration、registry component map の component 名が一致する。
- AI provider の allowed component / source enum が `componentDefinitions` から導かれている。
- 低レベル UI component が AI の主要語彙として露出していない。
- `theme-tokens.ts` の theme / density 操作が `src/styles/*` の selector と一致している。
- `pnpm verify` が通る。

## 11. リスクと対策

| リスク | 対策 |
| :--- | :--- |
| `promptProps` が古くなる | component 追加時に parity test と schema test を更新必須にする |
| provider JSON Schema を完全自動生成しようとして複雑化する | 初期は component / source enum だけ自動化し、props は backend Zod validation を最終契約にする |
| token helper と CSS selector が再びズレる | `theme-tokens.test.ts` で `data-theme` / `data-density` の操作を検証する |
| visual regression が重くなる | root app の smoke 対象だけに絞り、Storybook / Pencil を必須経路にしない |

## 12. 旧案からの変更点

- `designSystem.pen` は同期対象から外した。
- `.pen` と App UI Schema catalog の双方向 parity は削除した。
- `shared/schemas/design-tokens.schema.ts`、root `scripts/sync-pencil.mts`、root `scripts/generate-css.mts` は作らない。
- `catalog-fragment.txt` の生成ファイル方式ではなく、runtime code が `componentDefinitions` から provider instructions を組み立てる方式にした。
- Tailwind token は `hsl(var(--primary))` 形式へ移行せず、現行の `@theme { --color-primary: var(--primary) }` と `:root[data-theme=...]` を維持する。
