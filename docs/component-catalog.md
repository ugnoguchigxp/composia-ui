# Component Catalog

この一覧は UIDesign の生成 AI と renderer が共有する root app catalog の現行パーツ一覧です。

## Source Of Truth

| Surface | Status | Role |
| --- | --- | --- |
| `shared/schemas/app-catalog.schema.ts` | Active | `componentPropsSchemas` と `componentDefinitions` の Single Source of Truth。AI が選べる語彙、props、source 制約はここから決まる。 |
| `src/modules/component-registry/components/registry.tsx` | Active | `componentDefinitions` に存在する component を React 実装へ接続する。 |
| `src/modules/component-registry/services/catalog.service.ts` | Active | `@json-render/core` / `@json-render/react` に渡す root app catalog。 |
| `api/modules/ai/ai.provider.ts` | Active | `componentDefinitions` から provider instructions と structured output schema を作る。 |
| `tests/component-catalog.parity.test.ts` | Active | schema / registry / docs の一覧ズレを検出する。 |
| Storybook | Active docs shell | root app catalog の描画確認用。SSoT は Storybook ではなく `componentDefinitions`。 |
| `designSystem/` workspace | Legacy reference | root app から runtime import しない。使える表現は catalog component 側へ移植する。 |

低レベルの `Button`、`Input`、`Card`、`Grid` は AI に直接選ばせず、各 catalog component の内部実装に閉じます。`designSystem/` の候補もこの基準で扱い、単体部品ではなく generated screen に意味を持つ section へ昇格させます。

## DesignSystem Review

| Candidate | Decision | Catalog Adoption |
| --- | --- | --- |
| `HealthRadarChart` | Adopt concept | chart token と radar 表現を `ChartSection` の `chartType: "radar"` に移植。 |
| `ProgressBar` | Adopt concept | quota / readiness / setup 状態を扱う `ProgressListSection` として追加。 |
| `MiniTable` | Covered | bounded table は既存 `DataTableSection` を使う。必要になれば compact variant を追加する。 |
| `NavigationStepper` | Covered | workflow は既存 `ProcessStepperSection` を使う。 |
| `SimpleSearchInput` / `Tabs` | Covered | marketplace search は `MainSearchNavigationSection`、local tabs は `NavigationPanel` を使う。 |
| `FileTree` / `IconTreeMenu` | Defer | DnD や mutable tree state が強く、現時点の static generated section には載せない。必要時に read-only `TreeSection` として追加する。 |
| `Modal` / `Drawer` / `Toast` | Internal only | generated screen の section ではなく action / shell の内部表現として扱う。 |

## Page Shells

| Component | Sources | AI / Renderer Use | Prompt Props |
| --- | --- | --- | --- |
| `DashboardPage` | `app` | `layout: "dashboard"` / `layout: "screen"` の page shell。 | `visualIntent?` |
| `EntityListPage` | `app` | `layout: "entity-list"` の page shell。 | `visualIntent?` |
| `EntityDetailPage` | `app` | `layout: "entity-detail"` の page shell。 | `visualIntent?` |
| `EditableFormPage` | `app` | `layout: "form"` の page shell。 | `visualIntent?` |
| `ArticleFeedPage` | `app` | `layout: "article-feed"` の page shell。 | `visualIntent?` |
| `SidebarPage` | `app` | legacy renderer compatibility。新規 provider generation では既定にしない。 | `navigation[label,href]?, visualIntent?` |

## Sections

