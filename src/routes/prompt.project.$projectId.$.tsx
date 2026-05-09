import { createFileRoute } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';

const PromptWorkspace = lazy(async () => {
  const module = await import('../modules/screen-history/components/PromptWorkspace');
  return { default: module.PromptWorkspace };
});

type ProjectRouteParams = {
  '*': string;
  _splat?: string;
  projectId: string;
};

// biome-ignore lint/suspicious/noExplicitAny: route path type is generated dynamically.
export const Route = createFileRoute('/prompt/project/$projectId/$' as any)({
  component: PromptProjectRoute,
  validateSearch: (search: Record<string, unknown>) => ({
    id: typeof search.id === 'string' ? search.id : undefined,
  }),
});

function PromptWorkspaceFallback() {
  return (
    <div className="flex min-h-[65vh] items-center justify-center text-muted-foreground text-sm">
      Loading workspace...
    </div>
  );
}

function PromptProjectRoute() {
  const params = Route.useParams() as ProjectRouteParams;
  const search = Route.useSearch() as { id?: string };
  const pagePath = params._splat ?? params['*'] ?? 'index';

  return (
    <Suspense fallback={<PromptWorkspaceFallback />}>
      <PromptWorkspace
        key={`${params.projectId}/${pagePath}/${search.id ?? ''}`}
        pagePath={pagePath}
        projectId={params.projectId}
        sessionId={search.id ?? null}
      />
    </Suspense>
  );
}
