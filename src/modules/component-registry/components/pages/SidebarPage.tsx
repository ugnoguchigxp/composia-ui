import type { BaseComponentProps } from '@json-render/react';
import type { z } from 'zod';
import { cn } from '../../../../lib/utils';
import type { componentPropsSchemas } from '../../services/catalog.service';

type SidebarPageProps = z.infer<(typeof componentPropsSchemas)['SidebarPage']>;

export function SidebarPage({ props, children }: BaseComponentProps<SidebarPageProps>) {
  const density = props.visualIntent?.density ?? 'normal';
  const hasNavigation = props.navigation.length > 0;

  return (
    <section
      className={cn(
        'mx-auto grid w-full max-w-7xl gap-6 px-4 py-8 md:px-8',
        hasNavigation && 'lg:grid-cols-[17rem_minmax(0,1fr)]',
        density === 'compact' && 'lg:gap-5',
        density === 'normal' && 'lg:gap-7',
        density === 'spacious' && 'lg:gap-10'
      )}
      data-density={density}
    >
      {hasNavigation ? (
        <aside className="self-start rounded-lg border border-border bg-card p-4 lg:sticky lg:top-24">
          <nav className="grid gap-1" aria-label={`${props.title} navigation`}>
            {props.navigation.map((item) => (
              <a
                className="rounded-md px-3 py-2 text-sm transition-colors hover:bg-secondary"
                href={item.href}
                key={item.href}
              >
                <span className="font-medium text-foreground">{item.label}</span>
                {item.description ? (
                  <span className="mt-0.5 block text-muted-foreground text-xs leading-5">
                    {item.description}
                  </span>
                ) : null}
              </a>
            ))}
          </nav>
        </aside>
      ) : null}
      <div
        className={cn(
          'min-w-0',
          density === 'compact' && 'space-y-5',
          density === 'normal' && 'space-y-7',
          density === 'spacious' && 'space-y-10'
        )}
      >
        {children}
      </div>
    </section>
  );
}
