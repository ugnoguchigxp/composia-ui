import { Link, useNavigate } from '@tanstack/react-router';
import {
  CheckCircle2,
  Database,
  Eye,
  FileJson,
  Loader2,
  RefreshCw,
  Send,
  Table2,
  Trash2,
  Wand2,
} from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import type { DataBinding } from '../../../../shared/schemas/data-binding.schema';
import type {
  DatabaseDesignConversationResponse,
  DatabaseDraftGapSummary,
  DatabaseDraftSummary,
  DatabaseSchemaJsonRecord,
  DatabaseTable,
  SandboxMigrationPreview,
  SandboxStateResponse,
  SandboxTableState,
} from '../../../../shared/schemas/database-design.schema';
import { isDatabaseSystemColumnName } from '../../../../shared/schemas/database-design.schema';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../../../components/ui/accordion';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog';
import { useAuth } from '../../../lib/auth';
import { cn } from '../../../lib/utils';
import {
  useApplySandboxMigration,
  useDatabaseDesignConversation,
  useDatabaseDraftGap,
  useDatabaseDrafts,
  useDatabaseSchemaJson,
  useDeleteDatabaseDraft,
  useDropSandboxTable,
  useMigrationPreview,
  useProposeDatabaseDesign,
  useReproposalDatabaseDesign,
  useSandboxState,
  useSandboxTableContents,
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

function sourceFromDraftTrigger(trigger?: string): DatabaseDraftSummary['source'] {
  if (trigger === 'screen-proposal') return 'screen';
  if (trigger === 'db-reproposal') return 'reproposal';
  return 'dbdesign';
}

function columnDefaultLabel(column: DatabaseTable['columns'][number]) {
  if (!column.default || column.default.kind === 'none') return '';
  if (column.default.kind === 'literal') return JSON.stringify(column.default.value);
  if (column.default.kind === 'uuid') return 'gen_random_uuid()';
  if (column.default.kind === 'now') return 'now()';
  return '';
}

function columnConstraintLabel(column: DatabaseTable['columns'][number]) {
  const markers = [];
  if (column.primaryKey) markers.push('PK');
  if (column.unique) markers.push('unique');
  if (!column.nullable) markers.push('not null');
  return markers.join(', ');
}

function columnUiLabel(column: DatabaseTable['columns'][number]) {
  const flags = [];
  if (column.ui.listVisible) flags.push('list');
  if (column.ui.formVisible) flags.push('form');
  if (column.ui.filterable) flags.push('filter');
  if (column.ui.sortable) flags.push('sort');
  return flags.join(', ');
}

function cellValueLabel(value: unknown) {
  if (value === null) return 'NULL';
  if (typeof value === 'undefined') return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function visibleDatabaseColumns<T extends { name: string }>(columns: T[]) {
  return columns.filter((column) => !isDatabaseSystemColumnName(column.name));
}

function confirmDraftDelete(title: string) {
  if (typeof window === 'undefined') return false;
  return window.confirm(`Draft "${title}" を物理削除します。よろしいですか？`);
}

function confirmTableDrop(table: string) {
  if (typeof window === 'undefined') return false;
  return window.confirm(
    `SandboxDB table "${table}" を DROP します。関連する constraint も CASCADE で削除されます。よろしいですか？`
  );
}

export function DatabaseDesignerWorkspace() {
  const auth = useAuth();
  const navigate = useNavigate();
  const initialScreenJsonId = useMemo(() => searchParam('screenJsonId'), []);
  const autoProposedScreenRef = useRef<string | null>(null);

  const sandboxState = useSandboxState(Boolean(auth.user));
  const draftsQuery = useDatabaseDrafts(Boolean(auth.user));
  const drafts = draftsQuery.data?.drafts ?? [];
  const deleteDraft = useDeleteDatabaseDraft();
  const dropTable = useDropSandboxTable();
  const propose = useProposeDatabaseDesign();

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
          void navigate({
            params: { databaseSchemaJsonId: data.databaseSchemaJson.id } as never,
            to: '/dbdesign/drafts/$databaseSchemaJsonId' as never,
          });
        },
      }
    );
  }, [auth.user, initialScreenJsonId, navigate, propose]);

  const handleDeleteDraft = (draft: DatabaseDraftSummary) => {
    if (!confirmDraftDelete(draft.title)) return;
    deleteDraft.mutate(draft.id);
  };

  const handleDropTable = (table: string) => {
    if (!confirmTableDrop(table)) return;
    dropTable.mutate(table);
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
    <div className="mx-auto grid min-h-[calc(100vh-4.25rem)] max-w-[98rem] gap-5 px-4 py-6 md:px-8 xl:grid-cols-[minmax(0,1fr)_28rem]">
      <main className="min-w-0">
        <SandboxStateOverview
          dropError={dropTable.error?.message}
          droppingTableName={dropTable.variables ?? null}
          isDroppingTable={dropTable.isPending}
          isLoading={sandboxState.isLoading}
          onDropTable={handleDropTable}
          state={sandboxState.data}
        />
      </main>

      <aside className="flex min-h-[32rem] flex-col rounded-lg border border-border bg-card">
        <header className="border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            <h1 className="font-semibold text-base">DBDesign</h1>
          </div>
          <p className="mt-1 text-muted-foreground text-xs">SandboxDB の現在状態と Draft 一覧</p>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <DraftList
            deletingDraftId={deleteDraft.variables ?? null}
            drafts={drafts}
            isDeleting={deleteDraft.isPending}
            isLoading={draftsQuery.isLoading}
            onDelete={handleDeleteDraft}
          />
          {propose.error || draftsQuery.error || deleteDraft.error ? (
            <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
              {(propose.error ?? draftsQuery.error ?? deleteDraft.error)?.message}
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

export function DatabaseDraftDetailWorkspace({
  databaseSchemaJsonId,
}: {
  databaseSchemaJsonId: string;
}) {
  const auth = useAuth();
  const navigate = useNavigate();
  const draftsQuery = useDatabaseDrafts(Boolean(auth.user));
  const selectedDraft =
    draftsQuery.data?.drafts.find((draft) => draft.id === databaseSchemaJsonId) ?? null;
  const draftSchemaQuery = useDatabaseSchemaJson(databaseSchemaJsonId, Boolean(auth.user));
  const activeDesignSessionId =
    selectedDraft?.designSessionId ??
    draftSchemaQuery.data?.databaseSchemaJson.designSessionId ??
    null;
  const conversationQuery = useDatabaseDesignConversation(
    activeDesignSessionId,
    Boolean(auth.user && activeDesignSessionId)
  );
  const draftGapQuery = useDatabaseDraftGap(databaseSchemaJsonId, Boolean(auth.user));
  const migrationPreviewQuery = useMigrationPreview(databaseSchemaJsonId, Boolean(auth.user));
  const applyMigration = useApplySandboxMigration();
  const deleteDraft = useDeleteDatabaseDraft();
  const reproposal = useReproposalDatabaseDesign(databaseSchemaJsonId);
  const [prompt, setPrompt] = useState('');

  const selectCreatedDraft = (data: { databaseSchemaJson: { id: string } }) => {
    setPrompt('');
    void navigate({
      params: { databaseSchemaJsonId: data.databaseSchemaJson.id } as never,
      to: '/dbdesign/drafts/$databaseSchemaJsonId' as never,
    });
  };

  const handleReproposalSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || reproposal.isPending) return;
    reproposal.mutate({ prompt: trimmed }, { onSuccess: selectCreatedDraft });
  };

  const handleDeleteCurrentDraft = () => {
    const title =
      selectedDraft?.title ?? draftSchemaQuery.data?.databaseSchemaJson.schema.label ?? 'Draft';
    if (!confirmDraftDelete(title)) return;
    deleteDraft.mutate(databaseSchemaJsonId, {
      onSuccess: () => {
        void navigate({ to: '/dbdesign' });
      },
    });
  };

  if (auth.isLoading) {
    return <div className="mx-auto max-w-6xl px-4 py-10 text-muted-foreground">Loading...</div>;
  }

  if (!auth.user) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <section className="rounded-lg border border-border bg-card p-[var(--ui-card-padding)]">
          <h1 className="text-2xl font-semibold">Draft detail</h1>
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
    <div className="mx-auto grid max-w-[90rem] gap-4 px-4 py-6 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          className="inline-flex h-9 w-fit items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-secondary"
          to="/dbdesign"
        >
          DBDesign に戻る
        </Link>
        <button
          className="inline-flex h-9 items-center gap-2 rounded-md border border-destructive/30 px-3 text-destructive text-sm font-medium hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={deleteDraft.isPending}
          onClick={handleDeleteCurrentDraft}
          type="button"
        >
          {deleteDraft.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
          Draft を削除
        </button>
      </div>
      {deleteDraft.error ? (
        <p className="text-destructive text-sm">{deleteDraft.error.message}</p>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <DraftDetail
          applyError={applyMigration.error?.message}
          draft={draftSchemaQuery.data?.databaseSchemaJson ?? null}
          gap={draftGapQuery.data?.gap ?? selectedDraft?.gap ?? null}
          isApplying={applyMigration.isPending}
          isLoading={draftSchemaQuery.isLoading || draftsQuery.isLoading}
          migrationPreview={migrationPreviewQuery.data ?? null}
          onApply={(id) => applyMigration.mutate(id)}
          selectedDraft={selectedDraft}
        />
        <DraftPromptPanel
          error={reproposal.error?.message}
          isConversationLoading={conversationQuery.isLoading}
          isPending={reproposal.isPending}
          messages={conversationQuery.data?.messages ?? []}
          onPromptChange={setPrompt}
          onSubmit={handleReproposalSubmit}
          prompt={prompt}
        />
      </div>
    </div>
  );
}

function DraftList({
  deletingDraftId,
  drafts,
  isDeleting,
  isLoading,
  onDelete,
}: {
  deletingDraftId: string | null;
  drafts: DatabaseDraftSummary[];
  isDeleting: boolean;
  isLoading: boolean;
  onDelete: (draft: DatabaseDraftSummary) => void;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-muted-foreground text-xs font-medium uppercase">Drafts</div>
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
      </div>
      <div className="grid gap-2">
        {drafts.map((draft) => {
          return (
            <article
              className="flex items-start gap-2 rounded-md border border-border bg-background/70 text-sm hover:bg-secondary"
              key={draft.id}
            >
              <Link
                className="min-w-0 flex-1 px-3 py-2 text-left"
                params={{ databaseSchemaJsonId: draft.id } as never}
                to={'/dbdesign/drafts/$databaseSchemaJsonId' as never}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="font-medium">{draft.title}</span>
                  <span className="text-muted-foreground text-xs">
                    {shortDate(draft.createdAt)}
                  </span>
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
              </Link>
              <button
                aria-label={`${draft.title} を削除`}
                className="mr-2 mt-2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isDeleting}
                onClick={() => onDelete(draft)}
                title="Draft を削除"
                type="button"
              >
                {isDeleting && deletingDraftId === draft.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </button>
            </article>
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

function MessageList({
  isLoading,
  messages,
}: {
  isLoading: boolean;
  messages: WorkspaceMessage[];
}) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Conversation を読み込み中
      </div>
    );
  }

  if (messages.length === 0) {
    return <div className="text-muted-foreground text-sm">会話履歴はまだありません。</div>;
  }

  return (
    <section>
      <div className="mb-2 text-muted-foreground text-xs font-medium uppercase">Conversation</div>
      <div className="grid gap-3">
        {messages.slice(-8).map((message) => (
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
  dropError,
  droppingTableName,
  isDroppingTable,
  isLoading,
  onDropTable,
  state,
}: {
  dropError?: string;
  droppingTableName: string | null;
  isDroppingTable: boolean;
  isLoading: boolean;
  onDropTable: (table: string) => void;
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
        <SandboxTableAccordion
          droppingTableName={droppingTableName}
          isDroppingTable={isDroppingTable}
          onDropTable={onDropTable}
          tables={state?.tables ?? []}
        />
        {dropError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
            {dropError}
          </div>
        ) : null}
        {state && state.tables.length === 0 ? (
          <div className="flex min-h-[28rem] items-center justify-center rounded-lg border border-dashed border-border bg-background/50 p-8 text-center">
            <div>
              <Database className="mx-auto h-8 w-8 text-muted-foreground" />
              <h3 className="mt-3 font-semibold text-lg">SandboxDB に table はありません</h3>
              <p className="mt-1 text-muted-foreground text-sm">
                Prompt からテーブル定義を作成し、Draft 詳細で SandboxDB に反映してください。
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SandboxTableAccordion({
  droppingTableName,
  isDroppingTable,
  onDropTable,
  tables,
}: {
  droppingTableName: string | null;
  isDroppingTable: boolean;
  onDropTable: (table: string) => void;
  tables: SandboxTableState[];
}) {
  const [contentsTable, setContentsTable] = useState<SandboxTableState | null>(null);

  if (tables.length === 0) return null;

  return (
    <>
      <Accordion className="grid gap-2" collapsible type="single">
        {tables.map((table) => (
          <AccordionItem key={table.name} value={table.name}>
            <AccordionTrigger>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Table2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate font-semibold">{table.name}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  <Badge tone={table.managed ? 'success' : 'warning'}>
                    {table.managed ? 'managed' : 'unmanaged'}
                  </Badge>
                  <Badge>{table.rowCount} rows</Badge>
                  <Badge>{visibleDatabaseColumns(table.columns).length} columns</Badge>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid gap-3 text-xs">
                <SandboxColumnTable columns={table.columns} />
                {table.indexes.length > 0 ? (
                  <div>
                    <div className="mb-1 text-muted-foreground">indexes</div>
                    <div className="flex flex-wrap gap-1.5">
                      {table.indexes.map((index) => (
                        <span className="rounded-md bg-muted px-2 py-1 font-mono" key={index.name}>
                          {index.unique ? 'unique ' : ''}
                          {index.name}({index.columns.join(', ')})
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {table.foreignKeys.length > 0 ? (
                  <div>
                    <div className="mb-1 text-muted-foreground">foreign keys</div>
                    <div className="flex flex-wrap gap-1.5">
                      {table.foreignKeys.map((foreignKey) => (
                        <span
                          className="rounded-md bg-muted px-2 py-1 font-mono"
                          key={foreignKey.name}
                        >
                          {foreignKey.name}: {foreignKey.column} -&gt; {foreignKey.referencesTable}.
                          {foreignKey.referencesColumn}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center justify-between gap-2 border-border border-t pt-3">
                  <button
                    className="inline-flex h-8 items-center gap-2 rounded-md border border-border px-3 font-medium text-xs hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => setContentsTable(table)}
                    type="button"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    登録値を見る
                  </button>
                  <button
                    className="inline-flex h-8 items-center gap-2 rounded-md border border-destructive/40 px-3 font-medium text-destructive text-xs hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isDroppingTable}
                    onClick={() => onDropTable(table.name)}
                    type="button"
                  >
                    {isDroppingTable && droppingTableName === table.name ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    Table を DROP
                  </button>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      <SandboxRowsDialog
        onOpenChange={(open) => !open && setContentsTable(null)}
        table={contentsTable}
      />
    </>
  );
}

function SandboxRowsDialog({
  onOpenChange,
  table,
}: {
  onOpenChange: (open: boolean) => void;
  table: SandboxTableState | null;
}) {
  const rowsQuery = useSandboxTableContents(table?.name ?? null, Boolean(table));
  const rows = rowsQuery.data?.rows ?? [];
  const columns = useMemo(() => {
    const tableColumns =
      table?.columns
        .map((column) => column.name)
        .filter((column) => !isDatabaseSystemColumnName(column)) ?? [];
    const extras = rows
      .flatMap((row) => Object.keys(row))
      .filter((key) => !isDatabaseSystemColumnName(key) && !tableColumns.includes(key));
    return [...tableColumns, ...Array.from(new Set(extras))];
  }, [rows, table?.columns]);

  return (
    <Dialog onOpenChange={onOpenChange} open={Boolean(table)}>
      <DialogContent className="flex max-w-[min(96vw,76rem)] flex-col">
        <DialogHeader>
          <DialogTitle>{table?.name ?? 'Table'} の登録値</DialogTitle>
          <DialogDescription>
            SandboxDB に保存されている rows を最大 100 件まで表示します。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5 text-xs">
            <Badge>{rows.length} loaded rows</Badge>
            {table ? <Badge>{table.rowCount} total rows</Badge> : null}
          </div>
          <button
            className="inline-flex h-8 items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
            disabled={rowsQuery.isFetching}
            onClick={() => rowsQuery.refetch()}
            type="button"
          >
            {rowsQuery.isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            再読み込み
          </button>
        </div>

        {rowsQuery.error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
            {rowsQuery.error.message}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border bg-background">
          {rowsQuery.isLoading ? (
            <div className="flex min-h-52 items-center justify-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              登録値を読み込み中
            </div>
          ) : rows.length === 0 ? (
            <div className="flex min-h-52 items-center justify-center text-muted-foreground text-sm">
              登録値はありません。
            </div>
          ) : (
            <table className="w-full min-w-[48rem] text-left text-xs">
              <thead className="sticky top-0 bg-background text-muted-foreground">
                <tr>
                  {columns.map((column) => (
                    <th className="border-border border-b px-3 py-2 font-medium" key={column}>
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr className="border-border border-t" key={String(row.id ?? index)}>
                    {columns.map((column) => (
                      <td className="max-w-80 truncate px-3 py-2 font-mono" key={column}>
                        {cellValueLabel(row[column])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SandboxColumnTable({ columns }: { columns: SandboxTableState['columns'] }) {
  const visibleColumns = visibleDatabaseColumns(columns);

  return (
    <div>
      <div className="mb-1 text-muted-foreground">columns</div>
      <div className="overflow-x-auto rounded-md border border-border bg-background">
        <table className="w-full min-w-[36rem] text-left text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">column</th>
              <th className="px-3 py-2 font-medium">type</th>
              <th className="px-3 py-2 font-medium">null</th>
              <th className="px-3 py-2 font-medium">key</th>
              <th className="px-3 py-2 font-medium">default</th>
            </tr>
          </thead>
          <tbody>
            {visibleColumns.map((column) => (
              <tr className="border-t border-border" key={column.name}>
                <td className="px-3 py-2 font-mono">{column.name}</td>
                <td className="px-3 py-2 font-mono">{column.scalarType}</td>
                <td className="px-3 py-2">{column.nullable ? 'yes' : 'no'}</td>
                <td className="px-3 py-2">{column.primaryKey ? 'PK' : ''}</td>
                <td className="max-w-64 truncate px-3 py-2 font-mono text-muted-foreground">
                  {column.defaultValue ?? ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
  migrationPreview,
  onApply,
  selectedDraft,
}: {
  applyError?: string;
  draft: DatabaseSchemaJsonRecord | null;
  gap: DatabaseDraftGapSummary | null;
  isApplying: boolean;
  isLoading: boolean;
  migrationPreview: SandboxMigrationPreview | null;
  onApply: (databaseSchemaJsonId: string) => void;
  selectedDraft: DatabaseDraftSummary | null;
}) {
  if (!selectedDraft) {
    if (draft) {
      return (
        <section className="rounded-lg border border-border bg-card">
          <header className="border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <FileJson className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold">Draft detail</h2>
            </div>
            <p className="mt-1 text-muted-foreground text-sm">{draft.schema.label}</p>
          </header>
          <DraftDetailBody
            applyError={applyError}
            draft={draft}
            gap={gap}
            isApplying={isApplying}
            isLoading={isLoading}
            migrationPreview={migrationPreview}
            onApply={onApply}
            selectedDraft={null}
          />
        </section>
      );
    }

    return (
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <FileJson className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold">Draft detail</h2>
        </div>
        <p className="mt-2 text-muted-foreground text-sm">Draft を読み込み中です。</p>
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
      <DraftDetailBody
        applyError={applyError}
        draft={draft}
        gap={gap}
        isApplying={isApplying}
        isLoading={isLoading}
        migrationPreview={migrationPreview}
        onApply={onApply}
        selectedDraft={selectedDraft}
      />
    </section>
  );
}

function DraftDetailBody({
  applyError,
  draft,
  gap,
  isApplying,
  isLoading,
  migrationPreview,
  onApply,
  selectedDraft,
}: {
  applyError?: string;
  draft: DatabaseSchemaJsonRecord | null;
  gap: DatabaseDraftGapSummary | null;
  isApplying: boolean;
  isLoading: boolean;
  migrationPreview: SandboxMigrationPreview | null;
  onApply: (databaseSchemaJsonId: string) => void;
  selectedDraft: DatabaseDraftSummary | null;
}) {
  const source = selectedDraft?.source ?? sourceFromDraftTrigger(draft?.trigger);

  return (
    <div className="grid gap-4 p-4">
      {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
      <div className="flex flex-wrap gap-1.5 text-xs">
        <Badge>{sourceLabel(source)}</Badge>
        {selectedDraft?.boundScreenJsonId ? <Badge tone="success">bound UI</Badge> : null}
        {selectedDraft?.historicallyAppliedAt ? <Badge>applied history</Badge> : null}
        {selectedDraft ? (
          <Badge tone={selectedDraft.currentMatch ? 'success' : 'warning'}>
            {selectedDraft.currentMatch ? 'current match' : 'out of sync'}
          </Badge>
        ) : null}
      </div>
      {selectedDraft ? <BoundUiSummary selectedDraft={selectedDraft} /> : null}
      {draft ? (
        <>
          <DraftTableList tables={draft.schema.tables} />
          <DraftBindingSummary dataBindings={draft.dataBindings} />
          <GapSummary gap={gap} />
          <DdlPreview preview={migrationPreview} />
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
  );
}

function DraftTableList({ tables }: { tables: DatabaseTable[] }) {
  return (
    <section className="grid gap-3">
      <div>
        <h3 className="font-medium text-sm">Tables</h3>
        <p className="mt-1 text-muted-foreground text-xs">Draft が作成する table の一覧</p>
      </div>
      <Accordion className="grid gap-2" collapsible type="single">
        {tables.map((table) => (
          <AccordionItem key={table.name} value={table.name}>
            <AccordionTrigger>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Table2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate font-semibold">{table.name}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  <Badge>{visibleDatabaseColumns(table.columns).length} columns</Badge>
                  <Badge>{table.indexes.length} indexes</Badge>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid gap-3 text-xs">
                <div className="font-medium text-foreground">{table.label}</div>
                {table.description ? <div>{table.description}</div> : null}
                <div className="flex flex-wrap gap-1.5">
                  {table.ui.displayField ? <Badge>display: {table.ui.displayField}</Badge> : null}
                  {table.ui.defaultSortField ? (
                    <Badge>
                      sort: {table.ui.defaultSortField} {table.ui.defaultSortDirection}
                    </Badge>
                  ) : null}
                </div>
                <DraftColumnTable columns={table.columns} />
                {table.indexes.length > 0 ? (
                  <div>
                    <div className="mb-1 text-muted-foreground">indexes</div>
                    <div className="flex flex-wrap gap-1.5">
                      {table.indexes.map((index) => (
                        <span className="rounded-md bg-muted px-2 py-1 font-mono" key={index.name}>
                          {index.unique ? 'unique ' : ''}
                          {index.name}({index.columns.join(', ')})
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}

function DraftColumnTable({ columns }: { columns: DatabaseTable['columns'] }) {
  const visibleColumns = visibleDatabaseColumns(columns);

  return (
    <div>
      <div className="mb-1 text-muted-foreground">columns</div>
      <div className="overflow-x-auto rounded-md border border-border bg-background">
        <table className="w-full min-w-[44rem] text-left text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">column</th>
              <th className="px-3 py-2 font-medium">label</th>
              <th className="px-3 py-2 font-medium">type</th>
              <th className="px-3 py-2 font-medium">constraints</th>
              <th className="px-3 py-2 font-medium">default</th>
              <th className="px-3 py-2 font-medium">ui</th>
            </tr>
          </thead>
          <tbody>
            {visibleColumns.map((column) => (
              <tr className="border-t border-border" key={column.name}>
                <td className="px-3 py-2 font-mono">{column.name}</td>
                <td className="px-3 py-2">{column.label}</td>
                <td className="px-3 py-2 font-mono">
                  {column.enumName ?? column.type}
                  {column.enumValues ? `(${column.enumValues.join(', ')})` : ''}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{columnConstraintLabel(column)}</td>
                <td className="px-3 py-2 font-mono text-muted-foreground">
                  {columnDefaultLabel(column)}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{columnUiLabel(column)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DraftPromptPanel({
  error,
  isConversationLoading,
  isPending,
  messages,
  onPromptChange,
  onSubmit,
  prompt,
}: {
  error?: string;
  isConversationLoading: boolean;
  isPending: boolean;
  messages: WorkspaceMessage[];
  onPromptChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  prompt: string;
}) {
  return (
    <aside className="flex min-h-[24rem] flex-col rounded-lg border border-border bg-card">
      <header className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold">AI Draft 再提案</h2>
        </div>
        <p className="mt-1 text-muted-foreground text-xs">
          Draft と現在の SandboxDB を元に再提案します。
        </p>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <MessageList isLoading={isConversationLoading} messages={messages} />
      </div>
      <form className="grid gap-3 border-t border-border p-3" onSubmit={onSubmit}>
        <textarea
          className="min-h-36 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          maxLength={4000}
          onChange={(event) => onPromptChange(event.target.value)}
          placeholder="不足している列、消したい table、UI binding の変更などを入力"
          value={prompt}
        />
        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
            {error}
          </div>
        ) : null}
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
            再提案
          </button>
        </div>
      </form>
    </aside>
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

function DdlPreview({ preview }: { preview: SandboxMigrationPreview | null }) {
  if (!preview) return null;
  return (
    <details className="rounded-md border border-border bg-background p-3">
      <summary className="cursor-pointer text-sm">DDL preview</summary>
      {preview.warnings.length > 0 ? (
        <div className="mt-3 grid gap-1 text-amber-700 text-xs">
          {preview.warnings.map((warning) => (
            <div className="rounded-md bg-amber-500/10 px-2 py-1" key={warning}>
              {warning}
            </div>
          ))}
        </div>
      ) : null}
      <pre className="mt-3 max-h-56 overflow-auto text-xs">{preview.sql}</pre>
    </details>
  );
}
