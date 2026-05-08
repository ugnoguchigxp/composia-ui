import { Link, useNavigate } from '@tanstack/react-router';
import {
  Activity,
  Bot,
  CheckCircle2,
  ChevronDown,
  Database,
  FileJson,
  Link2,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  User,
  WandSparkles,
  XCircle,
} from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AiActivity } from '../../../../shared/schemas/ai.schema';
import type { SandboxStateResponse } from '../../../../shared/schemas/database-design.schema';
import type {
  GeneratedScreen,
  PromptSessionMessage,
  PromptSessionSummary,
  ScreenActionLink,
  ScreenCheckpoint,
  ScreenJson,
} from '../../../../shared/schemas/screen-history.schema';
import {
  collectRenderableActions,
  updateRenderableActionTarget,
} from '../../../../shared/schemas/ui-action-collector';
import type { AppAction, AppUiSchema } from '../../../../shared/schemas/ui-schema.schema';
import { useAuth } from '../../../lib/auth';
import { logRenderPerf, measureRenderTask, renderPerfStart } from '../../../lib/render-performance';
import { cn } from '../../../lib/utils';
import {
  useInsertSandboxRow,
  useSandboxBindingRows,
  useSandboxState,
} from '../../database-design/hooks/database-design.hooks';
import { JsonRenderRenderer } from '../../ui-schema/components/JsonRenderRenderer';
import {
  useEditSessionScreen,
  useGeneratedScreen,
  useGenerateScreen,
  useGenerateScreenFromAction,
  useGenerateScreenFromSessionAction,
  useRestoreScreenJsonCheckpoint,
  useScreenConversation,
  useScreenHistory,
} from '../hooks/screen-history.hooks';
import {
  type BindingRuntimeIssue,
  bindingRuntimeIsReady,
  bindingRuntimeIssue,
  resolveScreenRuntimeBindings,
  submitBindingRuntimeIssue,
} from '../services/binding-runtime.service';

type WorkspaceScreen = GeneratedScreen | ScreenJson;

type ChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  metadata?: PromptSessionMessage['metadata'];
};

type DockActivity = Omit<AiActivity, 'status'> & {
  status: AiActivity['status'] | 'pending' | 'running';
};

type BindingNotice = {
  message: string;
  tone: 'error' | 'success';
};

type DatabaseVersionStatus = 'ui-only' | 'checking' | 'draft' | 'live';
type DockTab = 'chat' | 'compose';

type SelectedAction = {
  action: AppAction;
  sourcePage: string;
};

const defaultPrompt =
  '売上、問い合わせ、障害対応の状況を一目で把握できる運用ダッシュボードを作ってください。';

const initialAssistantMessage: ChatMessage = {
  id: 'assistant-initial',
  role: 'assistant',
  content: 'どんな UI にしますか？',
};

function createId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
}

function pendingActivities(endpoint: string): DockActivity[] {
  return [
    {
      id: 'request',
      label: 'API request',
      status: 'running',
      detail: endpoint,
    },
    {
      id: 'provider-response',
      label: 'AI provider response',
      status: 'pending',
    },
    {
      id: 'schema-validation',
      label: 'App UI Schema validation',
      status: 'pending',
    },
    {
      id: 'catalog-validation',
      label: 'Component catalog validation',
      status: 'pending',
    },
    {
      id: 'render',
      label: 'json-render preview',
      status: 'pending',
    },
  ];
}

function completedActivities(
  data: { activities: AiActivity[]; screen: GeneratedScreen },
  endpoint: string
) {
  return [
    {
      id: 'request',
      label: 'API request',
      status: 'completed' as const,
      detail: endpoint,
    },
    ...data.activities,
    {
      id: 'render',
      label: 'json-render preview',
      status: 'completed' as const,
      detail: data.screen.schema.page,
    },
  ];
}

function messageFromStored(message: PromptSessionMessage): ChatMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    metadata: message.metadata,
  };
}

function hasDatabaseVersionSignal(
  screen: Pick<ScreenJson, 'dataBindings' | 'databaseSchemaJsonId'>
) {
  return Boolean(screen.databaseSchemaJsonId || screen.dataBindings.length > 0);
}

function databaseVersionStatus(
  screen: Pick<ScreenJson, 'dataBindings' | 'databaseSchemaJsonId'>,
  sandboxState: SandboxStateResponse | null | undefined
): DatabaseVersionStatus {
  if (!hasDatabaseVersionSignal(screen)) return 'ui-only';
  if (!sandboxState) return 'checking';

  const liveTables = new Set(sandboxState.tables.map((table) => table.name));
  const bindingTables = new Set(screen.dataBindings.map((binding) => binding.table));
  if (bindingTables.size > 0) {
    return Array.from(bindingTables).every((table) => liveTables.has(table)) ? 'live' : 'draft';
  }

  return screen.databaseSchemaJsonId &&
    screen.databaseSchemaJsonId === sandboxState.appliedDatabaseSchemaJsonId
    ? 'live'
    : 'draft';
}

function databaseVersionStatusLabel(status: DatabaseVersionStatus) {
  switch (status) {
    case 'live':
      return 'SandboxDB 実テーブルあり';
    case 'draft':
      return 'DB Draft のみ';
    case 'checking':
      return 'DB 状態を確認中';
    case 'ui-only':
      return 'UI のみ';
  }
}

