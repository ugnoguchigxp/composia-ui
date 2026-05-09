# Composia UI Positioning

## 定義

Composia UI は、社内・業務アプリ向けの **governed AI UI runtime** である。

自然言語とデータ文脈から catalog 検証済みの画面を生成し、ScreenJSON として再現可能に保存し、SandboxDB の現在状態と接続する。AI には任意の code / SQL を生成させない。

## どこで勝つか

1. **Governance first**
   - App UI Schema + component catalog + renderer registry で AI の出力語彙を制御する。
   - 生成結果は schema / catalog validation を通過したものだけ保存・表示する。

2. **Replayable runtime**
   - 生成画面は ScreenJSON として履歴保存され、再生成なしで再現できる。
   - action 分岐を履歴に接続し、対話の流れを追跡できる。

3. **State-connected operations**
   - SandboxDB の managed state を基準に、DBDesign と画面生成を連動させる。
   - 生成 UI を業務データ操作に接続する前提で、安全境界を明示する。

## 比較

### 汎用 AI app builder との差

- 汎用 builder は code 生成や自由度を価値に置きやすい。
- Composia UI は **制約された生成 + 検証 + 再現性** を価値に置く。

### no-code ツールとの差

- no-code は静的な画面設計と手動更新が中心になりやすい。
- Composia UI は prompt 起点の画面生成と ScreenJSON replay を運用フローに組み込む。

### design-system-only ツールとの差

- design system 単体は UI 部品の整合性を担保するが、生成・履歴・分岐の runtime は持たない。
- Composia UI は catalog を runtime 制御面として使い、生成結果の安全性と再現性まで担保する。

## 推奨デモ導線

1. operations dashboard 生成
2. internal data management app 生成
3. DBDesign-bound workflow（DB 設計と画面再現の接続）

