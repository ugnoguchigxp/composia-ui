import { Link, useNavigate } from '@tanstack/react-router';
import {
  Activity,
  Bot,
  CheckCircle2,
  ChevronDown,
  Database,
  Eye,
  EyeOff,
  FileJson,
  Link2,
  Loader2,
  MessageSquare,
  Plus,
  Save,
  Send,
  User,
  WandSparkles,
  XCircle,
} from 'lucide-react';
import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { AiActivity } from '../../../../shared/schemas/ai.schema';
import type { SandboxStateResponse } from '../../../../shared/schemas/database-design.schema';
import type {
  GeneratedScreen,
  PromptSessionMessage,
  PromptSessionSummary,
  PromptSessionVisibility,
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
  useProposeDatabaseDesign,
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
  useProjectPageSession,
  useRestoreScreenJsonCheckpoint,
  useSaveSessionScreenJson,
  useScreenConversation,
  useScreenHistory,
  useUpdatePromptSessionVisibility,
} from '../hooks/screen-history.hooks';
import { screenHistoryRepository } from '../repositories/screen-history.repository';
import {
  type BindingRuntimeIssue,
  bindingRuntimeIsReady,
  bindingRuntimeIssue,
  resolveScreenRuntimeBindings,
  submitBindingRuntimeIssue,
} from '../services/binding-runtime.service';
import {
  normalizeProjectPagePathForLink,
  pathFromSessionChoice,
  resolveProjectLinkTarget,
} from '../services/project-link-routing.service';

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

type PersistedSchemaSnapshot = {
  fingerprint: string;
  screenId: string;
};

const defaultPrompt =
  '売上、問い合わせ、障害対応の状況を一目で把握できる運用ダッシュボードを作ってください。';

const initialAssistantMessage: ChatMessage = {
  id: 'assistant-initial',
  role: 'assistant',
  content: 'どんな UI にしますか？',
};

type PromptSubmitShortcutEvent = Pick<
  ReactKeyboardEvent<HTMLTextAreaElement>,
  'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'nativeEvent' | 'shiftKey'
>;

export function isPromptSubmitShortcut(event: PromptSubmitShortcutEvent) {
  return (
    event.key === 'Enter' &&
    event.ctrlKey &&
    !event.altKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !event.nativeEvent.isComposing
  );
}

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

function normalizeJsonForFingerprint(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeJsonForFingerprint);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, normalizeJsonForFingerprint(item)])
  );
}

