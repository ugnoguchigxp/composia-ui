import type { BaseComponentProps } from '@json-render/react';
import type { z } from 'zod';
import { cn } from '../../../../lib/utils';
import type { componentPropsSchemas } from '../../services/catalog.service';

type PageProps =
  | z.infer<(typeof componentPropsSchemas)['DashboardPage']>
  | z.infer<(typeof componentPropsSchemas)['EntityListPage']>
  | z.infer<(typeof componentPropsSchemas)['EntityDetailPage']>
  | z.infer<(typeof componentPropsSchemas)['EditableFormPage']>
  | z.infer<(typeof componentPropsSchemas)['ArticleFeedPage']>
  | z.infer<(typeof componentPropsSchemas)['SidebarPage']>;

export function PageShell({ props, children }: BaseComponentProps<PageProps>) {
  const density = props.visualIntent?.density ?? 'normal';

  return (
    <section
      className={cn(
        'mx-auto w-full max-w-6xl px-4 py-8 md:px-8',
        density === 'compact' && 'space-y-5',
        density === 'normal' && 'space-y-7',
        density === 'spacious' && 'space-y-10'
      )}
      data-density={density}
    >
      <header className="max-w-3xl space-y-3">
        <h1 className="text-3xl font-semibold tracking-normal text-foreground md:text-4xl">
          {props.title}
        </h1>
        {props.description ? (
          <p className="text-base leading-7 text-muted-foreground">{props.description}</p>
        ) : null}
      </header>
      <div className="grid gap-5">{children}</div>
    </section>
  );
}
