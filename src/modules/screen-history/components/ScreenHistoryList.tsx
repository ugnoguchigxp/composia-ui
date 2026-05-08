import { Link } from '@tanstack/react-router';
import { Clock, GitBranch, Layers3, Trash2 } from 'lucide-react';
import type {
  GeneratedScreenSummary,
  PromptSessionSummary,
} from '../../../../shared/schemas/screen-history.schema';
import { cn } from '../../../lib/utils';
import type { ScreenHistoryDeleteTarget } from './ScreenHistoryTable';

type ScreenHistoryListProps = {
  activeScreenId?: string | null;
  isDeleting?: boolean;
  onDelete?: (target: ScreenHistoryDeleteTarget) => void;
  screens: GeneratedScreenSummary[];
  sessions?: PromptSessionSummary[];
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function ScreenHistoryList({
  activeScreenId,
  isDeleting,
  onDelete,
  screens,
  sessions = [],
}: ScreenHistoryListProps) {
  if (screens.length === 0 && sessions.length === 0) {
    return (
      <section className="rounded-lg border border-dashed border-border bg-card/40 p-6 text-center">
        <h2 className="font-semibold">UIDesign is empty</h2>
        <p className="mt-2 text-muted-foreground text-sm">
          Generated screens will appear here after you submit a prompt.
        </p>
      </section>
    );
  }

  if (sessions.length > 0) {
    return (
      <div className="grid gap-3">
        {sessions.map((session) => {
          const checkpoints = screens
            .filter((screen) => screen.sessionId === session.id)
            .sort((a, b) => a.version - b.version);

          return (
            <article
              className={cn(
                'rounded-lg border bg-card p-4 transition-colors',
                activeScreenId === session.activeScreenJsonId ? 'border-primary' : 'border-border'
              )}
              key={session.id}
            >
              <div className="flex items-start gap-3">
                <Link
                  className="min-w-0 flex-1 hover:opacity-80"
                  params={{ sessionId: session.id }}
                  to="/prompt/session/$sessionId"
                >
                  <h2 className="truncate font-semibold">{session.page ?? session.title}</h2>
                  <p className="mt-1 line-clamp-2 text-muted-foreground text-sm">
                    {session.inferredIntent ?? session.title}
                  </p>
                </Link>
                {onDelete ? (
                  <button
                    aria-label={`Delete ${session.page ?? session.title}`}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-secondary disabled:opacity-50"
                    disabled={isDeleting}
                    onClick={() => {
                      const title = session.page ?? session.title;
                      if (
                        window.confirm(`Delete "${title}" and all ${session.screenCount} versions?`)
                      ) {
                        onDelete({
                          id: session.id,
                          title,
                          type: 'session',
                          versionCount: session.screenCount,
                        });
                      }
                    }}
                    type="button"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-xs">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {formatDate(session.updatedAt)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Layers3 className="h-3.5 w-3.5" />
                  {session.screenCount} checkpoints
                </span>
                {session.activeVersion ? <span>active v{session.activeVersion}</span> : null}
                <span>{session.title}</span>
              </div>
              {checkpoints.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {checkpoints.map((checkpoint) => (
                    <span
                      className={cn(
                        'rounded-md border px-2 py-1 text-xs',
                        checkpoint.id === session.activeScreenJsonId
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground'
                      )}
                      key={checkpoint.id}
                      title={checkpoint.page}
                    >
                      v{checkpoint.version}
                    </span>
                  ))}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {screens.map((screen) => (
        <article
          className={cn(
            'rounded-lg border bg-card p-4 transition-colors',
            activeScreenId === screen.id ? 'border-primary' : 'border-border'
          )}
          key={screen.id}
        >
          <div className="flex items-start gap-3">
            <Link
              className="min-w-0 flex-1 hover:opacity-80"
              params={{ screenId: screen.id }}
              to="/prompt/$screenId"
            >
              <h2 className="truncate font-semibold">{screen.page}</h2>
              <p className="mt-1 line-clamp-2 text-muted-foreground text-sm">
                {screen.inferredIntent}
              </p>
            </Link>
            {onDelete ? (
              <button
                aria-label={`Delete ${screen.page}`}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-secondary disabled:opacity-50"
                disabled={isDeleting}
                onClick={() => {
                  if (window.confirm(`Delete "${screen.page}"?`)) {
                    onDelete({
                      id: screen.id,
                      title: screen.page,
                      type: 'screen',
                      versionCount: 1,
                    });
                  }
                }}
                type="button"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-xs">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {formatDate(screen.createdAt)}
            </span>
            <span>{screen.sections} sections</span>
            {screen.parentScreenId ? (
              <span className="inline-flex items-center gap-1">
                <GitBranch className="h-3.5 w-3.5" />
                child
              </span>
            ) : null}
            <span>{screen.trigger}</span>
          </div>
        </article>
      ))}
    </div>
  );
}
