import { createFileRoute } from '@tanstack/react-router';
import { PromptWorkspace } from '../modules/screen-history/components/PromptWorkspace';

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

function PromptProjectRoute() {
  const params = Route.useParams() as ProjectRouteParams;
  const search = Route.useSearch() as { id?: string };
  const pagePath = params._splat ?? params['*'] ?? 'index';

  return (
    <PromptWorkspace
      key={`${params.projectId}/${pagePath}/${search.id ?? ''}`}
      pagePath={pagePath}
      projectId={params.projectId}
      sessionId={search.id ?? null}
    />
  );
}
