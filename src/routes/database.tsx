import { createFileRoute } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';

const DatabaseDesignerWorkspace = lazy(async () => {
  const module = await import('../modules/database-design/components/DatabaseDesignerWorkspace');
  return { default: module.DatabaseDesignerWorkspace };
});

// biome-ignore lint/suspicious/noExplicitAny: route path type is generated dynamically.
export const Route = createFileRoute('/database' as any)({
  component: () => (
    <Suspense
      fallback={
        <div className="flex min-h-[65vh] items-center justify-center text-muted-foreground text-sm">
          Loading DBDesign workspace...
        </div>
      }
    >
      <DatabaseDesignerWorkspace />
    </Suspense>
  ),
});
