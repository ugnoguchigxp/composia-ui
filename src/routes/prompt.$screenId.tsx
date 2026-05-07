import { createFileRoute } from '@tanstack/react-router';
import { PromptWorkspace } from '../modules/screen-history/components/PromptWorkspace';

// biome-ignore lint/suspicious/noExplicitAny: route path type is generated dynamically.
export const Route = createFileRoute('/prompt/$screenId' as any)({
  component: PromptScreenRoute,
});

function PromptScreenRoute() {
  const { screenId } = Route.useParams();
  return <PromptWorkspace screenId={screenId} />;
}
