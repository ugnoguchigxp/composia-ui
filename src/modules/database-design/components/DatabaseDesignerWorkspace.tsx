import { Link, useNavigate } from '@tanstack/react-router';
import {
  CheckCircle2,
  Database,
  FileJson,
  Loader2,
  RotateCcw,
  Send,
  Table2,
  Wand2,
} from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import type { DataBinding } from '../../../../shared/schemas/data-binding.schema';
import type {
  DatabaseDesignConversationResponse,
  DatabaseDraftGapSummary,
  DatabaseDraftSummary,
  DatabaseSchemaJsonRecord,
  SandboxMigrationPreview,
  SandboxStateResponse,
  SandboxTableState,
} from '../../../../shared/schemas/database-design.schema';
import { useAuth } from '../../../lib/auth';
import { cn } from '../../../lib/utils';
import {
  useApplySandboxMigration,
  useDatabaseDesignConversation,
  useDatabaseDraftGap,
  useDatabaseDrafts,
  useDatabaseSchemaJson,
  useEditDatabaseDesign,
  useMigrationPreview,
  useProposeDatabaseDesign,
  useReproposalDatabaseDesign,
  useResetSandbox,
  useSandboxRows,
  useSandboxState,
} from '../hooks/database-design.hooks';

type WorkspaceMessage = DatabaseDesignConversationResponse['messages'][number];

function searchParam(name: string) {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(name);
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat('ja-JP', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  }).format(new Date(value));
}

function sourceLabel(source: DatabaseDraftSummary['source']) {
  if (source === 'screen') return 'screen';
  if (source === 'reproposal') return 'reproposal';
  return 'dbdesign';
}

