import type { BaseComponentProps } from '@json-render/react';
import { Search } from 'lucide-react';
import type { z } from 'zod';
import type { componentPropsSchemas } from '../../services/catalog.service';
import { visualIntentClassName } from '../../services/visual-intent.service';
import { AppActionControl, type RenderableAppActionProps } from '../AppActionControl';

type FilterBarSectionProps = z.infer<(typeof componentPropsSchemas)['FilterBarSection']> &
  RenderableAppActionProps;

export function FilterBarSection({ props }: BaseComponentProps<FilterBarSectionProps>) {
  return (
    <section
      className={visualIntentClassName(
        props.visualIntent,
        'rounded-lg border bg-card p-[var(--ui-card-padding)]'
      )}
    >
      {props.title ? <h2 className="mb-3 text-lg font-semibold">{props.title}</h2> : null}
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-[16rem] flex-1">
          <Search className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground" />
          <input
            aria-label={props.searchPlaceholder ?? 'Search'}
            className="h-ui w-full rounded-md border border-input bg-background pr-3 pl-9 text-sm outline-none"
            placeholder={props.searchPlaceholder ?? 'Search'}
            readOnly
          />
        </label>
        {props.filters.map((filter) => (
          <button
            className="inline-flex h-ui items-center rounded-md border border-border bg-background px-3 text-sm hover:bg-accent"
            key={filter.value}
            type="button"
          >
            {filter.label}
          </button>
        ))}
        {props.actions?.map((action) => (
          <AppActionControl
            action={action}
            className="inline-flex h-ui items-center rounded-md bg-primary px-ui-button text-primary-foreground text-sm font-medium hover:bg-primary/90"
            key={action.id}
          />
        ))}
      </div>
    </section>
  );
}
