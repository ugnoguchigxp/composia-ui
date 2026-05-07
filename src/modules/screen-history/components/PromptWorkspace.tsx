import { Link, useNavigate } from '@tanstack/react-router';
import {
  Activity,
  Bot,
  CheckCircle2,
  ChevronDown,
  History,
  Loader2,
  MessageSquare,
  Send,
  User,
  XCircle,
} from 'lucide-react';
import { type FormEvent, useCallback, useMemo, useState } from 'react';
import type { AiActivity } from '../../../../shared/schemas/ai.schema';
import type { GeneratedScreen } from '../../../../shared/schemas/screen-history.schema';
import type { AppAction } from '../../../../shared/schemas/ui-schema.schema';
import { useAuth } from '../../../lib/auth';
import { cn } from '../../../lib/utils';
import { JsonRenderRenderer } from '../../ui-schema/components/JsonRenderRenderer';
import {
  useGeneratedScreen,
  useGenerateScreen,
  useGenerateScreenFromAction,
} from '../hooks/screen-history.hooks';

type ChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  content: string;
};

type DockActivity = Omit<AiActivity, 'status'> & {
  status: AiActivity['status'] | 'pending' | 'running';
};

const defaultPrompt =
  '売上、問い合わせ、障害対応の状況を一目で把握できる運用ダッシュボードを作ってください。';

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

export function PromptWorkspace({ screenId }: { screenId?: string | null }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [isDockOpen, setIsDockOpen] = useState(true);
  const [localScreen, setLocalScreen] = useState<GeneratedScreen | null>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'assistant-initial',
      role: 'assistant',
      content: 'どんな UI にしますか？',
    },
  ]);
  const [activities, setActivities] = useState<DockActivity[]>([]);
  const screenQuery = useGeneratedScreen(screenId ?? null, Boolean(auth.user));
  const generateScreen = useGenerateScreen();
  const actionParentId =
    localScreen && (!screenId || localScreen.id === screenId) ? localScreen.id : (screenId ?? null);
  const generateFromAction = useGenerateScreenFromAction(actionParentId);
  const activeScreen =
    (!screenId || localScreen?.id === screenId ? localScreen : null) ??
    screenQuery.data?.screen ??
    null;
  const isPending = generateScreen.isPending || generateFromAction.isPending;

  const openScreen = useCallback(
    (nextScreenId: string) => {
      void navigate({ params: { screenId: nextScreenId }, to: '/prompt/$screenId' });
    },
    [navigate]
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || isPending) return;

    setIsDockOpen(true);
    setMessages((current) => [
      ...current,
      {
        id: createId('user'),
        role: 'user',
        content: trimmed,
      },
    ]);
    setActivities(pendingActivities('POST /api/screens/generate'));

    generateScreen.mutate(
      { prompt: trimmed },
      {
        onSuccess: (data) => {
          setLocalScreen(data.screen);
          setActivities(completedActivities(data, 'POST /api/screens/generate'));
          setMessages((current) => [
            ...current,
            {
              id: createId('assistant'),
              role: 'assistant',
              content: `${data.screen.schema.page} を保存しました。${data.screen.schema.sections.length} sections`,
            },
          ]);
          openScreen(data.screen.id);
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
      const parentId = activeScreen?.id;
      if (!parentId || generateFromAction.isPending) return;

      const endpoint = `POST /api/screens/${parentId}/actions/${action.id}/generate`;
      setPendingActionId(action.id);
      setIsDockOpen(true);
      setMessages((current) => [
        ...current,
        {
          id: createId('user'),
          role: 'user',
          content: action.label,
        },
      ]);
      setActivities(pendingActivities(endpoint));
      generateFromAction.mutate(
        { actionId: action.id, input: { action } },
        {
          onSuccess: (data) => {
            setPendingActionId(null);
            setLocalScreen(data.screen);
            setActivities(completedActivities(data, endpoint));
            setMessages((current) => [
              ...current,
              {
                id: createId('assistant'),
                role: 'assistant',
                content: `${data.screen.schema.page} を生成しました。`,
              },
            ]);
            openScreen(data.screen.id);
          },
          onError: (error) => {
            setPendingActionId(null);
            setActivities([
              {
                id: 'request',
                label: 'API request',
                status: 'failed',
                detail: error instanceof Error ? error.message : 'Request failed',
              },
            ]);
          },
        }
      );
    },
    [activeScreen?.id, generateFromAction, openScreen]
  );

  const screenContent = useMemo(() => {
    if (screenQuery.isLoading && screenId) {
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
    handleAction,
    pendingActionId,
    screenId,
    screenQuery.error,
    screenQuery.isLoading,
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
        activities={activities}
        isOpen={isDockOpen}
        isPending={isPending}
        messages={messages}
        onOpenChange={setIsDockOpen}
        onPromptChange={setPrompt}
        onSubmit={handleSubmit}
        prompt={prompt}
      />
    </div>
  );
}

function ChatDock({
  activities,
  isOpen,
  isPending,
  messages,
  onOpenChange,
  onPromptChange,
  onSubmit,
  prompt,
}: {
  activities: DockActivity[];
  isOpen: boolean;
  isPending: boolean;
  messages: ChatMessage[];
  onOpenChange: (value: boolean) => void;
  onPromptChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  prompt: string;
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
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm">Chatdock</h2>
        </div>
        <div className="flex items-center gap-1">
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
      </div>

      <form className="grid gap-2 border-t border-border p-3" onSubmit={onSubmit}>
        <textarea
          aria-label="Prompt"
          className="max-h-40 min-h-24 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          maxLength={2000}
          onChange={(event) => onPromptChange(event.target.value)}
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

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <article className={cn('flex gap-2', isUser && 'justify-end')}>
      {!isUser ? (
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-background">
          <Bot className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      ) : null}
      <div
        className={cn(
          'max-w-[18rem] rounded-lg px-3 py-2 text-sm leading-6',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground'
        )}
      >
        {message.content}
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
