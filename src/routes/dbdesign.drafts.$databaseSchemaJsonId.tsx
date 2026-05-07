import { createFileRoute } from '@tanstack/react-router';
import { DatabaseDraftDetailWorkspace } from '../modules/database-design/components/DatabaseDesignerWorkspace';

export const Route = createFileRoute('/dbdesign/drafts/$databaseSchemaJsonId' as never)({
  component: () => {
    const { databaseSchemaJsonId } = Route.useParams() as {
      databaseSchemaJsonId: string;
    };
    return <DatabaseDraftDetailWorkspace databaseSchemaJsonId={databaseSchemaJsonId} />;
  },
});
