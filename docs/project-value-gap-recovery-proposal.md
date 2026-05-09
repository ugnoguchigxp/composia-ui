# Project Value Gap Recovery Proposal

## 目的

前回の多角評価で減点対象になった項目を、価値評価を引き上げるための実行計画に落とす。

この提案書のゴールは、Composia UI を「動く AI UI 生成 MVP」から「安全に運用できる業務 UI 生成ランタイム」へ進めることである。汎用 AI app builder と正面衝突せず、次の差別化軸を強める。

- schema / catalog / registry による AI 出力制御
- generated screen の履歴再現と action 分岐
- SandboxDB current state を正とする DBDesign
- 業務 UI と実データ操作をつなぐ controlled runtime
- production readiness を判断できる検証証跡

## 前回評価の減点項目

| 項目 | 減点理由 | 現状の証跡 | 優先度 |
| --- | --- | --- | --- |
| E2E smoke の不一致 | navigation smoke が旧 UI 文言 `Prompt` / `History` を期待して失敗する | `pnpm test:e2e:smoke` で 7 件中 1 件失敗 | P0 |
| bundle size warning | production build は成功するが frontend main chunk が 500 kB 閾値を超える | `pnpm build` で `index-*.js` が約 1.69 MB | P1 |
| Storybook bundle warning | catalog 確認面も大きい chunk warning が出る | `pnpm build-storybook` は成功するが複数 chunk warning | P2 |
| golden prompt / screenshot regression 未整備 | 生成 UI 品質を継続評価する証跡が不足 | README の未完項目にも記載済み | P1 |
| action `submit` の実データ mutation 未連携 | `generate-screen` / `navigate` はあるが、業務操作としての submit がまだ弱い | README の未完項目にも記載済み | P1 |
| source refresh の運用導線不足 | source ingestion はあるが、運用 UI / scheduling が弱い | README の未完項目にも記載済み | P2 |
| production observability 不足 | 本番判断に必要なログ、メトリクス、エラー分類、provider latency が不足 | README の未完項目にも記載済み | P1 |
| design token / theme authoring 未整理 | root app catalog はあるが、token/theme の変更運用が明文化されていない | README の未完項目にも記載済み | P2 |
| docs drift | README に存在しない `docs/design-system-sync-plan.md` へのリンクが残っていた | docs 一覧に該当ファイルなし | P0 |
| 市場ポジションの曖昧さ | 汎用 app builder と比較すると競合が強い | 差別化軸を docs / demo / evaluation に固定する必要あり | P1 |

## 推奨する実行順

### Phase 0: 評価証跡を green に戻す

目的: 評価時に「テストは概ね通るが smoke が落ちる」と見られる状態を解消する。

実施内容:

1. `tests/e2e/navigation.spec.ts` を現在の root navigation に合わせる。
   - `Prompt` / `History` 期待を `UIDesign` / `DBDesign` / `Media` に更新する。
   - `/prompt` への主導線は top nav ではなく home の `Start prompting` CTA で検証する。
2. README の docs セクションから存在しない `docs/design-system-sync-plan.md` を削除する。
3. 新しい価値改善提案書を README から参照できるようにする。

受け入れ条件:

- `pnpm verify` が通る。
- `pnpm test:e2e:smoke` が通る。
- `rg "design-system-sync-plan" README.md docs --glob '!project-value-gap-recovery-proposal.md'` が空になる。

対象ファイル:

- `tests/e2e/navigation.spec.ts`
- `README.md`
- `docs/project-value-gap-recovery-proposal.md`

### Phase 1: production readiness を測れる状態にする

目的: 「実装は良いが本番運用判断がまだ弱い」という減点を解消する。

実施内容:

1. AI / DBDesign / screen-history の主要処理に共通 trace context を通す。
   - `requestId`
   - `userId`
   - `provider`
   - `model`
   - `durationMs`
   - `schemaSectionCount`
   - `validationResult`
2. provider payload 全体をログに出さず、usage / latency / response size / validation error summary に限定する。
3. `Server-Timing` または response activities に provider latency、schema validation、catalog validation、render preparation の内訳を安定して出す。
4. readiness を次の粒度で返す。
   - main DB
   - SandboxDB
   - AI provider configured
   - media storage writable

受け入れ条件:

