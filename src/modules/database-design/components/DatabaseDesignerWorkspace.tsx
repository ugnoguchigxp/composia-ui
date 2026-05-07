import { Link, useNavigate } from '@tanstack/react-router';
import { CheckCircle2, Database, GitBranch, Loader2, RotateCcw, Send, Table2 } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { DataBinding } from '../../../../shared/schemas/data-binding.schema';
import type {
  DatabaseDesignConversationResponse,
  DatabaseSchemaJsonRecord,
} from '../../../../shared/schemas/database-design.schema';
import type { AppUiSchema } from '../../../../shared/schemas/ui-schema.schema';
import { useAuth } from '../../../lib/auth';
import { cn } from '../../../lib/utils';
import { JsonRenderRenderer } from '../../ui-schema/components/JsonRenderRenderer';
import {
  useApplySandboxMigration,
  useDatabaseDesignConversation,
  useEditDatabaseDesign,
  useInsertSandboxRow,
  useProposeDatabaseDesign,
  useResetSandbox,
  useRestoreDatabaseDesignCheckpoint,
  useSandboxRows,
  useSandboxState,
} from '../hooks/database-design.hooks';

type WorkspaceMessage = DatabaseDesignConversationResponse['messages'][number];

function searchParam(name: string) {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(name);
}

function activeSchema(conversation?: DatabaseDesignConversationResponse | null) {
  if (!conversation) return null;
  return (
    conversation.databaseSchemaJsons.find(
      (schema) => schema.id === conversation.activeDatabaseSchemaJsonId
    ) ??
    conversation.databaseSchemaJsons.at(-1) ??
    null
  );
}

