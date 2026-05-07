import { createFileRoute } from '@tanstack/react-router';
import { PromptWorkspace } from '../modules/screen-history/components/PromptWorkspace';

// biome-ignore lint/suspicious/noExplicitAny: route path type is generated dynamically.
export const Route = createFileRoute('/prompt/session/$sessionId' as any)({
  component: PromptSessionRoute,
});

function PromptSessionRoute() {
  const { sessionId } = Route.useParams();
  return <PromptWorkspace sessionId={sessionId} />;
}
