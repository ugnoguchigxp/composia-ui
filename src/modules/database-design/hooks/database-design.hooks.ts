import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DataBinding } from '../../../../shared/schemas/data-binding.schema';
import type {
  DatabaseDesignEditRequest,
  DatabaseDesignProposeRequest,
  DatabaseDesignReproposalRequest,
} from '../../../../shared/schemas/database-design.schema';
import { databaseDesignRepository } from '../repositories/database-design.repository';

export const databaseDesignQueryKeys = {
  conversation: (designSessionId: string) => ['database-design', designSessionId] as const,
  draftGap: (databaseSchemaJsonId: string) =>
    ['database-design', 'draft-gap', databaseSchemaJsonId] as const,
  drafts: ['database-design', 'drafts'] as const,
  migrationPreview: (databaseSchemaJsonId: string) =>
    ['database-design', 'migration-preview', databaseSchemaJsonId] as const,
  rows: (table: string) => ['sandbox-db', 'rows', table] as const,
  schemaJson: (databaseSchemaJsonId: string) =>
    ['database-design', 'schema-json', databaseSchemaJsonId] as const,
  state: ['sandbox-db', 'state'] as const,
  tableContents: (table: string) => ['sandbox-db', 'table-contents', table] as const,
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

export function useDatabaseDrafts(enabled = true) {
  return useQuery({
    enabled,
    queryKey: databaseDesignQueryKeys.drafts,
    queryFn: databaseDesignRepository.drafts,
  });
}

export function useDatabaseSchemaJson(databaseSchemaJsonId: string | null, enabled = true) {
  return useQuery({
    enabled: enabled && Boolean(databaseSchemaJsonId),
    queryKey: databaseDesignQueryKeys.schemaJson(databaseSchemaJsonId ?? ''),
    queryFn: () => databaseDesignRepository.schemaJson(databaseSchemaJsonId ?? ''),
  });
}

export function useDatabaseDraftGap(databaseSchemaJsonId: string | null, enabled = true) {
  return useQuery({
    enabled: enabled && Boolean(databaseSchemaJsonId),
    queryKey: databaseDesignQueryKeys.draftGap(databaseSchemaJsonId ?? ''),
    queryFn: () => databaseDesignRepository.draftGap(databaseSchemaJsonId ?? ''),
  });
}

export function useDeleteDatabaseDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (databaseSchemaJsonId: string) =>
      databaseDesignRepository.deleteDraft(databaseSchemaJsonId),
    onSuccess: (_data, databaseSchemaJsonId) => {
      queryClient.invalidateQueries({ queryKey: databaseDesignQueryKeys.drafts });
      queryClient.invalidateQueries({ queryKey: databaseDesignQueryKeys.state });
      queryClient.removeQueries({
        queryKey: databaseDesignQueryKeys.draftGap(databaseSchemaJsonId),
      });
      queryClient.removeQueries({
        queryKey: databaseDesignQueryKeys.migrationPreview(databaseSchemaJsonId),
      });
      queryClient.removeQueries({
        queryKey: databaseDesignQueryKeys.schemaJson(databaseSchemaJsonId),
      });
    },
  });
}

export function useMigrationPreview(databaseSchemaJsonId: string | null, enabled = true) {
  return useQuery({
    enabled: enabled && Boolean(databaseSchemaJsonId),
    queryKey: databaseDesignQueryKeys.migrationPreview(databaseSchemaJsonId ?? ''),
    queryFn: () => databaseDesignRepository.migrationPreview(databaseSchemaJsonId ?? ''),
  });
}

export function useSandboxRows(table: string | null, enabled = true) {
  return useQuery({
    enabled: enabled && Boolean(table),
    queryKey: databaseDesignQueryKeys.rows(table ?? ''),
    queryFn: () => databaseDesignRepository.sandboxRows(table ?? ''),
  });
}

export function useSandboxTableContents(table: string | null, enabled = true) {
  return useQuery({
    enabled: enabled && Boolean(table),
    queryKey: databaseDesignQueryKeys.tableContents(table ?? ''),
    queryFn: () => databaseDesignRepository.sandboxTableContents(table ?? ''),
  });
}

export function useSandboxBindingRows(bindings: DataBinding[], enabled = true) {
  return useQueries({
    queries: bindings.map((binding) => ({
      enabled,
      queryKey: [...databaseDesignQueryKeys.rows(binding.table), binding.limit] as const,
      queryFn: () => databaseDesignRepository.sandboxRows(binding.table, binding.limit),
    })),
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
      queryClient.invalidateQueries({ queryKey: databaseDesignQueryKeys.drafts });
      queryClient.invalidateQueries({ queryKey: databaseDesignQueryKeys.state });
    },
  });
}

export function useEditDatabaseDesign(designSessionId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DatabaseDesignEditRequest) => {
      if (!designSessionId) throw new Error('Design session id is required');
      return databaseDesignRepository.edit(designSessionId, input);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(
        databaseDesignQueryKeys.conversation(data.session.id),
        data.conversation
      );
      queryClient.invalidateQueries({ queryKey: databaseDesignQueryKeys.drafts });
      queryClient.invalidateQueries({ queryKey: databaseDesignQueryKeys.state });
    },
  });
}

export function useReproposalDatabaseDesign(databaseSchemaJsonId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DatabaseDesignReproposalRequest) => {
      if (!databaseSchemaJsonId) throw new Error('DatabaseSchemaJSON id is required');
      return databaseDesignRepository.reproposal(databaseSchemaJsonId, input);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(
        databaseDesignQueryKeys.conversation(data.session.id),
        data.conversation
      );
      queryClient.invalidateQueries({ queryKey: databaseDesignQueryKeys.drafts });
      queryClient.invalidateQueries({ queryKey: ['database-design', 'draft-gap'] });
      queryClient.invalidateQueries({ queryKey: databaseDesignQueryKeys.state });
    },
  });
}

export function useRestoreDatabaseDesignCheckpoint(designSessionId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { databaseSchemaJsonId?: string; screenJsonId?: string }) => {
      if (!designSessionId) throw new Error('Design session id is required');
      return databaseDesignRepository.restoreCheckpoint(designSessionId, input);
    },
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
      queryClient.invalidateQueries({ queryKey: ['database-design', 'draft-gap'] });
      queryClient.invalidateQueries({ queryKey: databaseDesignQueryKeys.drafts });
    },
  });
}

export function useResetSandbox() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { confirmation: string }) => databaseDesignRepository.resetSandbox(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sandbox-db'] });
      queryClient.invalidateQueries({ queryKey: ['database-design', 'draft-gap'] });
      queryClient.invalidateQueries({ queryKey: databaseDesignQueryKeys.drafts });
    },
  });
}

export function useDropSandboxTable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (table: string) => databaseDesignRepository.dropSandboxTable(table),
    onSuccess: (_data, table) => {
      queryClient.invalidateQueries({ queryKey: ['sandbox-db'] });
      queryClient.invalidateQueries({ queryKey: ['database-design', 'draft-gap'] });
      queryClient.invalidateQueries({ queryKey: databaseDesignQueryKeys.drafts });
      queryClient.removeQueries({ queryKey: databaseDesignQueryKeys.rows(table) });
      queryClient.removeQueries({ queryKey: databaseDesignQueryKeys.tableContents(table) });
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
      queryClient.invalidateQueries({
        queryKey: databaseDesignQueryKeys.tableContents(input.table),
      });
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
      queryClient.invalidateQueries({
        queryKey: databaseDesignQueryKeys.tableContents(input.table),
      });
    },
  });
}