export function PromptWorkspace({
  screenId,
  sessionId,
}: {
  screenId?: string | null;
  sessionId?: string | null;
}) {
  const renderStartedAt = renderPerfStart();
  const auth = useAuth();
  const navigate = useNavigate();
  const [isDockOpen, setIsDockOpen] = useState(true);
  const [dockTab, setDockTab] = useState<DockTab>('chat');
  const [localScreen, setLocalScreen] = useState<WorkspaceScreen | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [restoringScreenJsonId, setRestoringScreenJsonId] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<SelectedAction | null>(null);
  const [composeNotice, setComposeNotice] = useState<BindingNotice | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([initialAssistantMessage]);
  const handledScreenRouteRef = useRef<string | null>(null);
  const [activities, setActivities] = useState<DockActivity[]>([]);
  const [promptResetKey, setPromptResetKey] = useState(0);
  const screenQuery = useGeneratedScreen(screenId ?? null, Boolean(auth.user && screenId));
  const routeSessionId = sessionId ?? screenQuery.data?.screen.sessionId ?? null;
  const conversationQuery = useScreenConversation(
    routeSessionId,
    Boolean(auth.user && routeSessionId)
  );
  const generateScreen = useGenerateScreen();
  const editSessionScreen = useEditSessionScreen(routeSessionId);
  const restoreCheckpoint = useRestoreScreenJsonCheckpoint(routeSessionId);
  const insertSandboxRow = useInsertSandboxRow();
  const historyQuery = useScreenHistory(
    { limit: 100, page: 1, sortBy: 'updatedAt', sortOrder: 'desc' },
    Boolean(auth.user && isDockOpen && dockTab === 'compose')
  );
  const actionParentId =
    localScreen && (!screenId || localScreen.id === screenId) ? localScreen.id : (screenId ?? null);
  const generateFromAction = useGenerateScreenFromAction(actionParentId);
  const generateFromSessionAction = useGenerateScreenFromSessionAction(routeSessionId);
  const generateScreenMutate = generateScreen.mutate;
  const editSessionScreenMutate = editSessionScreen.mutate;
  const restoreCheckpointMutate = restoreCheckpoint.mutate;
  const generateFromActionMutate = generateFromAction.mutate;
  const generateFromSessionActionMutate = generateFromSessionAction.mutate;
  const insertSandboxRowMutate = insertSandboxRow.mutate;
  const activeConversationScreen = conversationQuery.data?.activeScreenJson ?? null;
  const activeScreenStartedAt = renderPerfStart();
  const activeScreen: WorkspaceScreen | null =
    localScreen ??
    (sessionId
      ? activeConversationScreen
      : (screenQuery.data?.screen ?? activeConversationScreen)) ??
    null;
  logRenderPerf('PromptWorkspace.activeScreenSelection', activeScreenStartedAt, {
    hasActiveConversationScreen: Boolean(activeConversationScreen),
    hasLocalScreen: Boolean(localScreen),
    hasScreenQueryData: Boolean(screenQuery.data?.screen),
    route: sessionId ? 'session' : screenId ? 'screen' : 'new',
  });
  const checkpointHasDatabaseVersion = useMemo(
    () =>
      measureRenderTask(
        'PromptWorkspace.checkpointHasDatabaseVersion',
        () => Boolean(conversationQuery.data?.checkpoints.some(hasDatabaseVersionSignal)),
        (result) => ({
          checkpointCount: conversationQuery.data?.checkpoints.length ?? 0,
          result,
        })
      ),
    [conversationQuery.data?.checkpoints]
  );
  const sandboxState = useSandboxState(
    Boolean(
      auth.user &&
        ((activeScreen ? hasDatabaseVersionSignal(activeScreen) : false) ||
          checkpointHasDatabaseVersion)
    )
  );
  const availableActions = useMemo(
    () =>
      measureRenderTask(
        'PromptWorkspace.availableActions',
        () => (activeScreen ? collectRenderableActions(activeScreen.schema) : []),
        (result) => ({
          actionCount: result.length,
          sectionCount: activeScreen?.schema.sections.length ?? 0,
        })
      ),
    [activeScreen]
  );
  const persistedMessages = useMemo(() => {
    return measureRenderTask(
      'PromptWorkspace.persistedMessages',
      () => {
        const conversation = conversationQuery.data;
        if (!conversation) return [];

        const checkpointVersionById = new Map(
          conversation.checkpoints.map((checkpoint) => [checkpoint.id, checkpoint.version])
        );
        const activeVersion = conversation.activeVersion;

        return conversation.messages
          .filter((message) => {
            if (!activeVersion) return true;
            const messageVersion =
              checkpointVersionById.get(message.screenJsonId) ?? message.metadata.version;
            return !messageVersion || messageVersion <= activeVersion;
          })
          .map(messageFromStored);
      },
      (result) => ({
        checkpointCount: conversationQuery.data?.checkpoints.length ?? 0,
        inputMessageCount: conversationQuery.data?.messages.length ?? 0,
        outputMessageCount: result.length,
      })
    );
  }, [conversationQuery.data]);
  const persistedMessageKey = conversationQuery.data?.messages
    .map((message) => message.id)
    .join('|');
  const localOverlayMessages = messages.filter(
    (message) => message.id !== initialAssistantMessage.id
  );
  const displayMessages =
    persistedMessages.length > 0 ? [...persistedMessages, ...localOverlayMessages] : messages;
  const activeScreenJsonId = conversationQuery.data?.activeScreenJsonId ?? activeScreen?.id ?? null;
  const [bindingNotice, setBindingNotice] = useState<BindingNotice | null>(null);
  const [pendingBindingId, setPendingBindingId] = useState<string | null>(null);
  const bindingResolution = useMemo(
    () =>
      measureRenderTask(
        'PromptWorkspace.resolveScreenRuntimeBindings',
        () =>
          activeScreen
            ? resolveScreenRuntimeBindings(activeScreen.schema, activeScreen.dataBindings)
            : { issues: [], runtimeBindings: [] },
        (result) => ({
          bindingCount: activeScreen?.dataBindings.length ?? 0,
          issueCount: result.issues.length,
          runtimeBindingCount: result.runtimeBindings.length,
          sectionCount: activeScreen?.schema.sections.length ?? 0,
        })
      ),
    [activeScreen]
  );
  const runtimeBindings = bindingResolution.runtimeBindings;
  const readyListBindings = useMemo(
    () =>
      measureRenderTask(
        'PromptWorkspace.readyListBindings',
        () =>
          runtimeBindings.filter(
            (binding) =>
              binding.operation === 'list' && bindingRuntimeIsReady(binding, sandboxState.data)
          ),
        (result) => ({
          readyListBindingCount: result.length,
          runtimeBindingCount: runtimeBindings.length,
          sandboxTableCount: sandboxState.data?.tables.length ?? 0,
        })
      ),
    [runtimeBindings, sandboxState.data]
  );
  const rowQueries = useSandboxBindingRows(
    readyListBindings,
    Boolean(auth.user && readyListBindings.length > 0)
  );
  const rowQueriesRef = useRef(rowQueries);
  rowQueriesRef.current = rowQueries;
  const rowDataVersion = rowQueries
    .map((query) => `${query.dataUpdatedAt}:${query.data?.rows.length ?? 0}`)
    .join('|');
  const rowErrorVersion = rowQueries
    .map(
      (query) =>
        `${query.errorUpdatedAt}:${query.error instanceof Error ? query.error.message : ''}`
    )
    .join('|');
  const bindingRows = useMemo(() => {
    return measureRenderTask(
      'PromptWorkspace.bindingRows',
      () => {
        if (readyListBindings.length === 0 && rowDataVersion.length === 0) return {};
        const entries = readyListBindings.flatMap((binding, index) => {
          const query = rowQueriesRef.current[index];
          return query?.data ? [[binding.id, query.data.rows] as const] : [];
        });
        return Object.fromEntries(entries);
      },
      (result) => ({
        bindingRowSets: Object.keys(result).length,
        readyListBindingCount: readyListBindings.length,
      })
    );
  }, [readyListBindings, rowDataVersion]);
  const bindingIssues = useMemo(() => {
    return measureRenderTask(
      'PromptWorkspace.bindingIssues',
      () => {
        if (
          bindingResolution.issues.length === 0 &&
          readyListBindings.length === 0 &&
          runtimeBindings.length === 0 &&
          rowErrorVersion.length === 0 &&
          !sandboxState.data
        ) {
          return [];
        }
        const issues = [
          ...bindingResolution.issues,
          ...runtimeBindings
            .map((binding) => bindingRuntimeIssue(binding, sandboxState.data))
            .filter((issue): issue is BindingRuntimeIssue => Boolean(issue)),
        ];
        for (const [index, binding] of readyListBindings.entries()) {
          const error = rowQueriesRef.current[index]?.error;
          if (error instanceof Error) {
            issues.push({ bindingId: binding.id, message: error.message });
          }
        }
        return issues;
      },
      (result) => ({
        issueCount: result.length,
        readyListBindingCount: readyListBindings.length,
        runtimeBindingCount: runtimeBindings.length,
      })
    );
  }, [
    bindingResolution.issues,
    readyListBindings,
    rowErrorVersion,
    runtimeBindings,
    sandboxState.data,
  ]);
  const isPending =
    generateScreen.isPending ||
    generateFromAction.isPending ||
    generateFromSessionAction.isPending ||
    editSessionScreen.isPending ||
    restoreCheckpoint.isPending ||
    insertSandboxRow.isPending;

  const openSession = useCallback(
    (nextSessionId: string) => {
      void navigate({ params: { sessionId: nextSessionId }, to: '/prompt/session/$sessionId' });
    },
    [navigate]
  );

  const appendUserMessage = useCallback((content: string) => {
    setMessages((current) => [
      ...current,
      {
        id: createId('user'),
        role: 'user',
        content,
      },
    ]);
  }, []);

  const appendAssistantMessage = useCallback((content: string, screen: GeneratedScreen) => {
    setMessages((current) => [
      ...current,
      {
        id: createId('assistant'),
        role: 'assistant',
        content,
        metadata: {
          checkpointScreenJsonId: screen.id,
          checkpointLabel: 'このバージョンへ戻る',
          generatedPage: screen.schema.page,
          version: screen.version,
          trigger: screen.trigger,
        },
      },
    ]);
  }, []);

  const handleSubmitPrompt = useCallback(
    (trimmed: string) => {
      if (!trimmed || isPending) return;

      const shouldEdit = Boolean(routeSessionId && activeScreen);
      const endpoint = shouldEdit
        ? `POST /api/sessions/${routeSessionId}/edit`
        : 'POST /api/screens/generate';

      setIsDockOpen(true);
      appendUserMessage(trimmed);
      setActivities(pendingActivities(endpoint));

      if (shouldEdit && routeSessionId) {
        editSessionScreenMutate(
          { prompt: trimmed },
          {
            onSuccess: (data) => {
              setLocalScreen(data.screen);
              setPromptResetKey((current) => current + 1);
              setActivities(completedActivities(data, endpoint));
              appendAssistantMessage(`${data.screen.schema.page} を更新しました。`, data.screen);
              openSession(data.screen.sessionId);
            },
            onError: (error) => {
              setActivities([
                {
                  id: 'request',
                  label: 'API request',
                  status: 'failed',
                  detail: error instanceof Error ? error.message : 'Request failed',
                },
              ]);
              setMessages((current) => [
                ...current,
                {
                  id: createId('assistant'),
                  role: 'assistant',
                  content:
                    error instanceof Error ? error.message : 'The UI schema could not be edited.',
                },
              ]);
            },
          }
        );
        return;
      }

      generateScreenMutate(
        { prompt: trimmed },
        {
          onSuccess: (data) => {
            setLocalScreen(data.screen);
            setPromptResetKey((current) => current + 1);
            setActivities(completedActivities(data, endpoint));
            appendAssistantMessage(
              `${data.screen.schema.page} を保存しました。${data.screen.schema.sections.length} sections`,
              data.screen
            );
            openSession(data.screen.sessionId);
          },
          onError: (error) => {
            setActivities([
              {
                id: 'request',
                label: 'API request',
                status: 'failed',
                detail: error instanceof Error ? error.message : 'Request failed',
              },
            ]);
            setMessages((current) => [
              ...current,
              {
                id: createId('assistant'),
                role: 'assistant',
                content:
                  error instanceof Error ? error.message : 'The UI schema could not be generated.',
              },
            ]);
          },
        }
      );
    },
    [
      activeScreen,
      appendAssistantMessage,
      appendUserMessage,
      editSessionScreenMutate,
      generateScreenMutate,
      isPending,
      openSession,
      routeSessionId,
    ]
  );

  const handleAction = useCallback(
    (action: AppAction) => {
      if (!activeScreen) return;
      setSelectedAction({ action, sourcePage: activeScreen.schema.page });
      setComposeNotice(null);
      setDockTab('compose');
      setIsDockOpen(true);
    },
    [activeScreen]
  );

  const handleStageActionTarget = useCallback(
    (action: AppAction, targetPath: string): AppUiSchema | null => {
      if (!activeScreen) return null;
      let invalidTargetMessage: string | null = null;
      const updated = (() => {
        try {
          return updateRenderableActionTarget(activeScreen.schema, action.id, targetPath);
        } catch (error) {
          invalidTargetMessage =
            error instanceof Error ? error.message : '遷移先 path が不正です。';
          return null;
        }
      })();
      if (!updated) {
        setComposeNotice({
          tone: 'error',
          message:
            invalidTargetMessage ??
            `${action.label} の遷移先を ScreenJSON に反映できませんでした。`,
        });
        return null;
      }

      setLocalScreen({
        ...activeScreen,
        schema: updated.schema,
      });
      setSelectedAction({ action: updated.action, sourcePage: updated.schema.page });
      setComposeNotice(null);
      return updated.schema;
    },
    [activeScreen]
  );

  const handleOpenTargetPath = useCallback(
    (targetPath: string) => {
      void navigate({ to: targetPath as never });
    },
    [navigate]
  );

  const handleGenerateSelectedAction = useCallback(
    (action: AppAction) => {
      if (!activeScreen || generateFromAction.isPending || generateFromSessionAction.isPending) {
        return;
      }
      const endpoint = routeSessionId
        ? `POST /api/sessions/${routeSessionId}/actions/${action.id}/generate`
        : `POST /api/screens/${activeScreen.id}/actions/${action.id}/generate`;
      setPendingActionId(action.id);
      setIsDockOpen(true);
      setDockTab('chat');
      appendUserMessage(action.label);
      setActivities(pendingActivities(endpoint));

      const onSuccess = (data: { activities: AiActivity[]; screen: GeneratedScreen }) => {
        setPendingActionId(null);
        setLocalScreen(data.screen);
        setActivities(completedActivities(data, endpoint));
        appendAssistantMessage(`${data.screen.schema.page} を生成しました。`, data.screen);
        setSelectedAction(null);
        openSession(data.screen.sessionId);
      };
      const onError = (error: Error) => {
        setPendingActionId(null);
        setActivities([
          {
            id: 'request',
            label: 'API request',
            status: 'failed',
            detail: error.message,
          },
        ]);
      };

      if (routeSessionId) {
        generateFromSessionActionMutate(
          { actionId: action.id, input: { action } },
          { onError, onSuccess }
        );
        return;
      }

      generateFromActionMutate({ actionId: action.id, input: { action } }, { onError, onSuccess });
    },
    [
      activeScreen,
      appendAssistantMessage,
      appendUserMessage,
      generateFromAction.isPending,
      generateFromActionMutate,
      generateFromSessionAction.isPending,
      generateFromSessionActionMutate,
      openSession,
      routeSessionId,
    ]
  );

  const handleRestoreCheckpoint = useCallback(
    (screenJsonId: string) => {
      if (!routeSessionId || restoreCheckpoint.isPending) return;
      setRestoringScreenJsonId(screenJsonId);
      restoreCheckpointMutate(screenJsonId, {
        onSuccess: (data) => {
          setLocalScreen(data.screen);
          setRestoringScreenJsonId(null);
          setActivities([
            {
              id: 'checkpoint-restore',
              label: 'Checkpoint restore',
              status: 'completed',
              detail: data.screen.schema.page,
            },
          ]);
          openSession(data.screen.sessionId);
        },
        onError: (error) => {
          setRestoringScreenJsonId(null);
          setActivities([
            {
              id: 'checkpoint-restore',
              label: 'Checkpoint restore',
              status: 'failed',
              detail: error instanceof Error ? error.message : 'Request failed',
            },
          ]);
        },
      });
    },
    [openSession, restoreCheckpoint.isPending, restoreCheckpointMutate, routeSessionId]
  );

  const handleSubmitBinding = useCallback(
    (dataBindingId: string, value: Record<string, unknown>) => {
      const binding = activeScreen?.dataBindings.find((item) => item.id === dataBindingId);
      if (!binding) {
        setBindingNotice({
          tone: 'error',
          message: `${dataBindingId} binding が現在の ScreenJSON に存在しません。`,
        });
        return;
      }
      if (binding.operation !== 'create') {
        setBindingNotice({
          tone: 'error',
          message: `${dataBindingId} は create binding ではありません。`,
        });
        return;
      }
      const issue = submitBindingRuntimeIssue(binding, sandboxState.data);
      if (issue) {
        setBindingNotice({ tone: 'error', message: issue.message });
        return;
      }
      setPendingBindingId(dataBindingId);
      setBindingNotice(null);
      insertSandboxRowMutate(
        { bindingId: dataBindingId, table: binding.table, value },
        {
          onError: (error) => {
            setBindingNotice({
              tone: 'error',
              message: error instanceof Error ? error.message : 'Sandbox row could not be saved.',
            });
          },
          onSettled: () => setPendingBindingId(null),
          onSuccess: () => {
            setBindingNotice({
              tone: 'success',
              message: `${binding.table} に保存しました。`,
            });
          },
        }
      );
    },
    [activeScreen?.dataBindings, insertSandboxRowMutate, sandboxState.data]
  );

  useEffect(() => {
    if (persistedMessageKey) {
      setMessages([initialAssistantMessage]);
    }
  }, [persistedMessageKey]);

  useEffect(() => {
    if (
      selectedAction &&
      availableActions.length > 0 &&
      !availableActions.some((action) => action.id === selectedAction.action.id)
    ) {
      setSelectedAction(null);
    }
  }, [availableActions, selectedAction]);

  useEffect(() => {
    if (
      !screenId ||
      sessionId ||
      !routeSessionId ||
      conversationQuery.isLoading ||
      conversationQuery.error ||
      !conversationQuery.data ||
      handledScreenRouteRef.current === screenId
    ) {
      return;
    }

    handledScreenRouteRef.current = screenId;
    if (conversationQuery.data.activeScreenJsonId === screenId) {
      openSession(routeSessionId);
      return;
    }

    handleRestoreCheckpoint(screenId);
  }, [
    conversationQuery.data,
    conversationQuery.error,
    conversationQuery.isLoading,
    handleRestoreCheckpoint,
    openSession,
    routeSessionId,
    screenId,
    sessionId,
  ]);

  const screenContent = useMemo(() => {
    return measureRenderTask(
      'PromptWorkspace.screenContent',
      () => {
        if ((screenQuery.isLoading && screenId) || (conversationQuery.isLoading && sessionId)) {
          return (
            <section className="rounded-lg border border-border bg-card p-[var(--ui-card-padding)] text-muted-foreground">
              Loading screen...
            </section>
          );
        }

        if (screenQuery.error && screenId) {
          return (
            <section className="rounded-lg border border-destructive/30 bg-destructive/10 p-6">
              <h1 className="text-lg font-semibold">Screen could not be loaded</h1>
              <p className="mt-2 text-muted-foreground text-sm">{screenQuery.error.message}</p>
            </section>
          );
        }

        if (conversationQuery.error && sessionId) {
          return (
            <section className="rounded-lg border border-destructive/30 bg-destructive/10 p-6">
              <h1 className="text-lg font-semibold">Session could not be loaded</h1>
              <p className="mt-2 text-muted-foreground text-sm">
                {conversationQuery.error.message}
              </p>
            </section>
          );
        }

        if (activeScreen) {
          return (
            <>
              <BindingRuntimeBanner
                activeScreenJsonId={activeScreen.id}
                issues={bindingIssues}
                notice={bindingNotice}
              />
              <JsonRenderRenderer
                bindingRows={bindingRows}
                onAction={handleAction}
                onSubmitBinding={handleSubmitBinding}
                pendingActionId={pendingActionId}
                pendingBindingId={pendingBindingId}
                schema={activeScreen.schema}
                selectedActionId={selectedAction?.action.id ?? null}
              />
            </>
          );
        }

        return (
          <section className="flex min-h-[60vh] items-center justify-center rounded-lg border border-dashed border-border bg-card/40 px-6 py-16 text-center">
            <div className="max-w-md">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-md border border-border bg-background">
                <MessageSquare className="h-5 w-5 text-muted-foreground" />
              </div>
              <h1 className="mt-4 text-2xl font-semibold">Prompt</h1>
            </div>
          </section>
        );
      },
      () => ({
        bindingIssueCount: bindingIssues.length,
        bindingRowSetCount: Object.keys(bindingRows).length,
        conversationLoading: conversationQuery.isLoading,
        hasActiveScreen: Boolean(activeScreen),
        screenLoading: screenQuery.isLoading,
      })
    );
  }, [
    activeScreen,
    bindingIssues,
    bindingNotice,
    bindingRows,
    conversationQuery.error,
    conversationQuery.isLoading,
    handleSubmitBinding,
    handleAction,
    pendingBindingId,
    pendingActionId,
    selectedAction?.action.id,
    screenId,
    screenQuery.error,
    screenQuery.isLoading,
    sessionId,
  ]);

  useEffect(() => {
    logRenderPerf('PromptWorkspace.commit', renderStartedAt, {
      activeScreenId: activeScreen?.id ?? null,
      bindingIssueCount: bindingIssues.length,
      bindingRowSetCount: Object.keys(bindingRows).length,
      checkpointCount: conversationQuery.data?.checkpoints.length ?? 0,
      conversationLoading: conversationQuery.isLoading,
      displayMessageCount: displayMessages.length,
      routeSessionId,
      screenLoading: screenQuery.isLoading,
    });
  });

  if (auth.isLoading) {
    return <div className="mx-auto max-w-6xl px-4 py-10 text-muted-foreground">Loading...</div>;
  }

  if (!auth.user) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <section className="rounded-lg border border-border bg-card p-[var(--ui-card-padding)]">
          <h1 className="text-2xl font-semibold">Prompt</h1>
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
    <div className="min-h-[calc(100vh-4.25rem)] bg-background">
      <div
        className={cn(
          'mx-auto w-full max-w-[90rem] px-4 py-6 transition-[padding] md:px-8',
          isDockOpen && 'lg:pr-[27rem]'
        )}
      >
        {screenContent}
      </div>

      <ChatDock
        actionLinks={conversationQuery.data?.actionLinks ?? []}
        activeScreenJsonId={activeScreenJsonId}
        activeTab={dockTab}
        activeVersion={conversationQuery.data?.activeVersion ?? null}
        activities={activities}
        availableActions={availableActions}
        composeNotice={composeNotice}
        checkpoints={conversationQuery.data?.checkpoints ?? []}
        currentSessionId={routeSessionId}
        hasActiveScreen={Boolean(activeScreen)}
        initialPrompt={screenId || sessionId ? '' : defaultPrompt}
        isOpen={isDockOpen}
        isPending={isPending}
        messages={displayMessages}
        onGenerateAction={handleGenerateSelectedAction}
        onOpenChange={setIsDockOpen}
        onOpenTargetPath={handleOpenTargetPath}
        onRestoreCheckpoint={handleRestoreCheckpoint}
        onStageActionTarget={handleStageActionTarget}
        onSubmitPrompt={handleSubmitPrompt}
        onTabChange={setDockTab}
        promptResetKey={promptResetKey}
        restoringScreenJsonId={restoringScreenJsonId}
        sandboxState={sandboxState.data}
        selectedAction={selectedAction}
        sessionTitle={conversationQuery.data?.session.title}
        sessions={historyQuery.data?.sessions ?? []}
      />
    </div>
  );
}

