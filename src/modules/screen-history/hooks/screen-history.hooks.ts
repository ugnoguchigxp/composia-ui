import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  PromptSessionVisibilityUpdateRequest,
  ScreenActionGenerateRequest,
  ScreenActionLinkUpsertRequest,
  ScreenEditRequest,
  ScreenGenerateRequest,
  ScreenJsonSaveRequest,
  ScreenListQuery,
  ScreenRegenerateRequest,
} from '../../../../shared/schemas/screen-history.schema';
import { screenHistoryRepository } from '../repositories/screen-history.repository';

export const screenHistoryQueryKeys = {
  all: ['screen-history'] as const,
  children: (screenId: string) => [...screenHistoryQueryKeys.all, screenId, 'children'] as const,
  conversation: (sessionId: string) =>
    [...screenHistoryQueryKeys.all, 'session', sessionId] as const,
  detail: (screenId: string) => [...screenHistoryQueryKeys.all, screenId] as const,
  lists: () => [...screenHistoryQueryKeys.all, 'list'] as const,
  list: (query: ScreenListQuery) => [...screenHistoryQueryKeys.lists(), query] as const,
  projectPage: (projectId: string, pagePath: string) =>
    [...screenHistoryQueryKeys.all, 'project', projectId, pagePath] as const,
  screenJson: (screenJsonId: string) => ['screen-json', screenJsonId] as const,
};

export function useScreenHistory(query: ScreenListQuery, enabled = true) {
  return useQuery({
    enabled,
    queryKey: screenHistoryQueryKeys.list(query),
    queryFn: () => screenHistoryRepository.list(query),
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

export function useScreenConversation(sessionId: string | null, enabled = true) {
  return useQuery({
    enabled: enabled && Boolean(sessionId),
    queryKey: screenHistoryQueryKeys.conversation(sessionId ?? ''),
    queryFn: () => screenHistoryRepository.conversation(sessionId ?? ''),
  });
}

export function useProjectPageSession(
  projectId: string | null,
  pagePath: string | null,
  enabled = true
) {
  return useQuery({
    enabled: enabled && Boolean(projectId && pagePath),
    queryKey: screenHistoryQueryKeys.projectPage(projectId ?? '', pagePath ?? ''),
    queryFn: () => screenHistoryRepository.projectPage(projectId ?? '', pagePath ?? ''),
  });
}

export function useScreenJson(screenJsonId: string | null, enabled = true) {
  return useQuery({
    enabled: enabled && Boolean(screenJsonId),
    queryKey: screenHistoryQueryKeys.screenJson(screenJsonId ?? ''),
    queryFn: () => screenHistoryRepository.getScreenJson(screenJsonId ?? ''),
  });
}

export function useGenerateScreen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ScreenGenerateRequest) => screenHistoryRepository.generate(input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: screenHistoryQueryKeys.lists() });
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
      queryClient.invalidateQueries({ queryKey: screenHistoryQueryKeys.lists() });
      if (screenId) {
        queryClient.invalidateQueries({ queryKey: screenHistoryQueryKeys.children(screenId) });
      }
      queryClient.setQueryData(screenHistoryQueryKeys.detail(data.screen.id), data);
    },
  });
}

export function useGenerateScreenFromSessionAction(sessionId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ actionId, input }: { actionId: string; input: ScreenActionGenerateRequest }) =>
      screenHistoryRepository.generateFromSessionAction(sessionId ?? '', actionId, input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: screenHistoryQueryKeys.lists() });
      if (sessionId) {
        queryClient.invalidateQueries({ queryKey: screenHistoryQueryKeys.conversation(sessionId) });
      }
      queryClient.setQueryData(screenHistoryQueryKeys.detail(data.screen.id), data);
    },
  });
}

