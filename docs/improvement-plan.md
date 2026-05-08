# Composia UI 改善計画

評価スコアの満点化を目指す段階的改善計画。
セクション component の刷新は対象外（実施済み）。

## 対象領域と目標スコア

| 観点 | 現在 | 目標 | 改善フェーズ |
|------|------|------|------------|
| 実装品質 | ★★★★☆ | ★★★★★ | Phase 1, 2 |
| プロダクト完成度 | ★★★☆☆ | ★★★★★ | Phase 2, 3, 4 |
| 市場適合性 | ★★★★☆ | ★★★★★ | Phase 3 |
| テストカバレッジ | ★★★★☆ | ★★★★★ | Phase 5 |

## Phase 1: 実装品質の構造改善

screen-history service のモノリシック解消と、コードの凝集度を高める。

### 1-1. screen-history.service.ts の責務分割

`api/modules/screen-history/screen-history.service.ts` は 1,199 行に以下の責務が混在している。

| 責務 | 行数推定 | 結合度 |
|------|---------|--------|
| DTO マッピング（mapSession, mapScreenJson, mapLegacyScreen 等） | ~180行 | 低 |
| セッション会話管理（conversation, messages, fallbacks） | ~120行 | 中 |
| プロジェクト・ページルーティング（normalizeProjectPagePath, parseProjectRoutePath） | ~110行 | 低 |
| AI 生成フロー（generate, generateFromAction, edit, regenerate） | ~280行 | 高 |
| CRUD 操作（get, list, delete, restoreCheckpoint） | ~200行 | 中 |
| ヘルパー関数（titleFromPrompt, slugifyPagePath, estimateTokens） | ~80行 | 低 |

分割後のファイル構成:

```
api/modules/screen-history/
├── screen-history.service.ts         ← facade（公開 API のみ、~200行）
├── screen-history.mapper.ts          ← DTO マッピング関数
├── screen-history.conversation.ts    ← 会話・メッセージ・チェックポイント
├── screen-history.project.ts         ← プロジェクトルーティング・ページ正規化
├── screen-history.generation.ts      ← AI 生成フロー（saveScreenJson, buildEditPrompt）
└── screen-history.repository.ts      ← 変更なし
```

分割方針:

- `createScreenHistoryService()` は facade として残し、分割した module の関数を呼び出す。
- 分割した module はそれぞれ単体テスト可能にする（repository を DI で受ける）。
- mapper と project routing は pure function として切り出し、テストの独立性を上げる。

影響テスト:

- `tests/modules.screen-history.service.test.ts` (37KB) を分割後のモジュールに合わせてリファクタする。
- facade レベルの結合テストは既存テストのうち主要フローのみ残す。

### 1-2. AI provider の抽象化強化

`api/modules/ai/ai.provider.ts` (577行) 内で `createOpenAiResponsesLayoutProvider` と `createAzureOpenAiLayoutProvider` がほぼ同じ構造を重複実装している。

共通パターン: `instructions + input + schema → fetch → extract text → parseJsonText`

リファクタ後:

```typescript
// 新設: api/modules/ai/ai.provider-base.ts

type ProviderConfig = {
  buildRequest: (params: GenerateJsonParams) => { url: string; init: RequestInit };
  extractText: (payload: Record<string, unknown>) => string;
  name: string;
};

function createJsonProvider(config: ProviderConfig): AiLayoutProvider {
  const generateJson = async (params: GenerateJsonParams) => {
    const { url, init } = config.buildRequest(params);
    const response = await fetch(url, init);
    const payload = await parseProviderResponse(response);
    logger.info({ name: params.name, usage: payload.usage }, `${config.name} response`);
    return parseJsonText(config.extractText(payload));
  };

  return {
    classify: (input) => generateJson({ instructions: classificationInstructions, ... }),
    generateLayout: (prompt) => generateJson({ instructions: layoutInstructions, ... }),
    generateNavigation: (input) => generateJson({ instructions: navigationInstructions, ... }),
    summarize: (input) => generateJson({ instructions: summaryInstructions, ... }),
  };
}
```

利点:

