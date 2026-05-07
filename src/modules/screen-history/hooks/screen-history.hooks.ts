import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ScreenActionGenerateRequest,
  ScreenGenerateRequest,
  ScreenRegenerateRequest,
} from '../../../../shared/schemas/screen-history.schema';
import { screenHistoryRepository } from '../repositories/screen-history.repository';

export const screenHistoryQueryKeys = {
  children: (screenId: string) => ['screen-history', screenId, 'children'] as const,
  detail: (screenId: string) => ['screen-history', screenId] as const,
  list: ['screen-history', 'list'] as const,
};

export function useScreenHistory(enabled = true) {
  return useQuery({
    enabled,
    queryKey: screenHistoryQueryKeys.list,
    queryFn: screenHistoryRepository.list,
  });
}

export function useGeneratedScreen(screenId: string | null, enabled = true) {
  return useQuery({
    enabled: enabled && Boolean(screenId),
    queryKey: screenHistoryQueryKeys.detail(screenId ?? ''),
    queryFn: () => screenHistoryRepository.get(screenId ?? ''),
  });
}

export function useGeneratedScreenChildren(screenId: string | null, enabled = true) {
  return useQuery({
    enabled: enabled && Boolean(screenId),
    queryKey: screenHistoryQueryKeys.children(screenId ?? ''),
    queryFn: () => screenHistoryRepository.children(screenId ?? ''),
  });
}

export function useGenerateScreen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ScreenGenerateRequest) => screenHistoryRepository.generate(input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: screenHistoryQueryKeys.list });
      queryClient.setQueryData(screenHistoryQueryKeys.detail(data.screen.id), data);
    },
  });
}

export function useGenerateScreenFromAction(screenId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ actionId, input }: { actionId: string; input: ScreenActionGenerateRequest }) =>
      screenHistoryRepository.generateFromAction(screenId ?? '', actionId, input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: screenHistoryQueryKeys.list });
      if (screenId) {
        queryClient.invalidateQueries({ queryKey: screenHistoryQueryKeys.children(screenId) });
      }
      queryClient.setQueryData(screenHistoryQueryKeys.detail(data.screen.id), data);
    },
  });
}

export function useRegenerateScreen(screenId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ScreenRegenerateRequest) =>
      screenHistoryRepository.regenerate(screenId ?? '', input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: screenHistoryQueryKeys.list });
      if (screenId) {
        queryClient.invalidateQueries({ queryKey: screenHistoryQueryKeys.children(screenId) });
      }
      queryClient.setQueryData(screenHistoryQueryKeys.detail(data.screen.id), data);
    },
  });
}

export function useDeleteScreen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (screenId: string) => screenHistoryRepository.delete(screenId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: screenHistoryQueryKeys.list });
    },
  });
}