export function useLinkScreenAction(sessionId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ actionId, input }: { actionId: string; input: ScreenActionLinkUpsertRequest }) =>
      screenHistoryRepository.linkAction(sessionId ?? '', actionId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: screenHistoryQueryKeys.lists() });
      if (sessionId) {
        queryClient.invalidateQueries({ queryKey: screenHistoryQueryKeys.conversation(sessionId) });
      }
    },
  });
}

export function useUnlinkScreenAction(sessionId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (actionId: string) =>
      screenHistoryRepository.unlinkAction(sessionId ?? '', actionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: screenHistoryQueryKeys.lists() });
      if (sessionId) {
        queryClient.invalidateQueries({ queryKey: screenHistoryQueryKeys.conversation(sessionId) });
      }
    },
  });
}

export function useEditSessionScreen(sessionId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ScreenEditRequest) => screenHistoryRepository.edit(sessionId ?? '', input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: screenHistoryQueryKeys.lists() });
      if (sessionId) {
        queryClient.invalidateQueries({ queryKey: screenHistoryQueryKeys.conversation(sessionId) });
      }
      queryClient.setQueryData(screenHistoryQueryKeys.detail(data.screen.id), data);
    },
  });
}

export function useSaveSessionScreenJson(sessionId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ScreenJsonSaveRequest) =>
      screenHistoryRepository.saveScreenJson(sessionId ?? '', input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: screenHistoryQueryKeys.lists() });
      if (sessionId) {
        queryClient.invalidateQueries({ queryKey: screenHistoryQueryKeys.conversation(sessionId) });
      }
      queryClient.setQueryData(screenHistoryQueryKeys.detail(data.screen.id), data);
    },
  });
}

export function useUpdatePromptSessionVisibility(sessionId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PromptSessionVisibilityUpdateRequest) =>
      screenHistoryRepository.updateSessionVisibility(sessionId ?? '', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: screenHistoryQueryKeys.lists() });
      if (sessionId) {
        queryClient.invalidateQueries({ queryKey: screenHistoryQueryKeys.conversation(sessionId) });
      }
    },
  });
}

export function useRegenerateScreen(screenId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ScreenRegenerateRequest) =>
      screenHistoryRepository.regenerate(screenId ?? '', input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: screenHistoryQueryKeys.lists() });
      if (screenId) {
        queryClient.invalidateQueries({ queryKey: screenHistoryQueryKeys.children(screenId) });
      }
      queryClient.setQueryData(screenHistoryQueryKeys.detail(data.screen.id), data);
    },
  });
}

export function useRegenerateSessionScreen(sessionId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ScreenRegenerateRequest) =>
      screenHistoryRepository.regenerateSession(sessionId ?? '', input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: screenHistoryQueryKeys.lists() });
      if (sessionId) {
        queryClient.invalidateQueries({ queryKey: screenHistoryQueryKeys.conversation(sessionId) });
      }
      queryClient.setQueryData(screenHistoryQueryKeys.detail(data.screen.id), data);
    },
  });
}

export function useRestoreScreenJsonCheckpoint(sessionId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (screenJsonId: string) =>
      screenHistoryRepository.restoreCheckpoint(sessionId ?? '', screenJsonId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: screenHistoryQueryKeys.lists() });
      if (sessionId) {
        queryClient.setQueryData(screenHistoryQueryKeys.conversation(sessionId), data.conversation);
      }
      queryClient.setQueryData(screenHistoryQueryKeys.detail(data.screen.id), {
        activities: [],
        screen: data.screen,
      });
    },
  });
}

export function useDeleteScreen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (screenId: string) => screenHistoryRepository.delete(screenId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: screenHistoryQueryKeys.lists() });
    },
  });
}

export function useDeletePromptSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => screenHistoryRepository.deleteSession(sessionId),
    onSuccess: (_data, sessionId) => {
      queryClient.invalidateQueries({ queryKey: screenHistoryQueryKeys.lists() });
      queryClient.removeQueries({ queryKey: screenHistoryQueryKeys.conversation(sessionId) });
    },
  });
}
