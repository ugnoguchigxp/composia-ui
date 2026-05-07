import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateApiSourceRequest,
  CreateMarkdownSourceRequest,
  CreatePostgresSourceRequest,
  CreateRssSourceRequest,
} from '../../../../shared/schemas/sources.schema';
import { sourcesRepository } from '../repositories/sources.repository';

export const sourceQueryKeys = {
  all: ['sources'] as const,
  items: (sourceId: string) => ['sources', sourceId, 'items'] as const,
};

export function useSources() {
  return useQuery({
    queryKey: sourceQueryKeys.all,
    queryFn: () => sourcesRepository.list(),
  });
}

export function useCreateRssSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRssSourceRequest) => sourcesRepository.createRss(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sourceQueryKeys.all }),
  });
}

export function useCreateApiSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateApiSourceRequest) => sourcesRepository.createApi(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sourceQueryKeys.all }),
  });
}

export function useCreateMarkdownSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMarkdownSourceRequest) => sourcesRepository.createMarkdown(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sourceQueryKeys.all }),
  });
}

export function useCreatePostgresSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePostgresSourceRequest) => sourcesRepository.createPostgres(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sourceQueryKeys.all }),
  });
}

export function useSourceItems(sourceId: string | null) {
  return useQuery({
    enabled: Boolean(sourceId),
    queryKey: sourceQueryKeys.items(sourceId ?? ''),
    queryFn: () => sourcesRepository.items(sourceId ?? ''),
  });
}

export function useRefreshSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sourceId: string) => sourcesRepository.refresh(sourceId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: sourceQueryKeys.all });
      queryClient.invalidateQueries({ queryKey: sourceQueryKeys.items(data.source.id) });
    },
  });
}
