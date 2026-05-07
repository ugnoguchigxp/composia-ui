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
      aria-label={props.title}
      className={cn(
        'mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-7',
        density === 'compact' && 'space-y-5',
        density === 'normal' && 'space-y-7',
        density === 'spacious' && 'space-y-10'
      )}
      data-density={density}
    >
      <div className="grid gap-5">{children}</div>
    </section>
  );
}