- 新 provider 追加が `ProviderConfig` 1つの定義で済む（Phase 3 の Anthropic / Gemini 対応の前提）。
- `generateJson` 内のロギング・エラーハンドリングが一箇所に集約される。

## Phase 2: Production Observability

本番運用に耐える可観測性を確立する。

### 2-1. 構造化ログの強化

現状:

- `api/lib/logger.ts` — Pino 基本設定のみ（18行）。
- `api/middleware/logger.ts` — requestId + method/path/status/duration のみ（27行）。
- AI provider のログは `logger.info({ name, payload })` で payload 全体をダンプしている。

改善内容:

#### ログコンテキストの拡充

```typescript
// api/middleware/logger.ts — 改善版
export const loggerMiddleware = () => {
  return createMiddleware<AppEnv>(async (c, next) => {
    const requestId = crypto.randomUUID();
    const logger = globalLogger.child({
      requestId,
      userId: c.get('userId') ?? 'anonymous',
      path: c.req.path,
      method: c.req.method,
    });
    c.set('logger', logger);
    c.header('X-Request-Id', requestId);

    const start = performance.now();
    await next();

    const durationMs = Math.round(performance.now() - start);
    const level = c.res.status >= 500 ? 'error' : c.res.status >= 400 ? 'warn' : 'info';
    logger[level]({ status: c.res.status, durationMs }, 'Request completed');
  });
};
```

#### AI provider ログの安全化

```typescript
// ai.provider.ts — payload 全体のダンプを制限
logger.info(
  {
    name,
    model: config.OPENAI_MODEL,
    inputTokenEstimate: Math.ceil(input.length / 3),
    usage: payload.usage,
    outputTokens: payload.usage?.completion_tokens,
  },
  'OpenAI response received'
);
```

#### Pino 設定の本番対応

```typescript
// api/lib/logger.ts — 改善版
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...(process.env.NODE_ENV !== 'production'
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
        },
      }
    : {}),
  redact: {
    paths: ['*.apiKey', '*.api-key', '*.authorization', '*.OPENAI_API_KEY'],
    censor: '[REDACTED]',
  },
  serializers: { err: pino.stdSerializers.err },
});
```

### 2-2. ヘルスチェックの拡充

現状 `/api/health` は liveness のみ。readiness エンドポイントを追加する。

```typescript
// api/routes/health.ts — readiness 追加
healthRouter.get('/ready', async (c) => {
  const checks = await Promise.allSettled([
    db.execute(sql`SELECT 1`),
    cacheService.get('health', 'ping'),
  ]);

  const status = checks.every((r) => r.status === 'fulfilled') ? 'ok' : 'degraded';
  return c.json({
    status,
    checks: {
      database: checks[0].status === 'fulfilled' ? 'ok' : 'fail',
      cache: checks[1].status === 'fulfilled' ? 'ok' : 'fail',
    },
    uptime: process.uptime(),
  }, status === 'ok' ? 200 : 503);
});
```

### 2-3. Server-Timing 強化

`timing()` middleware は組み込み済みだが、AI 呼び出しの内訳が不明。routes 側で activities の計測結果を `Server-Timing` ヘッダーに反映するユーティリティを追加する。

## Phase 3: AI Provider 拡張と Image Allowlist

市場適合性を最大化する。

### 3-1. Image Allowlist の設定外部化

現状 `allowedImageHostnames` がハードコードされた `Set(['picsum.photos'])` になっている。

改善:

```typescript
// shared/schemas/app-catalog.schema.ts — 設定外部化
const defaultImageHostnames = ['picsum.photos'];
let _allowedImageHostnames = new Set(defaultImageHostnames);

export function configureAllowedImageHostnames(hostnames: string[]) {
  _allowedImageHostnames = new Set([...defaultImageHostnames, ...hostnames]);
}

export const imageUrlSchema = z
  .string()
  .trim()
  .url()
  .refine(
    (src) => {
      const url = new URL(src);
      return url.protocol === 'https:' && _allowedImageHostnames.has(url.hostname);
    },
    { message: 'image src must be an allowed HTTPS image URL' }
  );
```

環境変数:

```
# .env
IMAGE_ALLOWED_HOSTS=picsum.photos,cdn.example.com,images.unsplash.com
```