function schemaFingerprint(schema: AppUiSchema) {
  return JSON.stringify(normalizeJsonForFingerprint(schema));
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

function promptSessionPath(sessionId: string) {
  return `/prompt/session/${sessionId}`;
}

export function PromptWorkspace({
  pagePath,
  projectId,
  screenId,
  sessionId,
}: {
  pagePath?: string | null;
  projectId?: string | null;
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
  const [persistedSchemaSnapshot, setPersistedSchemaSnapshot] =
    useState<PersistedSchemaSnapshot | null>(null);
  const [promptResetKey, setPromptResetKey] = useState(0);
  const [visibilityUpdatingTo, setVisibilityUpdatingTo] = useState<PromptSessionVisibility | null>(
    null
  );
  const normalizedProjectPagePath = normalizeProjectPagePathForLink(pagePath) ?? 'index';
  const projectPageQuery = useProjectPageSession(
    projectId ?? null,
    normalizedProjectPagePath,
    Boolean(auth.user && projectId && !sessionId)
  );
  const screenQuery = useGeneratedScreen(screenId ?? null, Boolean(auth.user && screenId));
  const routeSessionId =
    sessionId ?? projectPageQuery.data?.sessionId ?? screenQuery.data?.screen.sessionId ?? null;
  const conversationQuery = useScreenConversation(
    routeSessionId,
    Boolean(auth.user && routeSessionId)
  );
  const generateScreen = useGenerateScreen();
  const editSessionScreen = useEditSessionScreen(routeSessionId);
  const saveSessionScreenJson = useSaveSessionScreenJson(routeSessionId);
  const updateSessionVisibility = useUpdatePromptSessionVisibility(routeSessionId);
  const restoreCheckpoint = useRestoreScreenJsonCheckpoint(routeSessionId);
  const insertSandboxRow = useInsertSandboxRow();
  const proposeDatabaseDesign = useProposeDatabaseDesign();
  const historyQuery = useScreenHistory(
    { limit: 100, page: 1, sortBy: 'updatedAt', sortOrder: 'desc' },
    Boolean(auth.user && ((isDockOpen && dockTab === 'compose') || projectId || sessionId))
  );
  const actionParentId =
    localScreen && (!screenId || localScreen.id === screenId) ? localScreen.id : (screenId ?? null);
  const generateFromAction = useGenerateScreenFromAction(actionParentId);
  const generateFromSessionAction = useGenerateScreenFromSessionAction(routeSessionId);
  const generateScreenMutate = generateScreen.mutate;
  const editSessionScreenMutate = editSessionScreen.mutate;
  const saveSessionScreenJsonMutate = saveSessionScreenJson.mutate;
  const updateSessionVisibilityMutate = updateSessionVisibility.mutate;
  const restoreCheckpointMutate = restoreCheckpoint.mutate;
  const generateFromActionMutate = generateFromAction.mutate;
  const generateFromSessionActionMutate = generateFromSessionAction.mutate;
  const insertSandboxRowMutate = insertSandboxRow.mutate;
  const proposeDatabaseDesignMutate = proposeDatabaseDesign.mutate;
  const activeConversationScreen = conversationQuery.data?.activeScreenJson ?? null;
  const activeScreenStartedAt = renderPerfStart();
  const activeScreen: WorkspaceScreen | null =
    localScreen ??
    (routeSessionId
      ? activeConversationScreen
      : (screenQuery.data?.screen ?? activeConversationScreen)) ??
    null;
  const currentProjectId =
    activeScreen?.projectId ?? conversationQuery.data?.session.projectId ?? projectId ?? null;
  const projectSessions = useMemo(
    () =>
      currentProjectId
        ? (historyQuery.data?.sessions ?? []).filter(
            (session) => session.projectId === currentProjectId
          )
        : [],
    [currentProjectId, historyQuery.data?.sessions]
  );
  const resolveTargetPath = useCallback(
    (targetPath: string | null | undefined) =>
      resolveProjectLinkTarget(targetPath, currentProjectId, historyQuery.data?.sessions ?? []),
    [currentProjectId, historyQuery.data?.sessions]
  );
  const resolveExistingTargetPath = useCallback(
    async (targetPath: string | null | undefined) => {
      const resolvedTargetPath = resolveTargetPath(targetPath);
      if (resolvedTargetPath) return resolvedTargetPath;
      if (!currentProjectId) return null;

      const pagePath = normalizeProjectPagePathForLink(targetPath);
      if (!pagePath) return null;

      try {
        const projectPage = await screenHistoryRepository.projectPage(currentProjectId, pagePath);
        return projectPage.canonicalPath;
      } catch {
        return null;
      }
    },
    [currentProjectId, resolveTargetPath]
  );
  logRenderPerf('PromptWorkspace.activeScreenSelection', activeScreenStartedAt, {
    hasActiveConversationScreen: Boolean(activeConversationScreen),
    hasLocalScreen: Boolean(localScreen),
    hasScreenQueryData: Boolean(screenQuery.data?.screen),
    route: projectId ? 'project' : sessionId ? 'session' : screenId ? 'screen' : 'new',
  });
  const activeScreenSchemaFingerprint = useMemo(
    () => (activeScreen ? schemaFingerprint(activeScreen.schema) : null),
    [activeScreen]
  );
  const persistedSourceScreen = activeConversationScreen ?? screenQuery.data?.screen ?? null;
  const markScreenPersisted = useCallback((screen: WorkspaceScreen) => {
    setPersistedSchemaSnapshot({
      fingerprint: schemaFingerprint(screen.schema),
      screenId: screen.id,
    });
  }, []);
  const hasJsonChanges = Boolean(
    routeSessionId &&
      activeScreen &&
      activeScreenSchemaFingerprint &&
      persistedSchemaSnapshot &&
      persistedSchemaSnapshot.screenId === activeScreen.id &&
      activeScreenSchemaFingerprint !== persistedSchemaSnapshot.fingerprint
  );
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
  const handleGenerateDatabaseDraft = useCallback(
    (screenJsonId: string) => {
      if (!screenJsonId || proposeDatabaseDesign.isPending) return;

      proposeDatabaseDesignMutate(
        {
          prompt: 'このUIに必要なテーブル定義案を作成してください。',
          screenJsonId,
          source: 'screen',
        },
        {
          onSuccess: (data) => {
            void navigate({
              params: { databaseSchemaJsonId: data.databaseSchemaJson.id } as never,
              to: '/dbdesign/drafts/$databaseSchemaJsonId' as never,
            });
          },
          onError: (error) => {
            setIsDockOpen(true);
            setDockTab('chat');
            setMessages((current) => [
              ...current,
              {
                id: createId('assistant'),
                role: 'assistant',
                content:
                  error instanceof Error ? error.message : 'DBDesign draft could not be generated.',
              },
            ]);
          },
        }
      );
    },
    [navigate, proposeDatabaseDesign.isPending, proposeDatabaseDesignMutate]
  );
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
    saveSessionScreenJson.isPending ||
    updateSessionVisibility.isPending ||
    restoreCheckpoint.isPending ||
    insertSandboxRow.isPending;

  const openPromptPath = useCallback(
    (targetPath: string, replace = false) => {
      void navigate({ replace, to: targetPath as never });
    },
    [navigate]
  );

  const openSession = useCallback(
    (nextSessionId: string, canonicalPath?: string | null, replace = false) => {
      openPromptPath(canonicalPath ?? promptSessionPath(nextSessionId), replace);
    },
    [openPromptPath]
  );

  const openScreen = useCallback(
    (screen: Pick<GeneratedScreen, 'canonicalPath' | 'sessionId'>, replace = false) => {
      openSession(screen.sessionId, screen.canonicalPath, replace);
    },
    [openSession]
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
              markScreenPersisted(data.screen);
              setPromptResetKey((current) => current + 1);
              setActivities(completedActivities(data, endpoint));
              appendAssistantMessage(`${data.screen.schema.page} を更新しました。`, data.screen);
              openScreen(data.screen);
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
            markScreenPersisted(data.screen);
            setPromptResetKey((current) => current + 1);
            setActivities(completedActivities(data, endpoint));
            appendAssistantMessage(
              `${data.screen.schema.page} を保存しました。${data.screen.schema.sections.length} sections`,
              data.screen
            );
            openScreen(data.screen);
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
      markScreenPersisted,
      openScreen,
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
    async (targetPath: string) => {
      const resolvedTargetPath = await resolveExistingTargetPath(targetPath);
      if (!resolvedTargetPath) return;
      openPromptPath(resolvedTargetPath);
    },
    [openPromptPath, resolveExistingTargetPath]
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
        markScreenPersisted(data.screen);
        setActivities(completedActivities(data, endpoint));
        appendAssistantMessage(`${data.screen.schema.page} を生成しました。`, data.screen);
        setSelectedAction(null);
        openScreen(data.screen);
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
      markScreenPersisted,
      openScreen,
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
          markScreenPersisted(data.screen);
          setRestoringScreenJsonId(null);
          setActivities([
            {
              id: 'checkpoint-restore',
              label: 'Checkpoint restore',
              status: 'completed',
              detail: data.screen.schema.page,
            },
          ]);
          openScreen(data.screen);
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
    [
      markScreenPersisted,
      openScreen,
      restoreCheckpoint.isPending,
      restoreCheckpointMutate,
      routeSessionId,
    ]
  );

  const handleSaveActiveScreen = useCallback(() => {
    if (!routeSessionId || !activeScreen || !hasJsonChanges || saveSessionScreenJson.isPending) {
      return;
    }
    saveSessionScreenJsonMutate(
      {
        prompt: 'ScreenJSON を保存',
        schema: activeScreen.schema,
      },
      {
        onError: (error) => {
          setActivities([
            {
              id: 'screen-save',
              label: 'ScreenJSON save',
              status: 'failed',
              detail: error instanceof Error ? error.message : 'Request failed',
            },
          ]);
        },
        onSuccess: (data) => {
          setLocalScreen(data.screen);
          markScreenPersisted(data.screen);
          setActivities([
            {
              id: 'screen-save',
              label: 'ScreenJSON save',
              status: 'completed',
              detail: `v${data.screen.version}`,
            },
          ]);
          openScreen(data.screen);
        },
      }
    );
  }, [
    activeScreen,
    hasJsonChanges,
    markScreenPersisted,
    openScreen,
    routeSessionId,
    saveSessionScreenJson.isPending,
    saveSessionScreenJsonMutate,
  ]);

  const handleUpdateVisibility = useCallback(
    (visibility: PromptSessionVisibility) => {
      if (!routeSessionId || updateSessionVisibility.isPending) return;
      setVisibilityUpdatingTo(visibility);
      updateSessionVisibilityMutate(
        { visibility },
        {
          onError: (error) => {
            setActivities([
              {
                id: 'session-visibility',
                label: 'Publish status',
                status: 'failed',
                detail: error instanceof Error ? error.message : 'Request failed',
              },
            ]);
          },
          onSettled: () => setVisibilityUpdatingTo(null),
          onSuccess: () => {
            setActivities([
              {
                id: 'session-visibility',
                label: 'Publish status',
                status: 'completed',
                detail: visibility === 'public' ? '公開' : '非公開',
              },
            ]);
          },
        }
      );
    },
    [routeSessionId, updateSessionVisibility.isPending, updateSessionVisibilityMutate]
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
    if (persistedSourceScreen) markScreenPersisted(persistedSourceScreen);
  }, [markScreenPersisted, persistedSourceScreen]);

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
    if (projectId || !sessionId || !conversationQuery.data?.session.canonicalPath) return;
    openSession(sessionId, conversationQuery.data.session.canonicalPath, true);
  }, [conversationQuery.data?.session.canonicalPath, openSession, projectId, sessionId]);

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
      openSession(routeSessionId, conversationQuery.data.session.canonicalPath);
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
        if (
          (screenQuery.isLoading && screenId) ||
          (projectPageQuery.isLoading && projectId && !sessionId) ||
          (conversationQuery.isLoading && routeSessionId)
        ) {
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

        if (projectPageQuery.error && projectId && !sessionId) {
          return (
            <section className="rounded-lg border border-destructive/30 bg-destructive/10 p-6">
              <h1 className="text-lg font-semibold">Project page could not be loaded</h1>
              <p className="mt-2 text-muted-foreground text-sm">{projectPageQuery.error.message}</p>
            </section>
          );
        }

        if (conversationQuery.error && routeSessionId) {
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
              <BindingRuntimeBanner issues={bindingIssues} notice={bindingNotice} />
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
        projectPageLoading: projectPageQuery.isLoading,
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
    projectId,
    projectPageQuery.error,
    projectPageQuery.isLoading,
    routeSessionId,
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
        <WorkspaceScreenToolbar
          activeScreen={activeScreen}
          activeScreenJsonId={activeScreenJsonId}
          checkpoints={conversationQuery.data?.checkpoints ?? []}
          currentSessionId={routeSessionId}
          hasJsonChanges={hasJsonChanges}
          isPublishing={updateSessionVisibility.isPending}
          isGeneratingDatabaseDraft={proposeDatabaseDesign.isPending}
          isRestoring={restoreCheckpoint.isPending}
          isSaving={saveSessionScreenJson.isPending}
          onGenerateDatabaseDraft={handleGenerateDatabaseDraft}
          onRestoreCheckpoint={handleRestoreCheckpoint}
          onSave={handleSaveActiveScreen}
          onUpdateVisibility={handleUpdateVisibility}
          pendingVisibility={visibilityUpdatingTo}
          publishedAt={conversationQuery.data?.session.publishedAt ?? null}
          restoringScreenJsonId={restoringScreenJsonId}
          sandboxState={sandboxState.data}
          visibility={conversationQuery.data?.session.visibility ?? 'private'}
        />
        {screenContent}
      </div>

      <ChatDock
        actionLinks={conversationQuery.data?.actionLinks ?? []}
        activeTab={dockTab}
        activeVersion={conversationQuery.data?.activeVersion ?? null}
        activities={activities}
        availableActions={availableActions}
        composeNotice={composeNotice}
        currentProjectId={currentProjectId}
        currentSessionId={routeSessionId}
        hasActiveScreen={Boolean(activeScreen)}
        initialPrompt={screenId || sessionId || projectId ? '' : defaultPrompt}
        isOpen={isDockOpen}
        isPending={isPending}
        messages={displayMessages}
        onGenerateAction={handleGenerateSelectedAction}
        onOpenChange={setIsDockOpen}
        onOpenTargetPath={handleOpenTargetPath}
        onResolveTargetPath={resolveTargetPath}
        onStageActionTarget={handleStageActionTarget}
        onSubmitPrompt={handleSubmitPrompt}
        onTabChange={setDockTab}
        promptResetKey={promptResetKey}
        selectedAction={selectedAction}
        sessionTitle={conversationQuery.data?.session.title}
        projectSessions={projectSessions}
        sessions={historyQuery.data?.sessions ?? []}
      />
    </div>
  );
}

