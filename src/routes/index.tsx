import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: Index,
});

function Index() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-12">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-normal">Welcome to composia-ai</h1>
        <p className="max-w-2xl leading-7 text-muted-foreground">
          Generate structured app screens from prompts, revisit them from UIDesign, and let actions
          branch into the next AI-inferred screen.
        </p>
      </div>
      <Link
        className="inline-flex h-ui items-center rounded-md bg-primary px-ui-button text-sm font-medium text-primary-foreground hover:bg-primary/90"
        to="/prompt"
      >
        Start prompting
      </Link>
    </div>
  );
}
