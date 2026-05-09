import { z } from 'zod';
import type { SourceRefreshStatus } from '../../../shared/schemas/sources.schema';
import { logger } from '../../lib/logger';

export const sourceRefreshStateCacheNamespace = 'source-refresh-state';
export const sourceRefreshStaleWindowMs = 1000 * 60 * 60 * 24;

export const sourceRefreshRuntimeStateSchema = z
  .object({
    lastRefreshedAt: z.string().datetime(),
    lastStatus: z.enum(['success', 'failed']),
    itemCount: z.number().int().nonnegative(),
    lastError: z.string().min(1).optional(),
  })
  .strict();

export type SourceRefreshRuntimeState = z.infer<typeof sourceRefreshRuntimeStateSchema>;

export type SourceRefreshStateCache = {
  get: (
    namespace: string,
    key: string
  ) => Promise<{
    entry: { value: unknown } | null;
  }>;
  set: (input: {
    namespace: string;
    key: string;
    value: unknown;
    expiresAt?: string | null;
  }) => Promise<unknown>;
};

export async function readSourceRefreshRuntimeState(
  cache: SourceRefreshStateCache,
  sourceId: string
): Promise<SourceRefreshRuntimeState | null> {
  try {
    const entry = await cache.get(sourceRefreshStateCacheNamespace, sourceId);
    if (!entry.entry) return null;
    const parsed = sourceRefreshRuntimeStateSchema.safeParse(entry.entry.value);
    return parsed.success ? parsed.data : null;
  } catch (error) {
    logger.warn(
      {
        error: error instanceof Error ? error.message : String(error),
        sourceId,
      },
      'Source refresh runtime state read failed; continuing without runtime state'
    );
    return null;
  }
}

export async function writeSourceRefreshRuntimeState(
  cache: SourceRefreshStateCache,
  sourceId: string,
  runtimeState: SourceRefreshRuntimeState
) {
  try {
    await cache.set({
      namespace: sourceRefreshStateCacheNamespace,
      key: sourceId,
      value: runtimeState,
    });
  } catch (error) {
    logger.warn(
      {
        error: error instanceof Error ? error.message : String(error),
        sourceId,
      },
      'Source refresh runtime state write failed; continuing without persisted runtime state'
    );
  }
}

export function resolveSourceRefreshStatus(
  runtimeState: SourceRefreshRuntimeState | null,
  nowMs = Date.now()
): SourceRefreshStatus {
  if (!runtimeState) return 'idle';
  if (runtimeState.lastStatus === 'failed') return 'failed';
  const refreshedAtMs = Date.parse(runtimeState.lastRefreshedAt);
  if (!Number.isFinite(refreshedAtMs)) return 'success';
  return nowMs - refreshedAtMs > sourceRefreshStaleWindowMs ? 'stale' : 'success';
}