export function DatabaseDesignerWorkspace() {
  const auth = useAuth();
  const navigate = useNavigate();
  const initialScreenJsonId = useMemo(() => searchParam('screenJsonId'), []);
  const initialDesignSessionId = useMemo(() => searchParam('designSessionId'), []);
  const [designSessionId, setDesignSessionId] = useState<string | null>(initialDesignSessionId);
  const [prompt, setPrompt] = useState(
    initialScreenJsonId
      ? 'このUIに必要なテーブル定義案を作成してください。'
      : '管理したいデータと画面の使い方を入力してください。'
  );
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [resetConfirmation, setResetConfirmation] = useState('');
  const autoProposedScreenRef = useRef<string | null>(null);
  const conversationQuery = useDatabaseDesignConversation(
    designSessionId,
    Boolean(auth.user && designSessionId)
  );
  const propose = useProposeDatabaseDesign();
  const edit = useEditDatabaseDesign(designSessionId);
  const restore = useRestoreDatabaseDesignCheckpoint(designSessionId);
  const applyMigration = useApplySandboxMigration();
  const resetSandbox = useResetSandbox();
  const sandboxState = useSandboxState(Boolean(auth.user));
  const currentConversation =
    propose.data?.conversation ?? edit.data?.conversation ?? conversationQuery.data;
  const currentSchema = activeSchema(currentConversation);
  const screenPreview =
    propose.data?.screen ??
    edit.data?.screen ??
    (currentConversation?.activeScreenJsonId ? null : undefined);
  const currentDataBindings =
    propose.data?.dataBindings ??
    edit.data?.dataBindings ??
    currentConversation?.dataBindings ??
    [];
  const visibleTables = currentSchema?.schema.tables ?? [];

  useEffect(() => {
    if (selectedTable || visibleTables.length === 0) return;
    setSelectedTable(visibleTables[0]?.name ?? null);
  }, [selectedTable, visibleTables]);

  useEffect(() => {
    if (
      !auth.user ||
      !initialScreenJsonId ||
      autoProposedScreenRef.current === initialScreenJsonId
    ) {
      return;
    }
    autoProposedScreenRef.current = initialScreenJsonId;
    propose.mutate(
      {
        prompt: 'このUIに必要なテーブル定義案を作成してください。',
        screenJsonId: initialScreenJsonId,
        source: 'screen',
      },
      {
        onSuccess: (data) => {
          setDesignSessionId(data.session.id);
          void navigate({
            search: { designSessionId: data.session.id } as never,
            to: '/dbdesign' as never,
          });
        },
      }
    );
  }, [auth.user, initialScreenJsonId, navigate, propose]);

  const isPending = propose.isPending || edit.isPending || restore.isPending;
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || isPending) return;
    if (designSessionId) {
      edit.mutate(
        { prompt: trimmed },
        {
          onSuccess: (data) => {
            setPrompt('');
            setDesignSessionId(data.session.id);
          },
        }
      );
      return;
    }
    propose.mutate(
      { prompt: trimmed, source: 'dbdesign' },
      {
        onSuccess: (data) => {
          setPrompt('');
          setDesignSessionId(data.session.id);
          void navigate({
            search: { designSessionId: data.session.id } as never,
            to: '/dbdesign' as never,
          });
        },
      }
    );
  };

  if (auth.isLoading) {
    return <div className="mx-auto max-w-6xl px-4 py-10 text-muted-foreground">Loading...</div>;
  }

  if (!auth.user) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <section className="rounded-lg border border-border bg-card p-[var(--ui-card-padding)]">
          <h1 className="text-2xl font-semibold">DBDesign</h1>
          <Link
            className="mt-5 inline-flex h-ui items-center rounded-md bg-primary px-ui-button text-sm font-medium text-primary-foreground hover:bg-primary/90"
            to="/login"
          >
            Login
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto grid min-h-[calc(100vh-4.25rem)] max-w-[96rem] gap-5 px-4 py-6 md:px-8 xl:grid-cols-[23rem_minmax(0,1fr)_24rem]">
      <aside className="flex min-h-[32rem] flex-col rounded-lg border border-border bg-card">
        <header className="border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            <h1 className="font-semibold text-base">DBDesign</h1>
          </div>
          <p className="mt-1 text-muted-foreground text-xs">
            UI またはプロンプトから sandbox DB の定義案を作成
          </p>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <CheckpointList
            activeDatabaseSchemaJsonId={currentConversation?.activeDatabaseSchemaJsonId ?? null}
            isRestoring={restore.isPending}
            onRestore={(databaseSchemaJsonId, screenJsonId) =>
              restore.mutate({ databaseSchemaJsonId, screenJsonId })
            }
            schemas={currentConversation?.databaseSchemaJsons ?? []}
          />
          <MessageList messages={currentConversation?.messages ?? []} />
          {propose.error || edit.error || conversationQuery.error ? (
            <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
              {(propose.error ?? edit.error ?? conversationQuery.error)?.message}
            </div>
          ) : null}
        </div>

        <form className="grid gap-2 border-t border-border p-3" onSubmit={handleSubmit}>
          <textarea
            className="max-h-40 min-h-28 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            maxLength={4000}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="テーブル定義の変更内容を入力"
            value={prompt}
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground text-xs">{prompt.length}/4000</span>
            <button
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isPending || prompt.trim().length === 0}
              type="submit"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Send
            </button>
          </div>
        </form>
      </aside>

      <main className="grid min-w-0 gap-5">
        <SchemaOverview
          activeSchema={currentSchema}
          onSelectTable={setSelectedTable}
          selectedTable={selectedTable}
        />
        {screenPreview ? (
          <section className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <h2 className="font-semibold">UI binding preview</h2>
            </div>
            <div className="bg-background p-4">
              <DataBoundScreenPreview dataBindings={currentDataBindings} schema={screenPreview} />
            </div>
          </section>
        ) : null}
      </main>

      <aside className="grid content-start gap-5">
        <MigrationPanel
          activeSchema={currentSchema}
          applyError={applyMigration.error?.message}
          isApplying={applyMigration.isPending}
          onApply={(id) => applyMigration.mutate(id)}
        />
        <SandboxPanel
          isLoading={sandboxState.isLoading}
          onSelectTable={setSelectedTable}
          selectedTable={selectedTable}
          state={sandboxState.data}
        />
        <SandboxRowsPanel table={selectedTable} />
        <ResetPanel
          confirmation={resetConfirmation}
          droppedObjects={resetSandbox.data?.droppedObjects}
          error={resetSandbox.error?.message}
          isResetting={resetSandbox.isPending}
          onConfirmationChange={setResetConfirmation}
          onReset={() =>
            resetSandbox.mutate(
              { confirmation: resetConfirmation },
              { onSuccess: () => setResetConfirmation('') }
            )
          }
        />
      </aside>
    </div>
  );
}