config.ts への追加:

```typescript
IMAGE_ALLOWED_HOSTS: z.string().trim().default('').transform(
  (v) => v.split(',').map(h => h.trim()).filter(Boolean)
),
```

起動時に設定を注入:

```typescript
// api/index.ts
configureAllowedImageHostnames(config.IMAGE_ALLOWED_HOSTS);
```

provider instructions にも動的 allowlist を反映する。

### 3-2. マルチ LLM Provider 対応

Phase 1-2 で作成した `createJsonProvider` ベース関数を使い、以下を追加する。

#### Anthropic Claude 対応

```typescript
// 新設: api/modules/ai/providers/anthropic.provider.ts
export function createAnthropicProvider(): AiLayoutProvider {
  return createJsonProvider({
    name: 'Anthropic',
    buildRequest: ({ input, instructions }) => ({
      url: 'https://api.anthropic.com/v1/messages',
      init: {
        method: 'POST',
        headers: {
          'x-api-key': config.ANTHROPIC_API_KEY!,
          'anthropic-version': '2025-01-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.ANTHROPIC_MODEL,
          max_tokens: aiJsonMaxOutputTokens,
          system: instructions,
          messages: [{ role: 'user', content: input }],
        }),
      },
    }),
    extractText: (payload) => {
      const content = (payload as any).content;
      const textBlock = content?.find((b: any) => b.type === 'text');
      if (!textBlock?.text) throw providerError('Anthropic response had no text');
      return textBlock.text;
    },
  });
}
```

#### Google Gemini 対応

同様のパターンで Google Generative AI API に接続する。

#### config.ts の拡張

```typescript
ANTHROPIC_API_KEY: z.string().trim().optional(),
ANTHROPIC_MODEL: z.string().trim().default('claude-sonnet-4-20250514'),
GOOGLE_AI_API_KEY: z.string().trim().optional(),
GOOGLE_AI_MODEL: z.string().trim().default('gemini-2.5-flash'),
```

#### Provider 選択ロジック

```typescript
// api/modules/ai/ai.provider.ts
export function createDefaultAiLayoutProvider(): AiLayoutProvider {
  if (config.AZURE_OPENAI_API_KEY && ...) return createAzureOpenAiLayoutProvider();
  if (config.OPENAI_API_KEY) return createOpenAiResponsesLayoutProvider();
  if (config.ANTHROPIC_API_KEY) return createAnthropicProvider();
  if (config.GOOGLE_AI_API_KEY) return createGeminiProvider();
  return { generateLayout: async () => { throw ... } };
}
```

## Phase 4: プロダクション対応

本番デプロイ可能な状態にする。

### 4-1. Bundle Code Splitting

現状 `vite.config.ts` に `build.rollupOptions` の設定がなく、全コードが単一バンドルになっている。

改善:

```typescript
// vite.config.ts — build 設定追加
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-tanstack': [
            '@tanstack/react-query',
            '@tanstack/react-router',
            '@tanstack/react-table',
          ],
          'vendor-recharts': ['recharts'],
          'vendor-radix': ['radix-ui'],
          'vendor-json-render': ['@json-render/core', '@json-render/react'],
        },
      },
    },
    chunkSizeWarningLimit: 500,
  },
});
```

TanStack Router の route-based splitting も導入する。

### 4-2. Graceful Shutdown

現状 `api/index.ts` にシャットダウン処理がない。

追加:

```typescript
// api/index.ts
const server = serve({ fetch: app.fetch, port: config.PORT });

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Shutdown signal received');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

### 4-3. エラートラッキング準備

`errorHandler` でログ出力のみの状態を改善し、エラートラッキングサービスへの送信 hook を準備する。

```typescript
// api/middleware/error-handler.ts
export type ErrorReporter = {
  captureException: (error: Error, context: Record<string, unknown>) => void;
};

let _reporter: ErrorReporter | null = null;
export function configureErrorReporter(reporter: ErrorReporter) {
  _reporter = reporter;
}

