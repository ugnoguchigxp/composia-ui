import { createFileRoute } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';

const PromptWorkspace = lazy(async () => {
  const module = await import('../modules/screen-history/components/PromptWorkspace');
  return { default: module.PromptWorkspace };
});

// biome-ignore lint/suspicious/noExplicitAny: route path type is generated dynamically.
export const Route = createFileRoute('/prompt/$screenId' as any)({
  component: PromptScreenRoute,
});

function PromptWorkspaceFallback() {
  return (
    <div className="flex min-h-[65vh] items-center justify-center text-muted-foreground text-sm">
      Loading workspace...
    </div>
  );
}

function PromptScreenRoute() {
  const { screenId } = Route.useParams();
  return (
    <Suspense fallback={<PromptWorkspaceFallback />}>
      <PromptWorkspace screenId={screenId} />
    </Suspense>
  );
}
