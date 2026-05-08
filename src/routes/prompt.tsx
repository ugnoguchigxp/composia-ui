import { createFileRoute, useRouterState } from '@tanstack/react-router';
import { PromptWorkspace } from '../modules/screen-history/components/PromptWorkspace';

// biome-ignore lint/suspicious/noExplicitAny: route path type is generated dynamically.
export const Route = createFileRoute('/prompt' as any)({
  component: PromptRoute,
});

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
      <PromptWorkspace
        key={`${projectId}/${pagePath}/${pageSessionId ?? ''}`}
        pagePath={pagePath}
        projectId={projectId}
        sessionId={pageSessionId}
      />
    );
  }

  return (
    <PromptWorkspace
      key={sessionId ?? screenId ?? 'new'}
      screenId={screenId ? decodeURIComponent(screenId) : undefined}
      sessionId={sessionId ? decodeURIComponent(sessionId) : undefined}
    />
  );
}
