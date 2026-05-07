import { createFileRoute, useRouterState } from '@tanstack/react-router';
import { PromptWorkspace } from '../modules/screen-history/components/PromptWorkspace';

// biome-ignore lint/suspicious/noExplicitAny: route path type is generated dynamically.
export const Route = createFileRoute('/prompt' as any)({
  component: PromptRoute,
});

function PromptRoute() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const screenId = pathname.match(/^\/prompt\/([^/]+)$/)?.[1];
  return <PromptWorkspace screenId={screenId ? decodeURIComponent(screenId) : undefined} />;
}