| Component | Sources | AI Use | Prompt Props |
| --- | --- | --- | --- |
| `KpiSummarySection` | `summary`, `postgres`, `api` | concrete metrics が必要な時だけ使う。overview 代替にはしない。 | `title?, items[label,value,description?]?` |
| `ChartSection` | `summary`, `postgres`, `api`, `app` | numeric trend、comparison、share、radar score が必要な時だけ使う。装飾目的では使わない。 | `title, description?, chartType?, valueLabel?, secondaryValueLabel?, data[label,value,secondaryValue?]?, showLegend?, height?` |
| `ProgressListSection` | `summary`, `postgres`, `api`, `app` | completion、quota、setup、health、score の進捗リスト。navigation 代替にはしない。 | `title, description?, items[label,value,max?,description?,tone?]?` |
| `TimelineSection` | `rss`, `api`, `markdown` | 時系列のイベント、履歴、アクティビティ。 | `title, items[title,timestamp?,description?]?` |
| `InsightPanel` | `summary`, `rss`, `postgres`, `api`, `markdown` | renderer 互換用。新規 provider generation では除外。 | `title, body, action?[label,href]` |
| `ImageSection` | `app`, `api`, `markdown` | allowlisted image URL を表示する単体画像セクション。 | `title?, description?, image[src,alt,caption?,credit?], aspectRatio?` |
| `SplitHeroSection` | `app`, `api`, `markdown` | 商品、会場、portfolio、feature intro などの主要導線。 | `eyebrow?, title, description?, image?, primaryAction?, secondaryAction?` |
| `CarouselSection` | `app`, `api`, `markdown`, `rss` | 商品、記事、ギャラリー、推薦の横並び。 | `title, description?, items[title,description?,badge?,href?,image?]?` |
| `ProcessStepperSection` | `summary`, `api`, `markdown` | onboarding、注文、障害対応、サポート手順。 | `title, description?, steps[title,description?,status?]?` |
| `CardGridSection` | `app`, `api`, `markdown`, `rss`, `postgres` | 商品、project、template、file、選択カードの grid。 | `title, description?, items[title,description?,badge?,href?,meta?,image?]?` |
| `MainSearchNavigationSection` | `navigation`, `app` | marketplace 型の主検索と直下タブ。 | `title?, searchPlaceholder?, searchButtonLabel?, categories[label,value]?, links[label,href]?` |
| `FormSection` | `app`, `api`, `postgres` | create、edit、settings、checkout、application form。 | `title, description?, fields[name,label,type?,placeholder?,value?,required?,options?]?, submitLabel?, secondaryAction?` |
| `MasterDetailSection` | `app`, `api`, `postgres`, `markdown` | ticket、customer、message、record、document の master-detail。 | `title, description?, items[id,title,description?,meta?,status?]?, detail[title,description?,fields?]?` |
| `KanbanSection` | `app`, `api`, `postgres` | task、ticket、lead、workflow state。 | `title, description?, columns[title,cards[title,description?,assignee?,meta?,tone?]]?` |
| `CalendarSection` | `app`, `api`, `postgres` | event、booking、deadline、schedule。 | `title, description?, events[title,date,time?,description?,tone?]?` |
| `ChatPanelSection` | `app`, `api`, `markdown` | support、AI chat、messaging。 | `title, description?, messages[author,role?,content,timestamp?]?, composerPlaceholder?` |
| `EditorPreviewSection` | `app`, `api`, `markdown` | document、markdown、code、prompt、content の edit/preview。 | `title, editorTitle?, editorContent, previewTitle?, previewContent` |
| `ComparisonSection` | `app`, `api`, `postgres`, `markdown` | plan、option、candidate、version、diff の比較。 | `title, description?, columns[title,description?,items[label,value,tone?]?]?` |
| `DataTableSection` | `postgres`, `api` | bounded tabular data preview。row cell は scalar のみ。 | `title, description?, columns[key,label]?, rows? with scalar cell values only` |
| `NavigationPanel` | `navigation` | compact local tab navigation。main search がない局所タブ用。 | `title, links[label,href]?` |
| `EmptyState` | `app`, `summary`, `rss`, `postgres`, `api`, `markdown`, `navigation` | empty data fallback。 | `title, description?, action?` |
| `ErrorState` | `app`, `summary`, `rss`, `postgres`, `api`, `markdown`, `navigation` | validation / loading error fallback。 | `title, description?` |

## Maintenance Rule

新しいパーツを追加するときは、`componentPropsSchemas`、`componentDefinitions`、`appJsonRenderComponentMap`、`appJsonRenderCatalog`、fixtures、catalog parity tests、Storybook stories、この一覧を同時に更新します。

生成 AI が選べるパーツは `componentDefinitions` から provider instructions に流れるため、使わせたくないパーツは catalog から削除します。Storybook は catalog の別 SSoT ではなく、root app catalog を描画確認するための shell として使います。
