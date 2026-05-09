import { createFileRoute, Link } from '@tanstack/react-router';
import { Image, Loader2 } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { MediaLibrary } from '../modules/media/components/MediaLibrary';

// biome-ignore lint/suspicious/noExplicitAny: route path type is generated dynamically.
export const Route = createFileRoute('/media' as any)({
  component: MediaPage,
});

function MediaPage() {
  const auth = useAuth();

  if (auth.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!auth.user) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <section className="rounded-lg border border-border bg-card p-[var(--ui-card-padding)]">
          <h1 className="text-2xl font-semibold">Media</h1>
          <Link
            className="mt-5 inline-flex h-ui items-center rounded-md bg-primary px-ui-button text-sm font-medium text-primary-foreground hover:bg-primary/90"
            to="/login"
          >
            Login
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-4 px-4 py-8 md:px-8">
      <header className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Image className="h-4 w-4 text-primary" />
          <h1 className="text-lg font-semibold tracking-tight">Media</h1>
        </div>
      </header>
      <MediaLibrary />
    </div>
  );
}