- `/api/health/ready` が degraded 理由を JSON で返す。
- AI provider 未設定時も 503 の理由が明確で、frontend で回復可能な文言になる。
- provider request / validation failure のログに secret や provider raw payload が出ない。
- `tests/health.test.ts` と AI route tests に readiness / degraded cases が追加される。

対象ファイル:

- `api/routes/health.ts`
- `api/lib/logger.ts`
- `api/middleware/logger.ts`
- `api/modules/ai/*`
- `api/modules/database-design/*`
- `tests/health.test.ts`
- `tests/routes.ai.test.ts`

### Phase 2: 生成 UI 品質を回帰検知できるようにする

目的: 「良い生成結果がたまたま出た」ではなく、catalog の品質を継続的に担保する。

実施内容:

1. golden prompt fixture を追加する。
   - operations dashboard
   - ecommerce catalog
   - data table with binding
   - form with submit action
   - DBDesign-bound screen
2. AI provider mock から App UI Schema を生成し、次を検証する。
   - schema validation
   - catalog validation
   - visible text に生成メカニクス文言が出ないこと
   - app-relative link invariant
   - unsafe image URL rejection
3. Playwright screenshot regression を最小構成で追加する。
   - `/prompt/session/:sessionId` の replay
   - catalog story matrix の representative sections
   - mobile width で text overflow がないこと
4. screenshot は最初から全セクションに広げず、失敗価値が高い 5-8 画面に絞る。

受け入れ条件:

- `pnpm verify` に golden prompt schema tests が含まれる。
- `pnpm test:e2e:smoke` とは別に `pnpm test:e2e:visual` を追加できる。
- screenshot 差分は CI なしでもローカルで更新・確認できる。

対象ファイル:

- `tests/fixtures/*`
- `tests/ai-output-fixtures.test.ts`
- `tests/ui-schema-invariants.test.ts`
- `tests/e2e/*`
- `package.json`
- `playwright.config.ts`

### Phase 3: `submit` を実データ操作へつなぐ

目的: generated UI を閲覧・分岐だけでなく、業務操作の入り口にする。

実施内容:

1. `AppAction.kind = "submit"` の責務を明確化する。
   - dataBindingId がある FormSection のみ実行可能
   - target table は SandboxDB managed table のみ
   - client から渡された table 名や binding を信用しない
2. `PromptWorkspace` の submit flow を `useInsertSandboxRow` / update mutation と接続する。
3. runtime validation を通した後だけ SandboxDB に mutation する。
4. submit 成功後に binding rows を invalidate し、画面内 preview を更新する。
5. submit action は page generation と混ぜない。

受け入れ条件:

- submit action は unknown binding / unmanaged table / invalid payload を拒否する。
- submit 成功後に bound DataTableSection / CardGridSection が更新される。
- service tests と renderer tests に submit flow が入る。
- generated screen replay は submit action を持っていても LLM を呼ばず再描画できる。

対象ファイル:

- `shared/schemas/ui-schema.schema.ts`
- `src/modules/screen-history/components/PromptWorkspace.tsx`
- `src/modules/screen-history/services/binding-runtime.service.ts`
- `src/modules/database-design/hooks/database-design.hooks.ts`
- `api/modules/database-design/sandbox-query.service.ts`
- `tests/binding-runtime.service.test.ts`
- `tests/ui-schema-renderer.test.tsx`

### Phase 4: bundle / Storybook の分割

目的: production build の警告を解消し、画面追加に耐える frontend 構造にする。

実施内容:

1. route 単位の lazy loading を導入する。
   - `/prompt`
   - `/history`
   - `/dbdesign`
   - `/media`
2. heavy component を route-local import に寄せる。
   - Recharts sections
   - DBDesign workspace
   - MediaLibrary
   - Storybook catalog fixtures
3. Vite manualChunks は最小限にする。
   - `react-vendor`
   - `tanstack-vendor`
   - `charts-vendor`
4. Storybook は docs renderer と catalog story chunk を分ける。

受け入れ条件:

- `pnpm build` の 500 kB warning が消える、または意図した chunk warning limit と根拠が docs に残る。
- initial route の JS が 500 kB 未満を目標にする。
- `pnpm build-storybook` の warning が消える、または catalog story chunk の許容理由が明記される。

対象ファイル:

- `src/routes/*`
- `vite.config.ts`
- `.storybook/*`
- `src/modules/component-registry/components/component-catalog.stories.tsx`

