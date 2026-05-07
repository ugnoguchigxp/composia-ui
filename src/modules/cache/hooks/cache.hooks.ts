import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CacheInvalidateRequest } from '../../../../shared/schemas/cache.schema';
import { cacheRepository } from '../repositories/cache.repository';

export const cacheQueryKeys = {
  status: ['cache', 'status'] as const,
};

export function useCacheStatus() {
  return useQuery({
    queryKey: cacheQueryKeys.status,
    queryFn: cacheRepository.status,
  });
}

export function useInvalidateCache() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CacheInvalidateRequest) => cacheRepository.invalidate(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: cacheQueryKeys.status }),
  });
}

export function useRebuildCache() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: cacheRepository.rebuild,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: cacheQueryKeys.status }),
  });
}
