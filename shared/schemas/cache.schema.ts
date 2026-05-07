import { z } from 'zod';

export const cacheKeySchema = z
  .object({
    namespace: z.string().min(1),
    key: z.string().min(1),
  })
  .strict();

export const cacheEntrySchema = z
  .object({
    namespace: z.string().min(1),
    key: z.string().min(1),
    value: z.unknown(),
    expiresAt: z.string().datetime().nullable().optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const cacheSetRequestSchema = z
  .object({
    namespace: z.string().min(1),
    key: z.string().min(1),
    value: z.unknown(),
    expiresAt: z.string().datetime().nullable().optional(),
  })
  .strict();

export const cacheInvalidateRequestSchema = z
  .object({
    namespace: z.string().min(1).optional(),
    key: z.string().min(1).optional(),
  })
  .strict();

export const cacheStatusSchema = z
  .object({
    totalEntries: z.number().int().nonnegative(),
    namespaces: z.array(
      z
        .object({
          namespace: z.string().min(1),
          entries: z.number().int().nonnegative(),
        })
        .strict()
    ),
  })
  .strict();

export const cacheEntryResponseSchema = z
  .object({
    entry: cacheEntrySchema.nullable(),
  })
  .strict();

export const cacheMutationResponseSchema = z
  .object({
    success: z.boolean(),
  })
  .strict();

export type CacheKey = z.infer<typeof cacheKeySchema>;
export type CacheEntry = z.infer<typeof cacheEntrySchema>;
export type CacheSetRequest = z.infer<typeof cacheSetRequestSchema>;
export type CacheInvalidateRequest = z.infer<typeof cacheInvalidateRequestSchema>;
export type CacheStatus = z.infer<typeof cacheStatusSchema>;
export type CacheEntryResponse = z.infer<typeof cacheEntryResponseSchema>;
