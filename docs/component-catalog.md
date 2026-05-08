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
| Storybook | Active docs shell | root app catalog の描画確認用。SSoT は Storybook ではなく `componentDefinitions`。各 section component を個別 story として載せる。 |
| `designSystem/` workspace | Legacy reference | root app から runtime import しない。使える表現は catalog component 側へ移植する。 |

低レベルの `Button`、`Input`、`Card`、`Grid` は AI に直接選ばせず、各 catalog component の内部実装に閉じます。`designSystem/` の候補もこの基準で扱い、単体部品ではなく generated screen に意味を持つ section へ昇格させます。

## DesignSystem Review

| Candidate | Decision | Catalog Adoption |
| --- | --- | --- |
| `HealthRadarChart` | Adopt concept | chart token と radar 表現を `ChartSection` の `chartType: "radar"` に移植。 |
| `ProgressBar` | Adopt concept | quota / readiness / setup 状態を扱う `ProgressListSection` として追加。 |
| `MiniTable` | Covered | bounded table は既存 `DataTableSection` を使う。必要になれば compact variant を追加する。 |
| `NavigationStepper` | Adopt concept | workflow は `StepperSection` として移植。 |
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
| `ChartInsightSection` | `summary`, `postgres`, `api`, `app` | 棒グラフ/パイチャートと要約テキストを同時表示。 | `title, description?, chartType?, valueLabel?, data[label,value]?, insights[title,body]?` |
| `StatsTrendCardsSection` | `summary`, `api`, `postgres`, `app` | 指標カード + 増減率 + 比較期間。 | `title, description?, cards[label,value,delta,deltaTone?,period?]?` |
| `ProgressListSection` | `summary`, `postgres`, `api`, `app` | completion、quota、setup、health、score の進捗リスト。navigation 代替にはしない。 | `title, description?, items[label,value,max?,description?,tone?]?` |
| `TimelineSection` | `rss`, `api`, `markdown` | 時系列のイベント、履歴、アクティビティ。 | `title, items[title,timestamp?,description?]?` |
| `ActivityFeedSection` | `summary`, `api`, `postgres`, `app` | actor/action/target/status の運用ログ。 | `title, description?, items[actor,action,target,status?,timestamp]?` |
| `NotificationCenterSection` | `summary`, `api`, `app` | 未読/既読と重要度つき通知センター。 | `title, description?, items[id,title,body?,level?,read?,timestamp?]?` |
| `InsightPanel` | `summary`, `rss`, `postgres`, `api`, `markdown` | renderer 互換用。新規 provider generation では除外。 | `title, body, action?[label,href]` |
| `ImageSection` | `app`, `api`, `markdown` | allowlisted image URL を表示する単体画像セクション。 | `title?, description?, image[src,alt,caption?,credit?], aspectRatio?` |
| `SplitHeroSection` | `app`, `api`, `markdown` | 商品、会場、portfolio、feature intro などの主要導線。 | `eyebrow?, title, description?, image?, primaryAction?, secondaryAction?` |
| `CarouselSection` | `app`, `api`, `markdown`, `rss` | 商品、記事、ギャラリー、推薦の横並び。 | `title, description?, items[title,description?,badge?,href?,image?]?` |
| `StepperSection` | `summary`, `api`, `markdown`, `app` | designSystem stepper 移植版。workflow、onboarding、注文、障害対応、サポート手順。 | `title, description?, steps[id,title,description?,status?,disabled?,meta?]?, orientation?, variant?, activeStepId?, compactOnMobile?, inlineContentOnVerticalMobile?` |
| `CardGridSection` | `app`, `api`, `markdown`, `rss`, `postgres` | 商品、project、template、file、選択カードの grid。 | `title, description?, items[title,description?,badge?,href?,meta?,image?]?` |
| `MainSearchNavigationSection` | `navigation`, `app` | marketplace 型の主検索と直下タブ。 | `title?, searchPlaceholder?, searchButtonLabel?, categories[label,value]?, links[label,href]?` |
| `FormSection` | `app`, `api`, `postgres` | create、edit、settings、checkout、application form。 | `title, description?, fields[name,label,type?,placeholder?,value?,required?,options?]?, submitLabel?, secondaryAction?` |
| `KanbanSection` | `app`, `api`, `postgres` | task、ticket、lead、workflow state。 | `title, description?, columns[title,cards[title,description?,assignee?,meta?,tone?]]?` |
| `CalendarSection` | `app`, `api`, `postgres` | event、booking、deadline、schedule。 | `title, description?, events[title,date,time?,description?,tone?]?` |
| `ScheduleSection` | `app`, `api`, `postgres` | 月間カレンダーで schedule を一覧するカード。 | `title?, description?, monthLabel?, weekDays?, days?, selectedDay?, entries[date,title,amount,status?]?` |
| `HoldingsListSection` | `app`, `api`, `postgres`, `summary` | 検索＋タブ＋評価額で保有銘柄を表示。 | `searchPlaceholder?, tabs?, activeTab?, holdings[ticker,name,quantityLabel,acquiredLabel,category?,value]?` |
| `AccordionSection` | `app`, `api`, `markdown`, `summary` | FAQ や詳細説明を折りたたみ表示。 | `title, description?, type?, defaultExpandedIds?, items[id,title,content,meta?]?` |
| `ControlPanelSection` | `app`, `api`, `summary` | 設定つまみ主体のコントロールパネル。 | `title, description?, enabled?, modes[id,label]?, activeModeId?, controls[id,label,icon?,value,min?,max?,step?]?` |
| `QuickActionsSection` | `app`, `api`, `summary` | 即時実行ショートカットのグリッド。 | `title, description?, items[id,label,description?,icon?]?` |
| `CheckoutSummarySection` | `app`, `api`, `postgres` | 小計/税/合計の決済サマリー。 | `title?, description?, lines[label,value,emphasize?]?, primaryActionLabel?, secondaryActionLabel?` |
| `ChatPanelSection` | `app`, `api`, `markdown` | support、AI chat、messaging。 | `title, description?, messages[author,role?,content,timestamp?]?, composerPlaceholder?` |
| `EditorPreviewSection` | `app`, `api`, `markdown` | document、markdown、code、prompt、content の edit/preview。 | `title, editorTitle?, editorContent, previewTitle?, previewContent` |
| `ComparisonSection` | `app`, `api`, `postgres`, `markdown` | plan、option、candidate、version、diff の比較。 | `title, description?, columns[title,description?,items[label,value,tone?]?]?` |
| `DataTableSection` | `postgres`, `api` | bounded tabular data preview。row cell は scalar のみ。 | `title, description?, columns[key,label]?, rows? with scalar cell values only` |
| `NavigationPanel` | `navigation` | compact local tab navigation。main search がない局所タブ用。 | `title, links[label,href]?` |
| `EmptyState` | `app`, `summary`, `rss`, `postgres`, `api`, `markdown`, `navigation` | empty data fallback。 | `title, description?, action?` |
| `ErrorState` | `app`, `summary`, `rss`, `postgres`, `api`, `markdown`, `navigation` | validation / loading error fallback。 | `title, description?` |

## Maintenance Rule

新しいパーツを追加するときは、`componentPropsSchemas`、`componentDefinitions`、`appJsonRenderComponentMap`、`appJsonRenderCatalog`、fixtures、catalog parity tests、Storybook stories、この一覧を同時に更新します。Storybook は `Root App Catalog/Sections` に section 単位で1 storyずつ載せます。

生成 AI が選べるパーツは `componentDefinitions` から provider instructions に流れるため、使わせたくないパーツは catalog から削除します。Storybook は catalog の別 SSoT ではなく、root app catalog を描画確認するための shell として使います。

Section の大刷新は [section-refactor-checklist.md](/Users/y.noguchi/Code/composia-ui/docs/section-refactor-checklist.md) を実行チェックリストとして運用します。

## Selection & Fallback Policy

- Section 選定優先度は `目的適合 > 重複なし > データソース適合 > 視覚バランス`。
- `MainSearchNavigationSection` がある場合、同一目的の `NavigationPanel` や検索用 `FormSection` の併用は避ける。
- props は schema で default 補完される。未指定は可能な限り補完し、unknown/incompatible value は catalog validation で拒否する。
