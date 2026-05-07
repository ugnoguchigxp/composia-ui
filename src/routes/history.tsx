import { createFileRoute, Link } from '@tanstack/react-router';
import { History, Loader2, WandSparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAuth } from '../lib/auth';
import { ScreenHistoryList } from '../modules/screen-history/components/ScreenHistoryList';
import {
  useDeleteScreen,
  useScreenHistory,
} from '../modules/screen-history/hooks/screen-history.hooks';

// biome-ignore lint/suspicious/noExplicitAny: route path type is generated dynamically.
export const Route = createFileRoute('/history' as any)({
  component: HistoryPage,
});

function HistoryPage() {
  const auth = useAuth();
  const history = useScreenHistory(Boolean(auth.user));
  const deleteScreen = useDeleteScreen();
  const [query, setQuery] = useState('');
  const screens = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = history.data?.screens ?? [];
    if (!q) return all;
    return all.filter((screen) =>
      [screen.page, screen.prompt, screen.inferredIntent, screen.action?.label]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(q))
    );
  }, [history.data?.screens, query]);

  if (auth.isLoading) {
    return <div className="mx-auto max-w-6xl px-4 py-10 text-muted-foreground">Loading...</div>;
  }

  if (!auth.user) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <section className="rounded-lg border border-border bg-card p-[var(--ui-card-padding)]">
          <h1 className="text-2xl font-semibold">History</h1>
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
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 md:px-8">
      <section className="rounded-lg border border-border bg-card p-[var(--ui-card-padding)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">History</h1>
              <p className="mt-1 text-muted-foreground text-sm">
                Replay generated screens without calling the AI provider.
              </p>
            </div>
          </div>
          <Link
            className="inline-flex h-ui items-center gap-2 rounded-md bg-primary px-ui-button text-sm font-medium text-primary-foreground hover:bg-primary/90"
            to="/prompt"
          >
            <WandSparkles className="h-4 w-4" />
            Prompt
          </Link>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <input
          aria-label="Search generated screens"
          className="h-ui min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search history"
          value={query}
        />
        {history.isLoading ? (
          <span className="inline-flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading
          </span>
        ) : null}
      </div>

      {history.error ? (
        <section className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
          <h2 className="font-semibold">History request failed</h2>
          <p className="mt-2 text-muted-foreground text-sm">{history.error.message}</p>
        </section>
      ) : (
        <ScreenHistoryList
          isDeleting={deleteScreen.isPending}
          onDelete={(screenId) => deleteScreen.mutate(screenId)}
          screens={screens}
        />
      )}
    </div>
  );
}