export function DatabaseDesignerWorkspace() {
  const auth = useAuth();
  const navigate = useNavigate();
  const initialScreenJsonId = useMemo(() => searchParam('screenJsonId'), []);
  const initialDesignSessionId = useMemo(() => searchParam('designSessionId'), []);
  const initialDraftId = useMemo(() => searchParam('draftId'), []);
  const [designSessionId, setDesignSessionId] = useState<string | null>(initialDesignSessionId);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(initialDraftId);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const promptPlaceholder = initialScreenJsonId
    ? 'このUIに必要なテーブル定義案を作成してください。'
    : '管理したいデータと画面の使い方を入力してください。';
  const [prompt, setPrompt] = useState('');
  const [resetConfirmation, setResetConfirmation] = useState('');
  const autoProposedScreenRef = useRef<string | null>(null);

  const sandboxState = useSandboxState(Boolean(auth.user));
  const draftsQuery = useDatabaseDrafts(Boolean(auth.user));
  const drafts = draftsQuery.data?.drafts ?? [];
  const selectedDraft = drafts.find((draft) => draft.id === selectedDraftId) ?? null;
  const activeDesignSessionId = selectedDraft?.designSessionId ?? designSessionId;
  const conversationQuery = useDatabaseDesignConversation(
    activeDesignSessionId,
    Boolean(auth.user && activeDesignSessionId)
  );
  const draftSchemaQuery = useDatabaseSchemaJson(
    selectedDraftId,
    Boolean(auth.user && selectedDraftId)
  );
  const draftGapQuery = useDatabaseDraftGap(selectedDraftId, Boolean(auth.user && selectedDraftId));
  const migrationPreviewQuery = useMigrationPreview(
    selectedDraftId,
    Boolean(auth.user && selectedDraftId)
  );
  const propose = useProposeDatabaseDesign();
  const edit = useEditDatabaseDesign(activeDesignSessionId);
  const reproposal = useReproposalDatabaseDesign(selectedDraftId);
  const applyMigration = useApplySandboxMigration();
  const resetSandbox = useResetSandbox();
  const selectedSandboxTable =
    sandboxState.data?.tables.find((table) => table.name === selectedTable) ?? null;
  const isPending = propose.isPending || edit.isPending || reproposal.isPending;

  useEffect(() => {
    if (selectedTable || !sandboxState.data?.tables.length) return;
    setSelectedTable(sandboxState.data.tables[0]?.name ?? null);
  }, [sandboxState.data?.tables, selectedTable]);

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
          setSelectedDraftId(data.databaseSchemaJson.id);
          void navigate({
            search: {
              designSessionId: data.session.id,
              draftId: data.databaseSchemaJson.id,
            } as never,
            to: '/dbdesign' as never,
          });
        },
      }
    );
  }, [auth.user, initialScreenJsonId, navigate, propose]);

  const selectDraft = (draft: DatabaseDraftSummary) => {
    setSelectedDraftId(draft.id);
    setDesignSessionId(draft.designSessionId);
    void navigate({
      search: { designSessionId: draft.designSessionId, draftId: draft.id } as never,
      to: '/dbdesign' as never,
    });
  };

  const selectCreatedDraft = (data: {
    databaseSchemaJson: { id: string };
    session: { id: string };
  }) => {
    setPrompt('');
    setDesignSessionId(data.session.id);
    setSelectedDraftId(data.databaseSchemaJson.id);
    void navigate({
      search: { designSessionId: data.session.id, draftId: data.databaseSchemaJson.id } as never,
      to: '/dbdesign' as never,
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || isPending) return;
    if (activeDesignSessionId) {
      edit.mutate({ prompt: trimmed }, { onSuccess: selectCreatedDraft });
      return;
    }
    propose.mutate({ prompt: trimmed, source: 'dbdesign' }, { onSuccess: selectCreatedDraft });
  };

  const handleReproposal = () => {
    if (!selectedDraftId || reproposal.isPending) return;
    const trimmed = prompt.trim();
    reproposal.mutate(trimmed ? { prompt: trimmed } : {}, { onSuccess: selectCreatedDraft });
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
    <div className="mx-auto grid min-h-[calc(100vh-4.25rem)] max-w-[98rem] gap-5 px-4 py-6 md:px-8 xl:grid-cols-[24rem_minmax(0,1fr)_27rem]">
      <aside className="flex min-h-[32rem] flex-col rounded-lg border border-border bg-card">
        <header className="border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            <h1 className="font-semibold text-base">DBDesign</h1>
          </div>
          <p className="mt-1 text-muted-foreground text-xs">
            SandboxDB の現在状態を見ながら Draft を作成
          </p>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <DraftList
            drafts={drafts}
            isLoading={draftsQuery.isLoading}
            onSelect={selectDraft}
            selectedDraftId={selectedDraftId}
          />
          <MessageList messages={conversationQuery.data?.messages ?? []} />
          {propose.error || edit.error || reproposal.error || draftsQuery.error ? (
            <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
              {(propose.error ?? edit.error ?? reproposal.error ?? draftsQuery.error)?.message}
            </div>
          ) : null}
        </div>

        <form className="grid gap-2 border-t border-border p-3" onSubmit={handleSubmit}>
          <textarea
            className="max-h-40 min-h-28 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            maxLength={4000}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={promptPlaceholder}
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
              Draft 作成
            </button>
          </div>
        </form>
      </aside>

      <main className="min-w-0">
        <SandboxStateOverview
          isLoading={sandboxState.isLoading}
          onSelectTable={setSelectedTable}
          selectedTable={selectedTable}
          state={sandboxState.data}
        />
      </main>

      <aside className="grid content-start gap-5">
        <DraftDetail
          applyError={applyMigration.error?.message}
          draft={draftSchemaQuery.data?.databaseSchemaJson ?? null}
          gap={draftGapQuery.data?.gap ?? selectedDraft?.gap ?? null}
          isApplying={applyMigration.isPending}
          isLoading={draftSchemaQuery.isLoading}
          isReproposing={reproposal.isPending}
          migrationPreview={migrationPreviewQuery.data ?? null}
          onApply={(id) => applyMigration.mutate(id)}
          onReproposal={handleReproposal}
          selectedDraft={selectedDraft}
        />
        <SandboxRowsPanel table={selectedSandboxTable} />
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

function DraftList({
  drafts,
  isLoading,
  onSelect,
  selectedDraftId,
}: {
  drafts: DatabaseDraftSummary[];
  isLoading: boolean;
  onSelect: (draft: DatabaseDraftSummary) => void;
  selectedDraftId: string | null;
}) {
  return (
    <section className="mb-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-muted-foreground text-xs font-medium uppercase">Drafts</div>
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
      </div>
      <div className="grid gap-2">
        {drafts.map((draft) => {
          const isSelected = draft.id === selectedDraftId;
          return (
            <button
              className={cn(
                'rounded-md border px-3 py-2 text-left text-sm hover:bg-secondary',
                isSelected ? 'border-primary bg-primary/5' : 'border-border bg-background/70'
              )}
              key={draft.id}
              onClick={() => onSelect(draft)}
              type="button"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="font-medium">{draft.title}</span>
                <span className="text-muted-foreground text-xs">{shortDate(draft.createdAt)}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                <Badge>{sourceLabel(draft.source)}</Badge>
                <Badge>{draft.tableCount} tables</Badge>
                {draft.boundScreenJsonId ? <Badge tone="success">bound UI</Badge> : null}
                {draft.historicallyAppliedAt ? <Badge>applied history</Badge> : null}
                <Badge tone={draft.currentMatch ? 'success' : 'warning'}>
                  {draft.currentMatch ? 'current match' : `${draft.gap.blockingCount} gaps`}
                </Badge>
              </div>
            </button>
          );
        })}
        {drafts.length === 0 && !isLoading ? (
          <div className="rounded-md border border-dashed border-border p-3 text-muted-foreground text-sm">
            Draft はまだありません
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Badge({
  children,
  tone = 'default',
}: {
  children: ReactNode;
  tone?: 'default' | 'success' | 'warning';
}) {
  return (
    <span
      className={cn(
        'rounded-md px-2 py-1',
        tone === 'success'
          ? 'bg-emerald-500/10 text-emerald-700'
          : tone === 'warning'
            ? 'bg-amber-500/10 text-amber-700'
            : 'bg-muted text-muted-foreground'
      )}
    >
      {children}
    </span>
  );
}

function MessageList({ messages }: { messages: WorkspaceMessage[] }) {
  if (messages.length === 0) return null;
  return (
    <section className="mt-5">
      <div className="mb-2 text-muted-foreground text-xs font-medium uppercase">Conversation</div>
      <div className="grid gap-3">
        {messages.slice(-6).map((message) => (
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
    </section>
  );
}

function SandboxStateOverview({
  isLoading,
  onSelectTable,
  selectedTable,
  state,
}: {
  isLoading: boolean;
  onSelectTable: (table: string) => void;
  selectedTable: string | null;
  state?: SandboxStateResponse | null;
}) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-4 py-3">
        <div>
          <h2 className="font-semibold">SandboxDB current state</h2>
          <p className="mt-1 text-muted-foreground text-sm">
            `SANDBOX_DATABASE_URL` に実在する public table の構造
          </p>
        </div>
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
      </header>
      <div className="grid gap-3 p-4">
        {(state?.tables ?? []).map((table) => (
          <SandboxTableCard
            isSelected={selectedTable === table.name}
            key={table.name}
            onSelect={() => onSelectTable(table.name)}
            table={table}
          />
        ))}
        {state && state.tables.length === 0 ? (
          <div className="flex min-h-[28rem] items-center justify-center rounded-lg border border-dashed border-border bg-background/50 p-8 text-center">
            <div>
              <Database className="mx-auto h-8 w-8 text-muted-foreground" />
              <h3 className="mt-3 font-semibold text-lg">SandboxDB に table はありません</h3>
              <p className="mt-1 text-muted-foreground text-sm">
                Draft を作成し、選択した Draft を SandboxDB に反映してください。
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SandboxTableCard({
  isSelected,
  onSelect,
  table,
}: {
  isSelected: boolean;
  onSelect: () => void;
  table: SandboxTableState;
}) {
  return (
    <article
      className={cn(
        'rounded-lg border p-4 transition-colors',
        isSelected ? 'border-primary bg-primary/5' : 'border-border bg-background/50'
      )}
    >
      <button className="w-full text-left" onClick={onSelect} type="button">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Table2 className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold">{table.name}</h3>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
              <Badge tone={table.managed ? 'success' : 'warning'}>
                {table.managed ? 'managed' : 'unmanaged'}
              </Badge>
              <Badge>{table.rowCount} rows</Badge>
              <Badge>{table.columns.length} columns</Badge>
            </div>
          </div>
        </div>
      </button>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[36rem] text-left text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 pr-3 font-medium">column</th>
              <th className="py-1 pr-3 font-medium">type</th>
              <th className="py-1 pr-3 font-medium">null</th>
              <th className="py-1 pr-3 font-medium">key</th>
              <th className="py-1 pr-3 font-medium">default</th>
            </tr>
          </thead>
          <tbody>
            {table.columns.map((column) => (
              <tr className="border-t border-border" key={column.name}>
                <td className="py-1.5 pr-3 font-mono">{column.name}</td>
                <td className="py-1.5 pr-3">{column.scalarType}</td>
                <td className="py-1.5 pr-3">{column.nullable ? 'yes' : 'no'}</td>
                <td className="py-1.5 pr-3">{column.primaryKey ? 'PK' : ''}</td>
                <td className="max-w-64 truncate py-1.5 pr-3 text-muted-foreground">
                  {column.defaultValue ?? ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {table.indexes.length > 0 || table.foreignKeys.length > 0 ? (
        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
          <ObjectList
            items={table.indexes.map(
              (index) =>
                `${index.unique ? 'unique ' : ''}${index.name}(${index.columns.join(', ')})`
            )}
            title="indexes"
          />
          <ObjectList
            items={table.foreignKeys.map(
              (foreignKey) =>
                `${foreignKey.name}: ${foreignKey.column} -> ${foreignKey.referencesTable}.${foreignKey.referencesColumn}`
            )}
            title="foreign keys"
          />
        </div>
      ) : null}
    </article>
  );
}

function ObjectList({ items, title }: { items: string[]; title: string }) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="text-muted-foreground">{title}</div>
      <div className="mt-1 grid gap-1">
        {items.map((item) => (
          <span className="rounded-md bg-muted px-2 py-1 font-mono" key={item}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function DraftDetail({
  applyError,
  draft,
  gap,
  isApplying,
  isLoading,
  isReproposing,
  migrationPreview,
  onApply,
  onReproposal,
  selectedDraft,
}: {
  applyError?: string;
  draft: DatabaseSchemaJsonRecord | null;
  gap: DatabaseDraftGapSummary | null;
  isApplying: boolean;
  isLoading: boolean;
  isReproposing: boolean;
  migrationPreview: SandboxMigrationPreview | null;
  onApply: (databaseSchemaJsonId: string) => void;
  onReproposal: () => void;
  selectedDraft: DatabaseDraftSummary | null;
}) {
  if (!selectedDraft) {
    return (
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <FileJson className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold">Draft detail</h2>
        </div>
        <p className="mt-2 text-muted-foreground text-sm">Draft を選択してください。</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <FileJson className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold">Draft detail</h2>
        </div>
        <p className="mt-1 text-muted-foreground text-sm">{selectedDraft.title}</p>
      </header>
      <div className="grid gap-4 p-4">
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
        <div className="flex flex-wrap gap-1.5 text-xs">
          <Badge>{sourceLabel(selectedDraft.source)}</Badge>
          {selectedDraft.boundScreenJsonId ? <Badge tone="success">bound UI</Badge> : null}
          {selectedDraft.historicallyAppliedAt ? <Badge>applied history</Badge> : null}
          <Badge tone={selectedDraft.currentMatch ? 'success' : 'warning'}>
            {selectedDraft.currentMatch ? 'current match' : 'out of sync'}
          </Badge>
        </div>
        <BoundUiSummary selectedDraft={selectedDraft} />
        {draft ? (
          <>
            <div className="grid gap-2 text-sm">
              {draft.schema.tables.map((table) => (
                <div className="rounded-md border border-border bg-background p-3" key={table.name}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{table.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {table.columns.length} columns
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                    {table.columns.map((column) => (
                      <span className="rounded-md bg-muted px-2 py-1 font-mono" key={column.name}>
                        {column.name}:{column.type}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <DraftBindingSummary dataBindings={draft.dataBindings} />
            <GapSummary gap={gap} />
            <MigrationPreview preview={migrationPreview} />
            <div className="grid gap-2">
              <button
                className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-primary px-3 text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isApplying}
                onClick={() => onApply(draft.id)}
                type="button"
              >
                {isApplying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                SandboxDB に反映
              </button>
              <button
                className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-border px-3 text-sm font-medium hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isReproposing}
                onClick={onReproposal}
                type="button"
              >
                {isReproposing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}
                現在の SandboxDB をベースに再提案
              </button>
            </div>
            <details className="rounded-md border border-border bg-background p-3">
              <summary className="cursor-pointer text-sm">JSON を表示</summary>
              <pre className="mt-3 max-h-72 overflow-auto text-xs">
                {JSON.stringify(draft.schema, null, 2)}
              </pre>
            </details>
          </>
        ) : null}
        {applyError ? <p className="text-destructive text-sm">{applyError}</p> : null}
      </div>
    </section>
  );
}

function BoundUiSummary({ selectedDraft }: { selectedDraft: DatabaseDraftSummary }) {
  if (selectedDraft.boundScreenJsonId && selectedDraft.boundPromptSessionId) {
    return (
      <div className="rounded-md border border-border bg-background p-3 text-sm">
        <div className="font-medium">Bound UI</div>
        <p className="mt-1 text-muted-foreground text-xs">
          この Draft から保存された ScreenJSON を開いて runtime binding を確認できます。
        </p>
        <Link
          className="mt-3 inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium hover:bg-secondary"
          params={{ sessionId: selectedDraft.boundPromptSessionId } as never}
          to={'/prompt/session/$sessionId' as never}
        >
          UI を開く
        </Link>
      </div>
    );
  }

  if (selectedDraft.sourceScreenJsonId) {
    return (
      <div className="rounded-md border border-border bg-background p-3 text-muted-foreground text-sm">
        UI binding はまだ保存されていません。
      </div>
    );
  }

  return null;
}

function DraftBindingSummary({ dataBindings }: { dataBindings: DataBinding[] }) {
  if (dataBindings.length === 0) return null;
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="font-medium text-sm">UI bindings</div>
      <div className="mt-2 grid gap-2 text-xs">
        {dataBindings.map((binding) => (
          <div className="rounded-md bg-muted px-2 py-1" key={binding.id}>
            <span className="font-mono">{binding.id}</span>
            <span className="ml-2 text-muted-foreground">
              {binding.operation} {binding.table}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GapSummary({ gap }: { gap: DatabaseDraftGapSummary | null }) {
  if (!gap) return null;
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="font-medium text-sm">Gap</div>
        <Badge tone={gap.currentMatch ? 'success' : 'warning'}>
          {gap.currentMatch ? 'current match' : `${gap.blockingCount} blocking`}
        </Badge>
      </div>
      {gap.items.length > 0 ? (
        <div className="mt-2 grid gap-1.5 text-xs">
          {gap.items.slice(0, 8).map((item, index) => (
            <div className="rounded-md bg-muted px-2 py-1" key={`${item.kind}-${index}`}>
              <span className="font-medium">{item.kind}</span>
              <span className="ml-2 text-muted-foreground">{item.message}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MigrationPreview({ preview }: { preview: SandboxMigrationPreview | null }) {
  if (!preview) return null;
  return (
    <details className="rounded-md border border-border bg-background p-3">
      <summary className="cursor-pointer text-sm">Migration preview</summary>
      <pre className="mt-3 max-h-56 overflow-auto text-xs">{preview.sql}</pre>
    </details>
  );
}

function SandboxRowsPanel({ table }: { table: SandboxTableState | null }) {
  const rows = useSandboxRows(table?.managed ? table.name : null, Boolean(table?.managed));
  if (!table?.managed) return null;
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">{table.name}</h2>
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
