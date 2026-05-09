import { createFileRoute, useRouterState } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';

const PromptWorkspace = lazy(async () => {
  const module = await import('../modules/screen-history/components/PromptWorkspace');
  return { default: module.PromptWorkspace };
});

// biome-ignore lint/suspicious/noExplicitAny: route path type is generated dynamically.
export const Route = createFileRoute('/prompt' as any)({
  component: PromptRoute,
});

function PromptWorkspaceFallback() {
  return (
    <div className="flex min-h-[65vh] items-center justify-center text-muted-foreground text-sm">
      Loading workspace...
    </div>
  );
}

function PromptRoute() {
  const location = useRouterState({ select: (state) => state.location });
  const pathname = location.pathname;
  const projectMatch = pathname.match(/^\/prompt\/project\/([^/]+)\/(.+)$/);
  const sessionId = pathname.match(/^\/prompt\/session\/([^/]+)$/)?.[1];
  const screenId = sessionId ? undefined : pathname.match(/^\/prompt\/([^/]+)$/)?.[1];
  if (projectMatch?.[1]) {
    const projectId = decodeURIComponent(projectMatch[1]);
    const pagePath = decodeURIComponent(projectMatch[2] ?? 'index');
    const search = location.search as Record<string, unknown>;
    const pageSessionId = typeof search.id === 'string' ? decodeURIComponent(search.id) : undefined;
    return (
      <Suspense fallback={<PromptWorkspaceFallback />}>
        <PromptWorkspace
          key={`${projectId}/${pagePath}/${pageSessionId ?? ''}`}
          pagePath={pagePath}
          projectId={projectId}
          sessionId={pageSessionId}
        />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<PromptWorkspaceFallback />}>
      <PromptWorkspace
        key={sessionId ?? screenId ?? 'new'}
        screenId={screenId ? decodeURIComponent(screenId) : undefined}
        sessionId={sessionId ? decodeURIComponent(sessionId) : undefined}
      />
    </Suspense>
  );
}
