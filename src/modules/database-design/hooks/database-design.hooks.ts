import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DatabaseDesignEditRequest,
  DatabaseDesignProposeRequest,
} from '../../../../shared/schemas/database-design.schema';
import { databaseDesignRepository } from '../repositories/database-design.repository';

export const databaseDesignQueryKeys = {
  conversation: (designSessionId: string) => ['database-design', designSessionId] as const,
  rows: (table: string) => ['sandbox-db', 'rows', table] as const,
  schemaJson: (databaseSchemaJsonId: string) =>
    ['database-design', 'schema-json', databaseSchemaJsonId] as const,
  state: ['sandbox-db', 'state'] as const,
};

export function useDatabaseDesignConversation(designSessionId: string | null, enabled = true) {
  return useQuery({
    enabled: enabled && Boolean(designSessionId),
    queryKey: databaseDesignQueryKeys.conversation(designSessionId ?? ''),
    queryFn: () => databaseDesignRepository.conversation(designSessionId ?? ''),
  });
}

export function useSandboxState(enabled = true) {
  return useQuery({
    enabled,
    queryKey: databaseDesignQueryKeys.state,
    queryFn: databaseDesignRepository.sandboxState,
  });
}

export function useSandboxRows(table: string | null, enabled = true) {
  return useQuery({
    enabled: enabled && Boolean(table),
    queryKey: databaseDesignQueryKeys.rows(table ?? ''),
    queryFn: () => databaseDesignRepository.sandboxRows(table ?? ''),
  });
}

export function useProposeDatabaseDesign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DatabaseDesignProposeRequest) => databaseDesignRepository.propose(input),
    onSuccess: (data) => {
      queryClient.setQueryData(
        databaseDesignQueryKeys.conversation(data.session.id),
        data.conversation
      );
      queryClient.invalidateQueries({ queryKey: databaseDesignQueryKeys.state });
    },
  });
}

export function useEditDatabaseDesign(designSessionId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DatabaseDesignEditRequest) =>
      databaseDesignRepository.edit(designSessionId ?? '', input),
    onSuccess: (data) => {
      queryClient.setQueryData(
        databaseDesignQueryKeys.conversation(data.session.id),
        data.conversation
      );
      queryClient.invalidateQueries({ queryKey: databaseDesignQueryKeys.state });
    },
  });
}

export function useRestoreDatabaseDesignCheckpoint(designSessionId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { databaseSchemaJsonId?: string; screenJsonId?: string }) =>
      databaseDesignRepository.restoreCheckpoint(designSessionId ?? '', input),
    onSuccess: (data) => {
      queryClient.setQueryData(databaseDesignQueryKeys.conversation(data.session.id), data);
    },
  });
}

export function useApplySandboxMigration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (databaseSchemaJsonId: string) =>
      databaseDesignRepository.applyMigration(databaseSchemaJsonId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sandbox-db'] });
    },
  });
}

export function useResetSandbox() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { confirmation: string }) => databaseDesignRepository.resetSandbox(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sandbox-db'] });
    },
  });
}

export function useInsertSandboxRow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { bindingId?: string; table: string; value: Record<string, unknown> }) =>
      databaseDesignRepository.insertSandboxRow(input.table, input.value),
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: databaseDesignQueryKeys.state });
      queryClient.invalidateQueries({ queryKey: databaseDesignQueryKeys.rows(input.table) });
    },
  });
}

export function useUpdateSandboxRow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; table: string; value: Record<string, unknown> }) =>
      databaseDesignRepository.updateSandboxRow(input.table, input.id, input.value),
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: databaseDesignQueryKeys.state });
      queryClient.invalidateQueries({ queryKey: databaseDesignQueryKeys.rows(input.table) });
    },
  });
}
