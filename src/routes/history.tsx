import { createFileRoute, Link } from '@tanstack/react-router';
import { Loader2, WandSparkles } from 'lucide-react';
import { useState } from 'react';
import type { ScreenListQuery } from '../../shared/schemas/screen-history.schema';
import { useAuth } from '../lib/auth';
import { ScreenHistoryTable } from '../modules/screen-history/components/ScreenHistoryTable';
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
  const [query, setQuery] = useState<ScreenListQuery>({
    page: 1,
    limit: 10,
    search: '',
    sortBy: 'updatedAt',
    sortOrder: 'desc',
  });
  const history = useScreenHistory(query, Boolean(auth.user));
  const deleteScreen = useDeleteScreen();

  const screens = history.data?.screens ?? [];
  const sessions = history.data?.sessions ?? [];
  const total = history.data?.total ?? 0;

  if (auth.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!auth.user) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <section className="rounded-lg border border-border bg-card p-[var(--ui-card-padding)]">
          <h1 className="text-2xl font-semibold">UIDesign</h1>
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
    <div className="mx-auto grid max-w-6xl gap-4 px-4 py-8 md:px-8">
      <header className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <WandSparkles className="h-4 w-4 text-primary" />
          <h1 className="text-lg font-semibold tracking-tight">UIDesign</h1>
          <span className="text-muted-foreground text-xs font-normal">({total} items)</span>
        </div>
      </header>

      {history.error ? (
        <section className="rounded-lg border border-destructive/30 bg-destructive/10 p-6">
          <h2 className="font-semibold text-destructive">UIDesign request failed</h2>
          <p className="mt-2 text-muted-foreground text-sm">{history.error.message}</p>
        </section>
      ) : history.isLoading ? (
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-4 text-muted-foreground animate-in fade-in slide-in-from-bottom-4 duration-700">
            <Loader2 className="h-10 w-10 animate-spin text-primary/60" />
            <p className="text-sm font-medium tracking-wide">Retrieving your generations...</p>
          </div>
        </div>
      ) : (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <ScreenHistoryTable
            isDeleting={deleteScreen.isPending}
            onDelete={(id) => deleteScreen.mutate(id)}
            onQueryChange={setQuery}
            query={query}
            screens={screens}
            sessions={sessions}
            total={total}
          />
        </div>
      )}
    </div>
  );
}
