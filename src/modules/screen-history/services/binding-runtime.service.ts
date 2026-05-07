import type { DataBinding } from '../../../../shared/schemas/data-binding.schema';
import type { SandboxStateResponse } from '../../../../shared/schemas/database-design.schema';
import type { AppUiSchema } from '../../../../shared/schemas/ui-schema.schema';

export type BindingRuntimeIssue = {
  bindingId: string;
  message: string;
};

export function bindingRuntimeIssue(
  binding: DataBinding,
  sandboxState?: SandboxStateResponse | null
): BindingRuntimeIssue | null {
  if (!sandboxState) return null;
  if (binding.databaseSchemaJsonId !== sandboxState.appliedDatabaseSchemaJsonId) {
    return {
      bindingId: binding.id,
      message: `binding schema ${binding.databaseSchemaJsonId} は現在の SandboxDB schema ${
        sandboxState.appliedDatabaseSchemaJsonId ?? 'none'
      } に未適用です。`,
    };
  }
  const table = sandboxState.tables.find((candidate) => candidate.name === binding.table);
  if (!table) {
    return {
      bindingId: binding.id,
      message: `${binding.table} table は SandboxDB に存在しません。`,
    };
  }
  if (!table.managed) {
    return {
      bindingId: binding.id,
      message: `${binding.table} table は DBDesign managed table ではありません。`,
    };
  }
  return null;
}

export function bindingRuntimeIsReady(
  binding: DataBinding,
  sandboxState?: SandboxStateResponse | null
) {
  return Boolean(sandboxState && !bindingRuntimeIssue(binding, sandboxState));
}

export function resolveScreenRuntimeBindings(schema: AppUiSchema, bindings: DataBinding[]) {
  const bindingsById = new Map(bindings.map((binding) => [binding.id, binding]));
  const seen = new Set<string>();
  const runtimeBindings: DataBinding[] = [];
  const issues: BindingRuntimeIssue[] = [];

  for (const section of schema.sections) {
    if (!section.dataBindingId) continue;
    const binding = bindingsById.get(section.dataBindingId);
    if (!binding) {
      issues.push({
        bindingId: section.dataBindingId,
        message: `${section.component} は存在しない data binding "${section.dataBindingId}" を参照しています。`,
      });
      continue;
    }
    if (!['create', 'list'].includes(binding.operation) || seen.has(binding.id)) continue;
    seen.add(binding.id);
    runtimeBindings.push(binding);
  }

  return { issues, runtimeBindings };
}

export function submitBindingRuntimeIssue(
  binding: DataBinding,
  sandboxState?: SandboxStateResponse | null
): BindingRuntimeIssue | null {
  if (!sandboxState) {
    return {
      bindingId: binding.id,
      message: 'SandboxDB state を読み込み中です。再度実行してください。',
    };
  }
  return bindingRuntimeIssue(binding, sandboxState);
}
