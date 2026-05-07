import { createFileRoute } from '@tanstack/react-router';
import { DatabaseDesignerWorkspace } from '../modules/database-design/components/DatabaseDesignerWorkspace';

// biome-ignore lint/suspicious/noExplicitAny: route path type is generated dynamically.
export const Route = createFileRoute('/database' as any)({
  component: DatabaseDesignerWorkspace,
});
