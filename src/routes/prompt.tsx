import { createFileRoute, useRouterState } from '@tanstack/react-router';
import { PromptWorkspace } from '../modules/screen-history/components/PromptWorkspace';

// biome-ignore lint/suspicious/noExplicitAny: route path type is generated dynamically.
export const Route = createFileRoute('/prompt' as any)({
  component: PromptRoute,
});

function PromptRoute() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const sessionId = pathname.match(/^\/prompt\/session\/([^/]+)$/)?.[1];
  const screenId = sessionId ? undefined : pathname.match(/^\/prompt\/([^/]+)$/)?.[1];
  return (
    <PromptWorkspace
      key={sessionId ?? screenId ?? 'new'}
      screenId={screenId ? decodeURIComponent(screenId) : undefined}
      sessionId={sessionId ? decodeURIComponent(sessionId) : undefined}
    />
  );
}
