import { createFileRoute, Outlet, useRouterState } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';

const DatabaseDesignerWorkspace = lazy(async () => {
  const module = await import('../modules/database-design/components/DatabaseDesignerWorkspace');
  return { default: module.DatabaseDesignerWorkspace };
});

function DbdesignWorkspaceFallback() {
  return (
    <div className="flex min-h-[65vh] items-center justify-center text-muted-foreground text-sm">
      Loading DBDesign workspace...
    </div>
  );
}

function DbdesignRouteComponent() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (pathname.startsWith('/dbdesign/drafts/')) return <Outlet />;
  return (
    <Suspense fallback={<DbdesignWorkspaceFallback />}>
      <DatabaseDesignerWorkspace />
    </Suspense>
  );
}

// biome-ignore lint/suspicious/noExplicitAny: route path type is generated dynamically.
export const Route = createFileRoute('/dbdesign' as any)({
  component: DbdesignRouteComponent,
});
