import { createFileRoute, Outlet, useRouterState } from '@tanstack/react-router';
import { DatabaseDesignerWorkspace } from '../modules/database-design/components/DatabaseDesignerWorkspace';

function DbdesignRouteComponent() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (pathname.startsWith('/dbdesign/drafts/')) return <Outlet />;
  return <DatabaseDesignerWorkspace />;
}

// biome-ignore lint/suspicious/noExplicitAny: route path type is generated dynamically.
export const Route = createFileRoute('/dbdesign' as any)({
  component: DbdesignRouteComponent,
});
