import { Link } from '@tanstack/react-router';
import { Clock, GitBranch, Trash2 } from 'lucide-react';
import type { GeneratedScreenSummary } from '../../../../shared/schemas/screen-history.schema';
import { cn } from '../../../lib/utils';

type ScreenHistoryListProps = {
  activeScreenId?: string | null;
  isDeleting?: boolean;
  onDelete?: (screenId: string) => void;
  screens: GeneratedScreenSummary[];
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
}: ScreenHistoryListProps) {
  if (screens.length === 0) {
    return (
      <section className="rounded-lg border border-dashed border-border bg-card/40 p-6 text-center">
        <h2 className="font-semibold">History is empty</h2>
        <p className="mt-2 text-muted-foreground text-sm">
          Generated screens will appear here after you submit a prompt.
        </p>
      </section>
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
                onClick={() => onDelete(screen.id)}
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