function BindingRuntimeBanner({
  activeScreenJsonId,
  issues,
  notice,
}: {
  activeScreenJsonId: string;
  issues: BindingRuntimeIssue[];
  notice: BindingNotice | null;
}) {
  if (issues.length === 0 && !notice) return null;

  return (
    <section
      className={cn(
        'mb-4 rounded-lg border px-4 py-3 text-sm',
        notice?.tone === 'success' && issues.length === 0
          ? 'border-emerald-500/30 bg-emerald-500/10'
          : 'border-amber-500/30 bg-amber-500/10'
      )}
    >
      {notice ? (
        <p
          className={cn(
            'font-medium',
            notice.tone === 'success' ? 'text-emerald-700' : 'text-amber-800'
          )}
        >
          {notice.message}
        </p>
      ) : null}
      {issues.length > 0 ? (
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-medium text-amber-800">
              この UI の binding は現在の SandboxDB に未適用です。
            </p>
            <Link
              className="inline-flex h-8 items-center rounded-md border border-amber-600/30 bg-background px-3 text-xs font-medium hover:bg-secondary"
              search={{ screenJsonId: activeScreenJsonId } as never}
              to={'/dbdesign' as never}
            >
              DBDesign を開く
            </Link>
          </div>
          <div className="grid gap-1 text-amber-900/80 text-xs">
            {issues.map((issue) => (
              <p key={`${issue.bindingId}-${issue.message}`}>
                <span className="font-mono">{issue.bindingId}</span>: {issue.message}
              </p>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ChatDock({
  actionLinks,
  activeScreenJsonId,
  activeTab,
  activeVersion,
  activities,
  availableActions,
  composeNotice,
  checkpoints,
  currentSessionId,
  hasActiveScreen,
  initialPrompt,
  isOpen,
  isPending,
  messages,
  onGenerateAction,
  onOpenChange,
  onOpenTargetPath,
  onRestoreCheckpoint,
  onStageActionTarget,
  onSubmitPrompt,
  onTabChange,
  promptResetKey,
  restoringScreenJsonId,
  sandboxState,
  selectedAction,
  sessionTitle,
  sessions,
}: {
  actionLinks: ScreenActionLink[];
  activeScreenJsonId: string | null;
  activeTab: DockTab;
  activeVersion: number | null;
  activities: DockActivity[];
  availableActions: AppAction[];
  composeNotice: BindingNotice | null;
  checkpoints: ScreenCheckpoint[];
  currentSessionId: string | null;
  hasActiveScreen: boolean;
  initialPrompt: string;
  isOpen: boolean;
  isPending: boolean;
  messages: ChatMessage[];
  onGenerateAction: (action: AppAction) => void;
  onOpenChange: (value: boolean) => void;
  onOpenTargetPath: (targetPath: string) => void;
  onRestoreCheckpoint: (screenJsonId: string) => void;
  onStageActionTarget: (action: AppAction, targetPath: string) => AppUiSchema | null;
  onSubmitPrompt: (prompt: string) => void;
  onTabChange: (tab: DockTab) => void;
  promptResetKey: number;
  restoringScreenJsonId: string | null;
  sandboxState?: SandboxStateResponse | null;
  selectedAction: SelectedAction | null;
  sessionTitle?: string;
  sessions: PromptSessionSummary[];
}) {
  const [prompt, setPrompt] = useState(initialPrompt);

  useEffect(() => {
    if (promptResetKey > 0) setPrompt('');
  }, [promptResetKey]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || isPending) return;
    onSubmitPrompt(trimmed);
  };

  if (!isOpen) {
    return (
      <button
        aria-label="Open Chatdock"
        className="fixed right-4 bottom-4 z-40 inline-flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-lg hover:bg-secondary"
        onClick={() => onOpenChange(true)}
        type="button"
      >
        <MessageSquare className="h-5 w-5" />
      </button>
    );
  }

  return (
    <aside className="fixed right-4 bottom-4 z-40 flex max-h-[min(78vh,42rem)] w-[min(calc(100vw-2rem),24rem)] flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-xl lg:top-20 lg:max-h-none">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm">Chatdock</h2>
          </div>
          {sessionTitle ? (
            <div className="mt-1 truncate text-muted-foreground text-xs">
              {sessionTitle}
              {activeVersion ? ` · v${activeVersion}` : null}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <Link
            aria-label="Open DBDesign"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-secondary"
            search={
              activeScreenJsonId ? ({ screenJsonId: activeScreenJsonId } as never) : undefined
            }
            title="テーブル定義"
            to={'/dbdesign' as never}
          >
            <Database className="h-4 w-4" />
          </Link>
          <Link
            aria-label="Open UIDesign"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-secondary"
            title="UIDesign"
            to="/history"
          >
            <WandSparkles className="h-4 w-4" />
          </Link>
          <button
            aria-label="Collapse Chatdock"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-secondary"
            onClick={() => onOpenChange(false)}
            type="button"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 border-b border-border p-1">
        <button
          className={cn(
            'inline-flex h-8 items-center justify-center gap-2 rounded-md text-xs font-medium',
            activeTab === 'chat' ? 'bg-secondary text-foreground' : 'text-muted-foreground'
          )}
          onClick={() => onTabChange('chat')}
          type="button"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          AI Chat
        </button>
        <button
          className={cn(
            'inline-flex h-8 items-center justify-center gap-2 rounded-md text-xs font-medium',
            activeTab === 'compose' ? 'bg-secondary text-foreground' : 'text-muted-foreground'
          )}
          onClick={() => onTabChange('compose')}
          type="button"
        >
          <Link2 className="h-3.5 w-3.5" />
          Compose
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {activeTab === 'chat' ? (
          <>
            {checkpoints.length > 0 ? (
              <section className="mb-4 rounded-md border border-border bg-background/70 p-3">
                <div className="mb-2 text-muted-foreground text-xs font-medium uppercase">
                  Checkpoints
                </div>
                <div className="flex flex-wrap gap-2">
                  {checkpoints.map((checkpoint) => {
                    const isActive = checkpoint.id === activeScreenJsonId;
                    const isRestoring = checkpoint.id === restoringScreenJsonId;
                    const status = databaseVersionStatus(checkpoint, sandboxState);
                    return (
                      <button
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs hover:bg-secondary disabled:cursor-default disabled:opacity-60"
                        disabled={isActive || isRestoring}
                        key={checkpoint.id}
                        onClick={() => onRestoreCheckpoint(checkpoint.id)}
                        title={`${checkpoint.page} / ${databaseVersionStatusLabel(status)}`}
                        type="button"
                      >
                        <DatabaseVersionIcon status={status} />
                        <span>
                          {isRestoring
                            ? '復元中'
                            : isActive
                              ? `現在 v${checkpoint.version}`
                              : `v${checkpoint.version}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <div aria-live="polite" className="grid gap-3">
              {messages.map((message) => (
                <ChatBubble
                  activeScreenJsonId={activeScreenJsonId}
                  key={message.id}
                  message={message}
                  onRestoreCheckpoint={onRestoreCheckpoint}
                  restoringScreenJsonId={restoringScreenJsonId}
                />
              ))}
            </div>

            {activities.length > 0 ? (
              <section className="mt-4 rounded-md border border-border bg-background/70 p-3">
                <div className="mb-2 flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase">
                  <Activity className="h-3.5 w-3.5" />
                  Activity
                </div>
                <div className="grid gap-2">
                  {activities.map((activity) => (
                    <ActivityRow activity={activity} key={activity.id} />
                  ))}
                </div>
              </section>
            ) : null}
          </>
        ) : (
          <ComposePanel
            actionLinks={actionLinks}
            availableActions={availableActions}
            composeNotice={composeNotice}
            currentSessionId={currentSessionId}
            isPending={isPending}
            onGenerateAction={onGenerateAction}
            onOpenTargetPath={onOpenTargetPath}
            onStageActionTarget={onStageActionTarget}
            selectedAction={selectedAction}
            sessions={sessions}
          />
        )}
      </div>

      {activeTab === 'chat' ? (
        <form className="grid gap-2 border-t border-border p-3" onSubmit={handleSubmit}>
          <textarea
            aria-label="Prompt"
            className="max-h-40 min-h-24 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            maxLength={2000}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={hasActiveScreen ? 'この画面の修正内容を入力' : '作りたい画面を入力'}
            value={prompt}
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground text-xs">{prompt.length}/2000</span>
            <button
              aria-label="Send prompt"
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
      ) : null}
    </aside>
  );
}

type LinkChoice = 'custom-path' | `path:${string}` | `session:${string}`;

function promptSessionPath(sessionId: string) {
  return `/prompt/session/${sessionId}`;
}

function choiceForSelectedAction(
  selectedAction: SelectedAction | null,
  selectedLink: ScreenActionLink | null
): LinkChoice {
  if (selectedLink?.targetSessionId) return `session:${selectedLink.targetSessionId}`;
  if (selectedLink?.targetPath) return `path:${selectedLink.targetPath}`;
  if (selectedAction?.action.target) return `path:${selectedAction.action.target}`;
  return 'custom-path';
}

function pathFromChoice(choice: LinkChoice, customPath: string) {
  if (choice === 'custom-path') return customPath.trim() || null;
  if (choice.startsWith('session:')) return promptSessionPath(choice.slice('session:'.length));
  if (choice.startsWith('path:')) return choice.slice('path:'.length);
  return null;
}

function ComposePanel({
  actionLinks,
  availableActions,
  composeNotice,
  currentSessionId,
  isPending,
  onGenerateAction,
  onOpenTargetPath,
  onStageActionTarget,
  selectedAction,
  sessions,
}: {
  actionLinks: ScreenActionLink[];
  availableActions: AppAction[];
  composeNotice: BindingNotice | null;
  currentSessionId: string | null;
  isPending: boolean;
  onGenerateAction: (action: AppAction) => void;
  onOpenTargetPath: (targetPath: string) => void;
  onStageActionTarget: (action: AppAction, targetPath: string) => AppUiSchema | null;
  selectedAction: SelectedAction | null;
  sessions: PromptSessionSummary[];
}) {
  const selectRef = useRef<HTMLSelectElement>(null);
  const [customPath, setCustomPath] = useState('');
  const [targetChoice, setTargetChoice] = useState<LinkChoice>('custom-path');
  const selectedLink = selectedAction
    ? (actionLinks.find((link) => link.actionId === selectedAction.action.id) ?? null)
    : null;
  const targetSession = sessions.find((session) => session.id === selectedLink?.targetSessionId);
  const pageOptions = sessions.filter((session) => session.id !== currentSessionId);
  const pathOptions = useMemo(() => {
    const byPath = new Map<string, string>();
    const addPath = (path: string | null | undefined, label?: string) => {
      const trimmed = path?.trim();
      if (!trimmed) return;
      const normalizedLabel = label?.trim();
      if (!byPath.has(trimmed)) {
        byPath.set(trimmed, normalizedLabel && normalizedLabel !== trimmed ? normalizedLabel : '');
        return;
      }
      if (!byPath.get(trimmed) && normalizedLabel && normalizedLabel !== trimmed) {
        byPath.set(trimmed, normalizedLabel);
      }
    };

    addPath(selectedLink?.targetPath, '現在のリンク');
    addPath(selectedAction?.action.target, selectedAction?.action.label);
    for (const action of availableActions) {
      addPath(action.target, action.label);
    }
    for (const link of actionLinks) {
      addPath(link.targetPath, '既存リンク');
    }

    return Array.from(byPath, ([path, label]) => ({ path, label }));
  }, [actionLinks, availableActions, selectedAction, selectedLink]);
  const canGenerateNewPage = selectedAction?.action.kind === 'generate-screen';

  useEffect(() => {
    setTargetChoice(choiceForSelectedAction(selectedAction, selectedLink));
    setCustomPath(selectedLink?.targetPath ?? selectedAction?.action.target ?? '');
    if (selectedAction) {
      requestAnimationFrame(() => selectRef.current?.focus());
    }
  }, [selectedAction, selectedLink]);

  const handleOpenAction = () => {
    if (!selectedAction || isPending) return;
    const targetPath = pathFromChoice(targetChoice, customPath);
    if (!targetPath) return;
    const staged = onStageActionTarget(selectedAction.action, targetPath);
    if (!staged) return;
    onOpenTargetPath(targetPath);
  };

  const handleGenerateAction = () => {
    if (!selectedAction || isPending || !canGenerateNewPage) return;
    onGenerateAction(selectedAction.action);
  };

  const canOpenTarget = Boolean(
    selectedAction && !isPending && (targetChoice === 'custom-path' ? customPath.trim() : true)
  );
  const canGenerateAction = Boolean(selectedAction && !isPending && canGenerateNewPage);

  return (
    <section className="rounded-md border border-border bg-background/70 p-3">
      <div className="mb-2 flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase">
        <Link2 className="h-3.5 w-3.5" />
        Link
      </div>
      {selectedAction ? (
        <div className="grid gap-3">
          <div className="grid gap-1 text-sm">
            <div className="font-medium">{selectedAction.action.label}</div>
            <div className="text-muted-foreground text-xs">{selectedAction.action.id}</div>
            <div className="text-muted-foreground text-xs">{selectedAction.sourcePage}</div>
          </div>

          {selectedLink?.targetSessionId ? (
            <p className="rounded-md border border-border bg-card px-2 py-1 text-xs">
              linked: {targetSession?.page ?? targetSession?.title ?? 'Linked page'}
            </p>
          ) : null}

          {composeNotice ? (
            <p
              className={cn(
                'rounded-md border px-2 py-1 text-xs',
                composeNotice.tone === 'success'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
                  : 'border-destructive/30 bg-destructive/10 text-destructive'
              )}
            >
              {composeNotice.message}
            </p>
          ) : null}

          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground text-xs font-medium">リンク先</span>
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onChange={(event) => {
                const choice = event.target.value as LinkChoice;
                setTargetChoice(choice);
                const targetPath = pathFromChoice(choice, customPath);
                if (selectedAction && targetPath) {
                  onStageActionTarget(selectedAction.action, targetPath);
                }
              }}
              ref={selectRef}
              value={targetChoice}
            >
              {pageOptions.map((session) => (
                <option key={session.id} value={`session:${session.id}`}>
                  既存ページ: {session.page ?? session.title}
                </option>
              ))}
              {pathOptions.map((option) => (
                <option key={option.path} value={`path:${option.path}`}>
                  パス: {option.path}
                  {option.label ? ` (${option.label})` : ''}
                </option>
              ))}
              <option value="custom-path">カスタムパス</option>
            </select>
          </label>

          {targetChoice === 'custom-path' ? (
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground text-xs font-medium">カスタムパス</span>
              <input
                className="h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onChange={(event) => setCustomPath(event.target.value)}
                placeholder="/path"
                value={customPath}
              />
            </label>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <button
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canOpenTarget}
              onClick={handleOpenAction}
              type="button"
            >
              <Link2 className="h-4 w-4" />
              開く
            </button>
            <button
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canGenerateAction}
              onClick={handleGenerateAction}
              type="button"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              AI生成
            </button>
          </div>
          <p className="text-muted-foreground text-xs">
            AI生成はリンク元の画面文脈と選択したボタンの意味を引き継ぎ、新しい Prompt
            ページを作成します。
          </p>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">画面内のボタンを選択してください。</p>
      )}
    </section>
  );
}

function DatabaseVersionIcon({ status }: { status: DatabaseVersionStatus }) {
  const className = 'h-3.5 w-3.5 shrink-0';
  switch (status) {
    case 'live':
      return <Database aria-hidden="true" className={cn(className, 'text-emerald-600')} />;
    case 'draft':
      return <FileJson aria-hidden="true" className={cn(className, 'text-amber-600')} />;
    case 'checking':
      return (
        <Loader2
          aria-hidden="true"
          className={cn(className, 'animate-spin text-muted-foreground')}
        />
      );
    case 'ui-only':
      return <WandSparkles aria-hidden="true" className={cn(className, 'text-muted-foreground')} />;
  }
}

function ChatBubble({
  activeScreenJsonId,
  message,
  onRestoreCheckpoint,
  restoringScreenJsonId,
}: {
  activeScreenJsonId: string | null;
  message: ChatMessage;
  onRestoreCheckpoint: (screenJsonId: string) => void;
  restoringScreenJsonId: string | null;
}) {
  const isUser = message.role === 'user';
  const checkpointScreenJsonId = message.metadata?.checkpointScreenJsonId;
  const isActiveCheckpoint =
    Boolean(checkpointScreenJsonId) && checkpointScreenJsonId === activeScreenJsonId;
  const isRestoring =
    Boolean(checkpointScreenJsonId) && checkpointScreenJsonId === restoringScreenJsonId;

  return (
    <article className={cn('flex gap-2', isUser && 'justify-end')}>
      {!isUser ? (
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-background">
          <Bot className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      ) : null}
      <div className="grid gap-2">
        <div
          className={cn(
            'max-w-[18rem] rounded-lg px-3 py-2 text-sm leading-6',
            isUser ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground'
          )}
        >
          {message.content}
        </div>
        {!isUser && checkpointScreenJsonId ? (
          <button
            className="justify-self-start rounded-md border border-border bg-card px-2.5 py-1 text-muted-foreground text-xs hover:bg-secondary disabled:cursor-default disabled:opacity-60"
            disabled={isActiveCheckpoint || isRestoring}
            onClick={() => onRestoreCheckpoint(checkpointScreenJsonId)}
            type="button"
          >
            {isRestoring ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                復元中
              </span>
            ) : isActiveCheckpoint ? (
              '現在のバージョン'
            ) : (
              (message.metadata?.checkpointLabel ?? 'このバージョンへ戻る')
            )}
          </button>
        ) : null}
      </div>
      {isUser ? (
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-background">
          <User className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      ) : null}
    </article>
  );
}

function ActivityRow({ activity }: { activity: DockActivity }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <ActivityIcon status={activity.status} />
      <div className="min-w-0">
        <div className="truncate font-medium text-foreground">{activity.label}</div>
        {activity.detail ? (
          <div className="truncate text-muted-foreground text-xs">{activity.detail}</div>
        ) : null}
      </div>
    </div>
  );
}

function ActivityIcon({ status }: { status: DockActivity['status'] }) {
  if (status === 'completed') {
    return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />;
  }

  if (status === 'failed') {
    return <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />;
  }

  if (status === 'running') {
    return <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />;
  }

  return <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40" />;
}
