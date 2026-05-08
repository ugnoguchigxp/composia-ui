# Section Refresh Plan & Checklist

最終更新: 2026-05-08

## 目的

- Section の品質を `shadcn/ui + Tailwind v4` 基準へ揃える
- AI 生成の自由度は維持しつつ、catalog/schema で壊れない構成にする
- Storybook を root app catalog の中粒度 Section カタログとして運用する

## 完了条件 (Definition of Done)

- [x] 主要 Section が共通の Section Shell で統一されている
- [x] 見切れ・重複・過剰誘導 UI が再発しない
- [x] 必須/任意 props 設計が整理され、`VALIDATION_ERROR` が実運用で減る
- [x] Storybook で全 Section の通常/空/境界ケースを確認できる
- [x] `pnpm verify` と `pnpm build-storybook` が通る

## Scope

対象:

- `src/modules/component-registry/components/sections/*`
- `shared/schemas/app-catalog.schema.ts`
- `src/modules/component-registry/components/registry.tsx`
- `src/modules/component-registry/services/catalog.service.ts`
- `api/modules/ai/ai.provider.ts`
- `src/modules/component-registry/components/catalog-story-fixtures.ts`
- `src/modules/component-registry/components/component-catalog.stories.tsx`
- `tests/*catalog*`, `tests/ui-schema-renderer.test.tsx`, `tests/ai.provider.test.ts`

非対象:

- 低レベル部品を AI 語彙として直接露出すること
- `designSystem/` を runtime 依存として復帰させること

## Phase Checklist

### Phase 0: 現状固定と監査

- [ ] 現在の Section 一覧・責務・重複を監査表にまとめる
- [ ] Storybook と Vitest の現行結果を基準として保存する
- [ ] 削除候補 / 統合候補 / 刷新候補を合意する

成果物:

- Section 監査表（責務、重複、課題、移行先）

### Phase 1: 共通基盤 (Section Shell)

- [x] `SectionShell` を新規追加
- [ ] `SectionHeader` / `SectionActions` / `EmptyState` を共通化
- [x] `MainSearchNavigationSection` を共通基盤に載せ替え
- [x] `CardGridSection` を共通基盤に載せ替え
- [x] `DataTableSection` を共通基盤に載せ替え
- [x] `FormSection` を共通基盤に載せ替え
- [x] `StepperSection` を共通基盤に載せ替え

成果物:

- Section の余白・境界・見出し・操作部のデザイン一貫性

### Phase 2: Section 再編 (削除/統合/刷新)

- [ ] 重複価値の低い Section を catalog から削除
- [ ] 機能重複する Section を統合
- [ ] shadcn/create のトーンで主要 Section を再設計
- [ ] 追加する中粒度 Section 候補を最小構成で導入

成果物:

- 少数精鋭の Section 構成

### Phase 3: Catalog/Schema の堅牢化

- [x] `app-catalog.schema.ts` の必須/任意 props を再整理
- [x] default 補完ポリシーを明文化
- [x] invalid props の扱い（切り落とし/警告）を統一
- [x] schema/registry/provider の整合テストを追加・更新

成果物:

- AI 提案が多少揺れても renderer 側で破綻しない

### Phase 4: Storybook カタログ強化

- [x] 全 Section に Story を用意
- [x] 各 Section の empty/boundary story を追加
- [x] 実運用シナリオ Story（EC / Dashboard / Form）を整備

成果物:

- 中粒度 Section の可視化カタログ運用

### Phase 5: 品質ゲートと移行完了

- [x] `pnpm verify` 通過
- [x] `pnpm build-storybook` 通過
- [x] `docs/component-catalog.md` を最終更新
- [x] `docs/project_plan.md` に運用ルールを反映
- [x] 旧 `designSystem/` の扱いを最終確定（参照のみ/削除）

成果物:

- 継続運用可能な Section 基盤

## Selection Rules (AI Component Picking)

- [x] 同等機能の Section 同時採用を禁止する重複抑制ルールを実装
- [x] 採用優先度を `目的適合 > 重複なし > データ接続可能性 > 視覚バランス` に統一
- [x] 廃止 Section を provider instructions から除外
- [x] 生成時の補完・バリデーションエラー理由を改善

## 実装順序 (推奨)

1. SectionShell の導入と主要 5 Section の載せ替え
2. 重複 Section 削除と schema 任意化整理
3. Storybook の全 Section 整備
4. verify/build-storybook のゲート通過

## Command Checklist

```bash
pnpm test --run tests/component-catalog.parity.test.ts tests/ui-schema-renderer.test.tsx tests/ai.provider.test.ts
pnpm verify
pnpm build-storybook
```

## 実施ログ

- 2026-05-08:
  - `SectionShell` 追加
  - `MainSearchNavigationSection` / `CardGridSection` / `DataTableSection` / `FormSection` / `StepperSection` を共通 Shell 化
  - AI レイアウト正規化に重複抑制（`MainSearchNavigationSection` + `NavigationPanel` の同時採用回避、同種Section重複の排除）を追加
  - provider instruction に重複回避ルールを追加
  - Storybook に `SectionEdgeCases` を追加（空/境界ケース）
  - 型・UI回帰確認として `pnpm typecheck` と指定 Vitest を実行し通過
  - 最終ゲート `pnpm verify` / `pnpm build-storybook` を実行し通過