### Phase 5: source refresh を運用導線にする

目的: data context を一回きりの登録ではなく、業務データ更新の運用機能にする。

実施内容:

1. `/sources` または settings surface を復活させるのではなく、必要最小限の source refresh panel を UIDesign / DBDesign に統合する。
2. source ごとに次を表示する。
   - lastRefreshedAt
   - lastStatus
   - itemCount
   - lastError
3. refresh は手動操作を先に実装し、scheduler は後段にする。
4. scheduler を入れる場合も、まず DB-backed job state を持つ。

受け入れ条件:

- source refresh の成功 / 失敗が UI と API で確認できる。
- AI layout context が stale source を識別できる。
- failed source が provider prompt を汚さない。

対象ファイル:

- `api/modules/sources/*`
- `src/modules/sources/*`
- `api/modules/ai/ai.service.ts`
- `tests/modules.sources.service.test.ts`
- `tests/routes.sources.test.ts`

### Phase 6: 市場ポジションを固定する

目的: 汎用 app builder ではなく、Composia UI の勝ち筋を明確にする。

提案する positioning:

> Composia UI is a governed AI UI runtime for internal and operational applications. It turns prompts and data context into catalog-validated screens, preserves replayable ScreenJSON history, and connects generated UI to SandboxDB state without letting the model emit arbitrary code.

日本語では次のように扱う。

> Composia UI は、社内・業務アプリ向けの governed AI UI runtime である。自然言語とデータ文脈から catalog 検証済みの画面を生成し、ScreenJSON として再現可能に保存し、SandboxDB の現在状態と接続する。AI に任意の code / SQL を生成させない。

実施内容:

1. README 冒頭をこの positioning に合わせて短く強化する。
2. demo prompt を 3 本に絞る。
   - operations dashboard
   - internal data management app
   - DBDesign-bound workflow
3. comparison doc を追加する。
   - generic app builder との差
   - no-code tool との差
   - design-system-only tool との差
4. security / governance の価値を feature として明文化する。

受け入れ条件:

- README を読めば、競合と違う理由が 30 秒で分かる。
- demo が prompt generation だけでなく replay / action branch / DBDesign を含む。
- 「何でも作れる」ではなく「安全に運用できる生成 UI runtime」として説明が統一される。

対象ファイル:

- `README.md`
- `docs/project_plan.md`
- `docs/component-catalog.md`
- 新規 `docs/positioning.md`

## 実行ロードマップ

| 週 | 実施内容 | 完了条件 |
| --- | --- | --- |
| Week 1 | Phase 0 | `verify` / `e2e:smoke` green、docs drift 解消 |
| Week 2 | Phase 1 | readiness / structured logs / degraded tests |
| Week 3 | Phase 2 | golden prompt tests と最小 visual regression |
| Week 4 | Phase 3 | submit -> SandboxDB mutation の closed loop |
| Week 5 | Phase 4 | build / Storybook chunk warning 解消 |
| Week 6 | Phase 5-6 | source refresh operational surface、positioning docs |

## 成功指標

### 技術評価

- `pnpm verify` green
- `pnpm test:e2e:smoke` green
- `pnpm build` warning なし、または許容 warning が明文化済み
- `pnpm build-storybook` warning なし、または許容 warning が明文化済み
- golden prompt schema tests が通常 verify に含まれる
- visual regression が主要 generated UI をカバーする

### プロダクト評価

- prompt 生成、history replay、action branch、DBDesign、submit mutation が 1 本の demo flow としてつながる
- generated UI が「見るだけ」ではなく、SandboxDB に対する安全な操作 UI になる
- source context の鮮度が UI と provider context の両方で扱える

### 市場評価

- README / demo / docs が governed runtime として一貫する
- 汎用 AI app builder との差分が、code generation 量ではなく governance / replay / DB state に置かれている
- 社内業務アプリ、ops dashboard、data management app の利用シーンに絞れている

## 実装開始の推奨

最初に着手するべきは Phase 0 である。理由は、価値評価の足元になる品質証跡が最短で改善されるためである。

Phase 0 は影響範囲が小さく、失敗しても rollback が容易で、次の production readiness 作業の前提になる。Phase 0 完了後に Phase 1 と Phase 2 を並行して進めるのが最も効率が良い。