function WorkspaceScreenToolbar({
  activeScreen,
  activeScreenJsonId,
  checkpoints,
  currentSessionId,
  hasJsonChanges,
  isGeneratingDatabaseDraft,
  isPublishing,
  isRestoring,
  isSaving,
  onGenerateDatabaseDraft,
  onRestoreCheckpoint,
  onSave,
  onUpdateVisibility,
  pendingVisibility,
  publishedAt,
  restoringScreenJsonId,
  sandboxState,
  visibility,
}: {
  activeScreen: WorkspaceScreen | null;
  activeScreenJsonId: string | null;
  checkpoints: ScreenCheckpoint[];
  currentSessionId: string | null;
  hasJsonChanges: boolean;
  isGeneratingDatabaseDraft: boolean;
  isPublishing: boolean;
  isRestoring: boolean;
  isSaving: boolean;
  onGenerateDatabaseDraft: (screenJsonId: string) => void;
  onRestoreCheckpoint: (screenJsonId: string) => void;
  onSave: () => void;
  onUpdateVisibility: (visibility: PromptSessionVisibility) => void;
  pendingVisibility: PromptSessionVisibility | null;
  publishedAt: string | null;
  restoringScreenJsonId: string | null;
  sandboxState?: SandboxStateResponse | null;
  visibility: PromptSessionVisibility;
}) {
  if (!activeScreen) return null;

  const sortedCheckpoints = [...checkpoints].sort((a, b) => b.version - a.version);
  const recentCheckpoints = sortedCheckpoints.slice(0, 4);
  const olderCheckpoints = sortedCheckpoints.slice(4);
  const canSave = Boolean(currentSessionId && hasJsonChanges && !isSaving);
  const canPublish = Boolean(currentSessionId && !isPublishing);
  const canGenerateDatabaseDraft = Boolean(activeScreenJsonId && !isGeneratingDatabaseDraft);
  const isPublishingPrivate = pendingVisibility === 'private' && isPublishing;
  const isPublishingPublic = pendingVisibility === 'public' && isPublishing;

  return (
    <section className="mb-4 rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate font-semibold text-base">{activeScreen.schema.page}</h1>
            <span className="rounded-md border border-border bg-background px-2 py-0.5 text-muted-foreground text-xs">
              {visibility === 'public' ? '公開' : '非公開'}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
            <span>v{activeScreen.version}</span>
            {publishedAt ? <span>published {new Date(publishedAt).toLocaleString()}</span> : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canSave}
            onClick={onSave}
            type="button"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            保存
          </button>
          <div className="inline-flex overflow-hidden rounded-md border border-border bg-background">
            <button
              className={cn(
                'inline-flex h-9 items-center gap-2 px-3 text-sm font-medium hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50',
                visibility === 'private' && 'bg-secondary'
              )}
              disabled={!canPublish || visibility === 'private'}
              onClick={() => onUpdateVisibility('private')}
              type="button"
            >
              {isPublishingPrivate ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <EyeOff className="h-4 w-4" />
              )}
              非公開
            </button>
            <button
              className={cn(
                'inline-flex h-9 items-center gap-2 border-border border-l px-3 text-sm font-medium hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50',
                visibility === 'public' && 'bg-secondary'
              )}
              disabled={!canPublish || visibility === 'public'}
              onClick={() => onUpdateVisibility('public')}
              type="button"
            >
              {isPublishingPublic ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
              公開
            </button>
          </div>
          <button
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canGenerateDatabaseDraft}
            onClick={() => {
              if (activeScreenJsonId) onGenerateDatabaseDraft(activeScreenJsonId);
            }}
            type="button"
          >
            {isGeneratingDatabaseDraft ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Database className="h-4 w-4" />
            )}
            DB生成
          </button>
        </div>
      </div>

      {checkpoints.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-border border-t pt-3">
          <span className="text-muted-foreground text-xs font-medium uppercase">Versions</span>
          {recentCheckpoints.map((checkpoint) => {
            const isActive = checkpoint.id === activeScreenJsonId;
            const isRestoringCheckpoint = checkpoint.id === restoringScreenJsonId;
            const status = databaseVersionStatus(checkpoint, sandboxState);
            return (
              <button
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs hover:bg-secondary disabled:cursor-default disabled:opacity-60',
                  isActive && 'border-primary text-primary'
                )}
                disabled={isActive || isRestoring || isRestoringCheckpoint}
                key={checkpoint.id}
                onClick={() => onRestoreCheckpoint(checkpoint.id)}
                title={`${checkpoint.page} / ${databaseVersionStatusLabel(status)}`}
                type="button"
              >
                <DatabaseVersionIcon status={status} />
                <span>
                  {isRestoringCheckpoint
                    ? '復元中'
                    : isActive
                      ? `現在 v${checkpoint.version}`
                      : `v${checkpoint.version}`}
                </span>
              </button>
            );
          })}
          {olderCheckpoints.length > 0 ? (
            <select
              aria-label="Older versions"
              className="h-8 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={isRestoring}
              onChange={(event) => {
                const screenJsonId = event.target.value;
                if (screenJsonId) onRestoreCheckpoint(screenJsonId);
                event.currentTarget.value = '';
              }}
              value=""
            >
              <option value="">過去version</option>
              {olderCheckpoints.map((checkpoint) => {
                const status = databaseVersionStatus(checkpoint, sandboxState);
                return (
                  <option key={checkpoint.id} value={checkpoint.id}>
                    v{checkpoint.version} · {checkpoint.page} · {databaseVersionStatusLabel(status)}
                  </option>
                );
              })}
            </select>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function BindingRuntimeBanner({
  issues,
  notice,
}: {
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
          <p className="font-medium text-amber-800">
            この UI の binding は現在の SandboxDB に未適用です。
          </p>
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
  activeTab,
  activeVersion,
  activities,
  availableActions,
  composeNotice,
  currentProjectId,
  currentSessionId,
  hasActiveScreen,
  initialPrompt,
  isOpen,
  isPending,
  messages,
  onGenerateAction,
  onOpenChange,
  onOpenTargetPath,
  onResolveTargetPath,
  onStageActionTarget,
  onSubmitPrompt,
  onTabChange,
  promptResetKey,
  projectSessions,
  selectedAction,
  sessionTitle,
  sessions,
}: {
  actionLinks: ScreenActionLink[];
  activeTab: DockTab;
  activeVersion: number | null;
  activities: DockActivity[];
  availableActions: AppAction[];
  composeNotice: BindingNotice | null;
  currentProjectId: string | null;
  currentSessionId: string | null;
  hasActiveScreen: boolean;
  initialPrompt: string;
  isOpen: boolean;
  isPending: boolean;
  messages: ChatMessage[];
  onGenerateAction: (action: AppAction) => void;
  onOpenChange: (value: boolean) => void;
  onOpenTargetPath: (targetPath: string) => void;
  onResolveTargetPath: (targetPath: string | null | undefined) => string | null;
  onStageActionTarget: (action: AppAction, targetPath: string) => AppUiSchema | null;
  onSubmitPrompt: (prompt: string) => void;
  onTabChange: (tab: DockTab) => void;
  promptResetKey: number;
  projectSessions: PromptSessionSummary[];
  selectedAction: SelectedAction | null;
  sessionTitle?: string;
  sessions: PromptSessionSummary[];
}) {
  const [prompt, setPrompt] = useState(initialPrompt);

  useEffect(() => {
    if (promptResetKey > 0) setPrompt('');
  }, [promptResetKey]);

  const submitPrompt = () => {
    const trimmed = prompt.trim();
    if (!trimmed || isPending) return;
    onSubmitPrompt(trimmed);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitPrompt();
  };

  const handlePromptKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (!isPromptSubmitShortcut(event)) return;
    event.preventDefault();
    submitPrompt();
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
            <div aria-live="polite" className="grid gap-3">
              {messages.map((message) => (
                <ChatBubble key={message.id} message={message} />
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
            currentProjectId={currentProjectId}
            currentSessionId={currentSessionId}
            isPending={isPending}
            onGenerateAction={onGenerateAction}
            onOpenTargetPath={onOpenTargetPath}
            onResolveTargetPath={onResolveTargetPath}
            onStageActionTarget={onStageActionTarget}
            projectSessions={projectSessions}
            selectedAction={selectedAction}
            sessions={sessions}
          />
        )}
      </div>

      {activeTab === 'chat' ? (
        <form className="grid gap-2 border-t border-border p-3" onSubmit={handleSubmit}>
          <textarea
            aria-label="Prompt"
            aria-keyshortcuts="Control+Enter"
            className="max-h-40 min-h-24 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            maxLength={2000}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={handlePromptKeyDown}
            placeholder={hasActiveScreen ? 'この画面の修正内容を入力' : '作りたい画面を入力'}
            value={prompt}
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground text-xs">{prompt.length}/2000</span>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-[11px]">(ctrl + Enter)</span>
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
          </div>
        </form>
      ) : null}
    </aside>
  );
}

type LinkChoice = 'custom-path' | `path:${string}` | `session:${string}`;
type LinkChoiceOption = {
  label: string;
  value: LinkChoice;
};

function choiceForSelectedAction(
  selectedAction: SelectedAction | null,
  selectedLink: ScreenActionLink | null
): LinkChoice {
  if (selectedLink?.targetSessionId) return `session:${selectedLink.targetSessionId}`;
  if (selectedLink?.targetPath) return `path:${selectedLink.targetPath}`;
  if (selectedAction?.action.target) return `path:${selectedAction.action.target}`;
  return 'custom-path';
}

function pathFromChoice(choice: LinkChoice, customPath: string, sessions: PromptSessionSummary[]) {
  if (choice === 'custom-path') return customPath.trim() || null;
  if (choice.startsWith('session:')) {
    const sessionId = choice.slice('session:'.length);
    const session = sessions.find((item) => item.id === sessionId);
    const pagePath = normalizeProjectPagePathForLink(session?.pagePath);
    if (pagePath) return pagePath === 'index' ? '/' : `/${pagePath}`;
    return session ? pathFromSessionChoice(session) : promptSessionPath(sessionId);
  }
  if (choice.startsWith('path:')) return choice.slice('path:'.length);
  return null;
}

function ComposePanel({
  actionLinks,
  availableActions,
  composeNotice,
  currentProjectId,
  currentSessionId,
  isPending,
  onGenerateAction,
  onOpenTargetPath,
  onResolveTargetPath,
  onStageActionTarget,
  projectSessions,
  selectedAction,
  sessions,
}: {
  actionLinks: ScreenActionLink[];
  availableActions: AppAction[];
  composeNotice: BindingNotice | null;
  currentProjectId: string | null;
  currentSessionId: string | null;
  isPending: boolean;
  onGenerateAction: (action: AppAction) => void;
  onOpenTargetPath: (targetPath: string) => void;
  onResolveTargetPath: (targetPath: string | null | undefined) => string | null;
  onStageActionTarget: (action: AppAction, targetPath: string) => AppUiSchema | null;
  projectSessions: PromptSessionSummary[];
  selectedAction: SelectedAction | null;
  sessions: PromptSessionSummary[];
}) {
  const targetChoiceButtonRef = useRef<HTMLButtonElement>(null);
  const targetChoiceContainerRef = useRef<HTMLDivElement>(null);
  const [customPath, setCustomPath] = useState('');
  const [isTargetChoiceOpen, setIsTargetChoiceOpen] = useState(false);
  const [targetChoice, setTargetChoice] = useState<LinkChoice>('custom-path');
  const selectedLink = selectedAction
    ? (actionLinks.find((link) => link.actionId === selectedAction.action.id) ?? null)
    : null;
  const targetSession = sessions.find((session) => session.id === selectedLink?.targetSessionId);
  const pageOptions = (currentProjectId ? projectSessions : sessions).filter(
    (session) => session.id !== currentSessionId
  );
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
    for (const session of pageOptions) {
      addPath(
        session.pagePath === 'index' ? '/' : `/${session.pagePath}`,
        session.page ?? session.title
      );
    }
    for (const action of availableActions) {
      addPath(action.target, action.label);
    }
    for (const link of actionLinks) {
      addPath(link.targetPath, '既存リンク');
    }

    return Array.from(byPath, ([path, label]) => ({ path, label }));
  }, [actionLinks, availableActions, pageOptions, selectedAction, selectedLink]);
  const targetChoiceOptions = useMemo<LinkChoiceOption[]>(() => {
    const sessionOptions = pageOptions.map((session) => ({
      label: `既存ページ: ${session.page ?? session.title}`,
      value: `session:${session.id}` as LinkChoice,
    }));
    const pathChoiceOptions = pathOptions.map((option) => ({
      label: `パス: ${option.path}${option.label ? ` (${option.label})` : ''}`,
      value: `path:${option.path}` as LinkChoice,
    }));

    return [
      ...sessionOptions,
      ...pathChoiceOptions,
      { label: 'カスタムパス', value: 'custom-path' },
    ];
  }, [pageOptions, pathOptions]);
  const selectedTargetChoiceLabel =
    targetChoiceOptions.find((option) => option.value === targetChoice)?.label ?? 'カスタムパス';
  const canGenerateNewPage = selectedAction?.action.kind !== 'submit';

  useEffect(() => {
    setTargetChoice(choiceForSelectedAction(selectedAction, selectedLink));
    setCustomPath(selectedLink?.targetPath ?? selectedAction?.action.target ?? '');
    setIsTargetChoiceOpen(false);
    if (selectedAction) {
      requestAnimationFrame(() => targetChoiceButtonRef.current?.focus());
    }
  }, [selectedAction, selectedLink]);

  useEffect(() => {
    if (!isTargetChoiceOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !targetChoiceContainerRef.current?.contains(target)) {
        setIsTargetChoiceOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isTargetChoiceOpen]);

  const applyTargetChoice = (choice: LinkChoice) => {
    setTargetChoice(choice);
    setIsTargetChoiceOpen(false);
    const targetPath = pathFromChoice(choice, customPath, sessions);
    if (selectedAction && targetPath) {
      onStageActionTarget(selectedAction.action, targetPath);
    }
  };

  const handleOpenAction = () => {
    if (!selectedAction || isPending) return;
    const targetPath = pathFromChoice(targetChoice, customPath, sessions);
    if (!targetPath) return;
    const staged = onStageActionTarget(selectedAction.action, targetPath);
    if (!staged) return;
    onOpenTargetPath(targetPath);
  };

  const handleGenerateAction = () => {
    if (!selectedAction || isPending || !canGenerateNewPage) return;
    const targetPath = pathFromChoice(targetChoice, customPath, sessions);
    if (targetPath) {
      const staged = onStageActionTarget(selectedAction.action, targetPath);
      if (!staged) return;
      onGenerateAction({ ...selectedAction.action, target: targetPath });
      return;
    }
    onGenerateAction(selectedAction.action);
  };

  const selectedTargetPath = pathFromChoice(targetChoice, customPath, sessions);
  const resolvedSelectedTargetPath = onResolveTargetPath(selectedTargetPath);
  const canOpenTarget = Boolean(selectedAction && !isPending && resolvedSelectedTargetPath);
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

          <div className="grid min-w-0 gap-1 text-sm">
            <span className="text-muted-foreground text-xs font-medium">リンク先</span>
            <div className="relative min-w-0" ref={targetChoiceContainerRef}>
              <button
                aria-expanded={isTargetChoiceOpen}
                aria-haspopup="listbox"
                className="flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-background px-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setIsTargetChoiceOpen((current) => !current)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setIsTargetChoiceOpen(false);
                  }
                }}
                ref={targetChoiceButtonRef}
                type="button"
              >
                <span className="min-w-0 flex-1 truncate">{selectedTargetChoiceLabel}</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
              {isTargetChoiceOpen ? (
                <div
                  className="absolute top-full right-0 left-0 z-50 mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-lg"
                  role="listbox"
                >
                  {targetChoiceOptions.map((option) => (
                    <button
                      aria-selected={option.value === targetChoice}
                      className={cn(
                        'flex h-8 w-full min-w-0 items-center rounded-sm px-2 text-left text-sm hover:bg-secondary',
                        option.value === targetChoice && 'bg-secondary text-foreground'
                      )}
                      key={option.value}
                      onClick={() => applyTargetChoice(option.value)}
                      role="option"
                      type="button"
                    >
                      <span className="min-w-0 truncate">{option.label}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

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

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

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
