import { createFileRoute } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';

const DatabaseDraftDetailWorkspace = lazy(async () => {
  const module = await import('../modules/database-design/components/DatabaseDesignerWorkspace');
  return { default: module.DatabaseDraftDetailWorkspace };
});

function DraftWorkspaceFallback() {
  return (
    <div className="flex min-h-[65vh] items-center justify-center text-muted-foreground text-sm">
      Loading DBDesign draft...
    </div>
  );
}

export const Route = createFileRoute('/dbdesign/drafts/$databaseSchemaJsonId' as never)({
  component: () => {
    const { databaseSchemaJsonId } = Route.useParams() as {
      databaseSchemaJsonId: string;
    };
    return (
      <Suspense fallback={<DraftWorkspaceFallback />}>
        <DatabaseDraftDetailWorkspace databaseSchemaJsonId={databaseSchemaJsonId} />
      </Suspense>
    );
  },
});