function CheckpointList({
  activeDatabaseSchemaJsonId,
  isRestoring,
  onRestore,
  schemas,
}: {
  activeDatabaseSchemaJsonId: string | null;
  isRestoring: boolean;
  onRestore: (databaseSchemaJsonId: string, screenJsonId?: string) => void;
  schemas: DatabaseSchemaJsonRecord[];
}) {
  if (schemas.length === 0) return null;
  return (
    <section className="mb-4 rounded-md border border-border bg-background/70 p-3">
      <div className="mb-2 text-muted-foreground text-xs font-medium uppercase">Checkpoints</div>
      <div className="grid gap-2">
        {schemas.map((schema) => {
          const isActive = schema.id === activeDatabaseSchemaJsonId;
          return (
            <button
              className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-left text-sm hover:bg-secondary disabled:cursor-default disabled:opacity-60"
              disabled={isActive || isRestoring}
              key={schema.id}
              onClick={() => onRestore(schema.id)}
              type="button"
            >
              <span>v{schema.version}</span>
              <span className="text-muted-foreground text-xs">
                {isActive ? '現在' : 'このバージョンへ戻る'}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function MessageList({ messages }: { messages: WorkspaceMessage[] }) {
  if (messages.length === 0) {
    return <div className="text-muted-foreground text-sm">DBDesign の指示を入力してください。</div>;
  }
  return (
    <div className="grid gap-3">
      {messages.map((message) => (
        <article
          className={cn(
            'rounded-lg px-3 py-2 text-sm leading-6',
            message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-background'
          )}
          key={message.id}
        >
          {message.content}
        </article>
      ))}
    </div>
  );
}

function SchemaOverview({
  activeSchema,
  onSelectTable,
  selectedTable,
}: {
  activeSchema: DatabaseSchemaJsonRecord | null;
  onSelectTable: (table: string) => void;
  selectedTable: string | null;
}) {
  if (!activeSchema) {
    return (
      <section className="flex min-h-[60vh] items-center justify-center rounded-lg border border-dashed border-border bg-card/40 p-8 text-center">
        <div>
          <Database className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-3 text-xl font-semibold">No database draft</h2>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-4 py-3">
        <div>
          <h2 className="font-semibold">{activeSchema.schema.label}</h2>
          <p className="mt-1 text-muted-foreground text-sm">{activeSchema.schema.purpose}</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-muted-foreground text-xs">
          <GitBranch className="h-3.5 w-3.5" />v{activeSchema.version}
        </div>
      </header>
      <div className="grid gap-3 p-4">
        {activeSchema.schema.tables.map((table) => (
          <button
            className={cn(
              'rounded-lg border p-4 text-left transition-colors hover:bg-secondary/60',
              selectedTable === table.name ? 'border-primary bg-primary/5' : 'border-border'
            )}
            key={table.name}
            onClick={() => onSelectTable(table.name)}
            type="button"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Table2 className="h-4 w-4 text-muted-foreground" />
                  <h3 className="font-semibold">{table.name}</h3>
                </div>
                <p className="mt-1 text-muted-foreground text-sm">{table.label}</p>
              </div>
              <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground text-xs">
                {table.columns.length} columns
              </span>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-3 font-medium">column</th>
                    <th className="py-1 pr-3 font-medium">type</th>
                    <th className="py-1 pr-3 font-medium">null</th>
                    <th className="py-1 pr-3 font-medium">key</th>
                  </tr>
                </thead>
                <tbody>
                  {table.columns.map((column) => (
                    <tr className="border-t border-border" key={column.name}>
                      <td className="py-1.5 pr-3 font-mono">{column.name}</td>
                      <td className="py-1.5 pr-3">{column.type}</td>
                      <td className="py-1.5 pr-3">{column.nullable ? 'yes' : 'no'}</td>
                      <td className="py-1.5 pr-3">
                        {column.primaryKey ? 'PK' : column.unique ? 'unique' : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function MigrationPanel({
  activeSchema,
  applyError,
  isApplying,
  onApply,
}: {
  activeSchema: DatabaseSchemaJsonRecord | null;
  applyError?: string;
  isApplying: boolean;
  onApply: (databaseSchemaJsonId: string) => void;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
        <h2 className="font-semibold">Migration</h2>
      </div>
      <p className="mt-2 text-muted-foreground text-sm">
        承認後に sandbox DB へ managed objects として反映します。
      </p>
      <button
        className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-primary px-3 text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!activeSchema || isApplying}
        onClick={() => activeSchema && onApply(activeSchema.id)}
        type="button"
      >
        {isApplying ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CheckCircle2 className="h-4 w-4" />
        )}
        テーブル生成
      </button>
      {applyError ? <p className="mt-2 text-destructive text-sm">{applyError}</p> : null}
    </section>
  );
}

function SandboxPanel({
  isLoading,
  onSelectTable,
  selectedTable,
  state,
}: {
  isLoading: boolean;
  onSelectTable: (table: string) => void;
  selectedTable: string | null;
  state?: { tables: { name: string; rowCount: number }[] } | null;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Sandbox tables</h2>
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
      </div>
      <div className="mt-3 grid gap-2">
        {(state?.tables ?? []).map((table) => (
          <button
            className={cn(
              'flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-secondary',
              selectedTable === table.name ? 'border-primary bg-primary/5' : 'border-border'
            )}
            key={table.name}
            onClick={() => onSelectTable(table.name)}
            type="button"
          >
            <span className="font-mono">{table.name}</span>
            <span className="text-muted-foreground text-xs">{table.rowCount}</span>
          </button>
        ))}
        {!state || state.tables.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-3 text-muted-foreground text-sm">
            未反映
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SandboxRowsPanel({ table }: { table: string | null }) {
  const rows = useSandboxRows(table, Boolean(table));
  if (!table) return null;
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">{table}</h2>
        <button
          className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-secondary"
          onClick={() => rows.refetch()}
          type="button"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 max-h-80 overflow-auto rounded-md border border-border">
        <table className="w-full min-w-[24rem] text-left text-xs">
          <tbody>
            {(rows.data?.rows ?? []).map((row, index) => (
              <tr className="border-t border-border" key={String(row.id ?? index)}>
                <td className="p-2 font-mono text-muted-foreground">{String(row.id ?? index)}</td>
                <td className="p-2">{JSON.stringify(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.data?.rows.length === 0 ? (
          <div className="p-3 text-muted-foreground text-sm">No rows</div>
        ) : null}
      </div>
    </section>
  );
}

function ResetPanel({
  confirmation,
  droppedObjects,
  error,
  isResetting,
  onConfirmationChange,
  onReset,
}: {
  confirmation: string;
  droppedObjects?: number;
  error?: string;
  isResetting: boolean;
  onConfirmationChange: (value: string) => void;
  onReset: () => void;
}) {
  const canReset = confirmation === 'RESET SANDBOX' && !isResetting;
  return (
    <section className="rounded-lg border border-destructive/30 bg-card p-4">
      <div className="flex items-center gap-2">
        <RotateCcw className="h-4 w-4 text-destructive" />
        <h2 className="font-semibold">Sandbox reset</h2>
      </div>
      <p className="mt-2 text-muted-foreground text-sm">
        managed objects だけを削除し、未管理の sandbox object は触りません。
      </p>
      <input
        className="mt-3 h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onChange={(event) => onConfirmationChange(event.target.value)}
        placeholder="RESET SANDBOX"
        value={confirmation}
      />
      <button
        className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-destructive px-3 text-destructive-foreground text-sm font-medium hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!canReset}
        onClick={onReset}
        type="button"
      >
        {isResetting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RotateCcw className="h-4 w-4" />
        )}
        Reset sandbox
      </button>
      {typeof droppedObjects === 'number' ? (
        <p className="mt-2 text-muted-foreground text-sm">{droppedObjects} objects dropped</p>
      ) : null}
      {error ? <p className="mt-2 text-destructive text-sm">{error}</p> : null}
    </section>
  );
}

function DataBoundScreenPreview({
  dataBindings,
  schema,
}: {
  dataBindings: DataBinding[];
  schema: AppUiSchema;
}) {
  const insertRow = useInsertSandboxRow();
  const firstListBinding = dataBindings.find((binding) => binding.operation === 'list');
  const rows = useSandboxRows(firstListBinding?.table ?? null, Boolean(firstListBinding));
  const bindingRows = firstListBinding
    ? { [firstListBinding.id]: rows.data?.rows ?? [] }
    : undefined;
  const handleSubmitBinding = (dataBindingId: string, value: Record<string, unknown>) => {
    const binding = dataBindings.find(
      (candidate) => candidate.id === dataBindingId && candidate.operation === 'create'
    );
    if (!binding) return;
    insertRow.mutate({ bindingId: dataBindingId, table: binding.table, value });
  };

  return (
    <div className="grid gap-3">
      <JsonRenderRenderer
        bindingRows={bindingRows}
        onSubmitBinding={handleSubmitBinding}
        pendingBindingId={insertRow.isPending ? insertRow.variables?.bindingId : null}
        schema={schema}
      />
      {insertRow.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm">
          {insertRow.error.message}
        </p>
      ) : null}
    </div>
  );
}