// errorHandler 内で 5xx の場合に reporter へ送信
if (status >= 500) {
  _reporter?.captureException(err, { requestId, path, method, userId });
}
```

## Phase 5: テストカバレッジ強化

テスト観点の網羅性を高める。

### 5-1. 不足テスト領域

| 領域 | 現在のカバー | 不足テスト |
|------|-------------|-----------|
| AI provider 正規化 | 基本テスト | FormSection options edge case、DataTable nested object 変換 |
| Image allowlist | schema テスト内で部分的 | hostname 動的変更後の validation、protocol 攻撃パターン |
| Project routing | `project-link-routing` テスト有り | `normalizeProjectPagePath` の全分岐 |
| Session conversation | service テスト内 | `messagesWithFallbacks` 混在ケース |
| Frontend hooks | テストなし | TanStack Query hooks の loading/error/success 状態 |

### 5-2. 追加テストファイル

```
tests/
├── screen-history.mapper.test.ts
├── screen-history.project-routing.test.ts
├── screen-history.conversation.test.ts
├── ai.provider-base.test.ts
├── image-allowlist.test.ts
├── health-ready.test.ts
└── e2e/
    └── prompt-generation.spec.ts
```

### 5-3. テストカバレッジ目標

| カテゴリ | 現在（推定） | 目標 |
|---------|-------------|------|
| 行カバレッジ | ~65% | 80%+ |
| 分岐カバレッジ | ~55% | 75%+ |
| AI provider | ~60% | 90%+ |
| Screen history | ~70% | 85%+ |
| Shared schemas | ~80% | 95%+ |

### 5-4. CI パイプライン

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test run --coverage
      - run: pnpm build
```

## Phase 6: ドキュメント・DX 改善

### 6-1. API ドキュメント強化

各 route ファイルの OpenAPI description と example を充実させる。

### 6-2. エラーコード体系

```typescript
// api/lib/error-codes.ts
export const ErrorCodes = {
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AI_PROVIDER_NOT_CONFIGURED: 'AI_PROVIDER_NOT_CONFIGURED',
  AI_PROVIDER_ERROR: 'AI_PROVIDER_ERROR',
  AI_SCHEMA_VALIDATION_FAILED: 'AI_SCHEMA_VALIDATION_FAILED',
  AI_CATALOG_VALIDATION_FAILED: 'AI_CATALOG_VALIDATION_FAILED',
  SCREEN_NOT_FOUND: 'SCREEN_NOT_FOUND',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
} as const;
```

## 実行順序と見積り

| Phase | 内容 | 見積り |
|-------|------|--------|
| 1 | screen-history 分割 + AI provider 抽象化 | 2日 |
| 2 | 構造化ログ強化・ヘルスチェック・計測 | 1.5日 |
| 3 | Image allowlist 外部化 + Anthropic / Gemini 対応 | 2日 |
| 4 | Code splitting + Graceful shutdown | 1日 |
| 5 | テスト追加 + CI パイプライン | 1.5日 |
| 6 | ドキュメント・エラーコード体系 | 0.5日 |
| **合計** | | **約 8.5 日** |

Phase 1-2 は他のすべての改善の基盤となるため最優先で着手する。特に AI provider の抽象化は Phase 3 のマルチ LLM 対応の前提条件となる。

## 完了時の想定スコア

| 観点 | 現在 | Phase 1-2 後 | Phase 3-4 後 | 全 Phase 完了後 |
|------|------|-------------|-------------|----------------|
| アーキテクチャ設計 | ★★★★★ | ★★★★★ | ★★★★★ | ★★★★★ |
| 実装品質 | ★★★★☆ | ★★★★★ | ★★★★★ | ★★★★★ |
| 技術的差別化 | ★★★★★ | ★★★★★ | ★★★★★ | ★★★★★ |
| プロダクト完成度 | ★★★☆☆ | ★★★★☆ | ★★★★★ | ★★★★★ |
| 市場適合性 | ★★★★☆ | ★★★★☆ | ★★★★★ | ★★★★★ |
| 保守性・拡張性 | ★★★★★ | ★★★★★ | ★★★★★ | ★★★★★ |
| テストカバレッジ | ★★★★☆ | ★★★★☆ | ★★★★☆ | ★★★★★ |
