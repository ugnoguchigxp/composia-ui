import { Link, useNavigate } from '@tanstack/react-router';
import {
  Activity,
  Bot,
  CheckCircle2,
  ChevronDown,
  Database,
  History,
  Loader2,
  MessageSquare,
  Send,
  User,
  XCircle,
} from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AiActivity } from '../../../../shared/schemas/ai.schema';
import type {
  GeneratedScreen,
  PromptSessionMessage,
  ScreenJson,
} from '../../../../shared/schemas/screen-history.schema';
import type { AppAction } from '../../../../shared/schemas/ui-schema.schema';
import { useAuth } from '../../../lib/auth';
import { cn } from '../../../lib/utils';
import { JsonRenderRenderer } from '../../ui-schema/components/JsonRenderRenderer';
import {
  useEditSessionScreen,
  useGeneratedScreen,
  useGenerateScreen,
  useGenerateScreenFromAction,
  useGenerateScreenFromSessionAction,
  useRestoreScreenJsonCheckpoint,
  useScreenConversation,
} from '../hooks/screen-history.hooks';

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

export function PromptWorkspace({
  screenId,
  sessionId,
}: {
  screenId?: string | null;
  sessionId?: string | null;
}) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState(() => (screenId || sessionId ? '' : defaultPrompt));
  const [isDockOpen, setIsDockOpen] = useState(true);
  const [localScreen, setLocalScreen] = useState<GeneratedScreen | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [restoringScreenJsonId, setRestoringScreenJsonId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([initialAssistantMessage]);
  const handledScreenRouteRef = useRef<string | null>(null);
  const [activities, setActivities] = useState<DockActivity[]>([]);
  const screenQuery = useGeneratedScreen(screenId ?? null, Boolean(auth.user && screenId));
  const routeSessionId = sessionId ?? screenQuery.data?.screen.sessionId ?? null;
  const conversationQuery = useScreenConversation(
    routeSessionId,
    Boolean(auth.user && routeSessionId)
  );
  const generateScreen = useGenerateScreen();
  const editSessionScreen = useEditSessionScreen(routeSessionId);
  const restoreCheckpoint = useRestoreScreenJsonCheckpoint(routeSessionId);
  const actionParentId =
    localScreen && (!screenId || localScreen.id === screenId) ? localScreen.id : (screenId ?? null);
  const generateFromAction = useGenerateScreenFromAction(actionParentId);
  const generateFromSessionAction = useGenerateScreenFromSessionAction(routeSessionId);
  const activeConversationScreen = conversationQuery.data?.screenJsons.find(
    (screenJson) => screenJson.id === conversationQuery.data?.activeScreenJsonId
  );
  const activeScreen: WorkspaceScreen | null =
    localScreen ??
    (sessionId
      ? activeConversationScreen
      : (screenQuery.data?.screen ?? activeConversationScreen)) ??
    null;
  const persistedMessages = useMemo(() => {
    const conversation = conversationQuery.data;
    if (!conversation) return [];

    const checkpointVersionById = new Map(
      conversation.screenJsons.map((screenJson) => [screenJson.id, screenJson.version])
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
  const isPending =
    generateScreen.isPending ||
    generateFromAction.isPending ||
    generateFromSessionAction.isPending ||
    editSessionScreen.isPending ||
    restoreCheckpoint.isPending;

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

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || isPending) return;

    const shouldEdit = Boolean(routeSessionId && activeScreen);
    const endpoint = shouldEdit
      ? `POST /api/sessions/${routeSessionId}/edit`
      : 'POST /api/screens/generate';

    setIsDockOpen(true);
    appendUserMessage(trimmed);
    setActivities(pendingActivities(endpoint));

    if (shouldEdit && routeSessionId) {
      editSessionScreen.mutate(
        { prompt: trimmed },
        {
          onSuccess: (data) => {
            setLocalScreen(data.screen);
            setPrompt('');
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

    generateScreen.mutate(
      { prompt: trimmed },
      {
        onSuccess: (data) => {
          setLocalScreen(data.screen);
          setPrompt('');
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
  };

  const handleAction = useCallback(
    (action: AppAction) => {
      if (!activeScreen || generateFromAction.isPending || generateFromSessionAction.isPending) {
        return;
      }

      const endpoint = routeSessionId
        ? `POST /api/sessions/${routeSessionId}/actions/${action.id}/generate`
        : `POST /api/screens/${activeScreen.id}/actions/${action.id}/generate`;
      setPendingActionId(action.id);
      setIsDockOpen(true);
      appendUserMessage(action.label);
      setActivities(pendingActivities(endpoint));

      const onSuccess = (data: { activities: AiActivity[]; screen: GeneratedScreen }) => {
        setPendingActionId(null);
        setLocalScreen(data.screen);
        setActivities(completedActivities(data, endpoint));
        appendAssistantMessage(`${data.screen.schema.page} を生成しました。`, data.screen);
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
        generateFromSessionAction.mutate(
          { actionId: action.id, input: { action } },
          { onError, onSuccess }
        );
        return;
      }

      generateFromAction.mutate({ actionId: action.id, input: { action } }, { onError, onSuccess });
    },
    [
      activeScreen,
      appendAssistantMessage,
      appendUserMessage,
      generateFromAction,
      generateFromSessionAction,
      openSession,
      routeSessionId,
    ]
  );

  const handleRestoreCheckpoint = useCallback(
    (screenJsonId: string) => {
      if (!routeSessionId || restoreCheckpoint.isPending) return;
      setRestoringScreenJsonId(screenJsonId);
      restoreCheckpoint.mutate(screenJsonId, {
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
    [openSession, restoreCheckpoint, routeSessionId]
  );

  useEffect(() => {
    if (persistedMessageKey) {
      setMessages([initialAssistantMessage]);
    }
  }, [persistedMessageKey]);

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
          <p className="mt-2 text-muted-foreground text-sm">{conversationQuery.error.message}</p>
        </section>
      );
    }

    if (activeScreen) {
      return (
        <JsonRenderRenderer
          onAction={handleAction}
          pendingActionId={pendingActionId}
          schema={activeScreen.schema}
        />
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
  }, [
    activeScreen,
    conversationQuery.error,
    conversationQuery.isLoading,
    handleAction,
    pendingActionId,
    screenId,
    screenQuery.error,
    screenQuery.isLoading,
    sessionId,
  ]);

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
        activeScreenJsonId={activeScreenJsonId}
        activeVersion={conversationQuery.data?.activeVersion ?? null}
        activities={activities}
        checkpoints={conversationQuery.data?.screenJsons ?? []}
        hasActiveScreen={Boolean(activeScreen)}
        isOpen={isDockOpen}
        isPending={isPending}
        messages={displayMessages}
        onOpenChange={setIsDockOpen}
        onPromptChange={setPrompt}
        onRestoreCheckpoint={handleRestoreCheckpoint}
        onSubmit={handleSubmit}
        prompt={prompt}
        restoringScreenJsonId={restoringScreenJsonId}
        sessionTitle={conversationQuery.data?.session.title}
      />
    </div>
  );
}

function ChatDock({
  activeScreenJsonId,
  activeVersion,
  activities,
  checkpoints,
  hasActiveScreen,
  isOpen,
  isPending,
  messages,
  onOpenChange,
  onPromptChange,
  onRestoreCheckpoint,
  onSubmit,
  prompt,
  restoringScreenJsonId,
  sessionTitle,
}: {
  activeScreenJsonId: string | null;
  activeVersion: number | null;
  activities: DockActivity[];
  checkpoints: ScreenJson[];
  hasActiveScreen: boolean;
  isOpen: boolean;
  isPending: boolean;
  messages: ChatMessage[];
  onOpenChange: (value: boolean) => void;
  onPromptChange: (value: string) => void;
  onRestoreCheckpoint: (screenJsonId: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  prompt: string;
  restoringScreenJsonId: string | null;
  sessionTitle?: string;
}) {
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
            aria-label="Open history"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-secondary"
            to="/history"
          >
            <History className="h-4 w-4" />
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

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {checkpoints.length > 0 ? (
          <section className="mb-4 rounded-md border border-border bg-background/70 p-3">
            <div className="mb-2 text-muted-foreground text-xs font-medium uppercase">
              Checkpoints
            </div>
            <div className="flex flex-wrap gap-2">
              {checkpoints.map((checkpoint) => {
                const isActive = checkpoint.id === activeScreenJsonId;
                const isRestoring = checkpoint.id === restoringScreenJsonId;
                return (
                  <button
                    className="rounded-md border border-border bg-card px-2.5 py-1 text-xs hover:bg-secondary disabled:cursor-default disabled:opacity-60"
                    disabled={isActive || isRestoring}
                    key={checkpoint.id}
                    onClick={() => onRestoreCheckpoint(checkpoint.id)}
                    title={checkpoint.schema.page}
                    type="button"
                  >
                    {isRestoring
                      ? '復元中'
                      : isActive
                        ? `現在 v${checkpoint.version}`
                        : `v${checkpoint.version}`}
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
      </div>

      <form className="grid gap-2 border-t border-border p-3" onSubmit={onSubmit}>
        <textarea
          aria-label="Prompt"
          className="max-h-40 min-h-24 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          maxLength={2000}
          onChange={(event) => onPromptChange(event.target.value)}
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
    </aside>
  );
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
