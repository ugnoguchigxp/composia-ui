import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MediaListQuery, MediaUpdateRequest } from '../../../../shared/schemas/media.schema';
import { mediaRepository } from '../repositories/media.repository';

export const mediaQueryKeys = {
  all: ['media'] as const,
  lists: () => [...mediaQueryKeys.all, 'list'] as const,
  list: (query: MediaListQuery) => [...mediaQueryKeys.lists(), query] as const,
};

export function useMediaAssets(query: MediaListQuery, enabled = true) {
  return useQuery({
    enabled,
    queryKey: mediaQueryKeys.list(query),
    queryFn: () => mediaRepository.list(query),
  });
}

export function useUploadMediaAssets() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (files: File[]) => Promise.all(files.map((file) => mediaRepository.upload(file))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mediaQueryKeys.lists() });
    },
  });
}

export function useUpdateMediaAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ assetId, input }: { assetId: string; input: MediaUpdateRequest }) =>
      mediaRepository.update(assetId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mediaQueryKeys.lists() });
    },
  });
}

export function useDeleteMediaAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (assetId: string) => mediaRepository.delete(assetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mediaQueryKeys.lists() });
    },
  });
}
