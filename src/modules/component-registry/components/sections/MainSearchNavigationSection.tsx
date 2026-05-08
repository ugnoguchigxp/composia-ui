import type { BaseComponentProps } from '@json-render/react';
import { Search } from 'lucide-react';
import type { z } from 'zod';
import type { componentPropsSchemas } from '../../services/catalog.service';
import { visualIntentClassName } from '../../services/visual-intent.service';
import {
  AppActionControl,
  findActionForLabel,
  type RenderableAppActionProps,
} from '../AppActionControl';

type MainSearchNavigationSectionProps = z.infer<
  (typeof componentPropsSchemas)['MainSearchNavigationSection']
> &
  RenderableAppActionProps;

export function MainSearchNavigationSection({
  props,
}: BaseComponentProps<MainSearchNavigationSectionProps>) {
  return (
    <section
      className={visualIntentClassName(
        props.visualIntent,
        'border-border border-y bg-card text-card-foreground'
      )}
    >
      <div className="mx-auto grid max-w-7xl gap-3 px-3 py-3 md:px-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          {props.title ? (
            <div className="shrink-0 font-semibold text-base leading-6">{props.title}</div>
          ) : null}
          <div className="flex min-w-0 flex-1 rounded-md border border-input bg-background shadow-sm focus-within:ring-2 focus-within:ring-ring">
            {props.categories.length > 0 ? (
              <select
                aria-label="検索カテゴリ"
                className="h-11 max-w-[9.5rem] shrink-0 rounded-l-md border-border border-r bg-muted px-2 text-muted-foreground text-sm outline-none"
                defaultValue={props.categories[0]?.value}
              >
                {props.categories.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
            ) : null}
            <label className="relative min-w-0 flex-1">
              <Search className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground" />
              <input
                aria-label={props.searchPlaceholder}
                className="h-11 w-full bg-transparent pr-3 pl-9 text-sm outline-none"
                placeholder={props.searchPlaceholder}
                readOnly
              />
            </label>
            <button
              className="h-11 shrink-0 rounded-r-md bg-primary px-4 font-medium text-primary-foreground text-sm hover:bg-primary/90"
              type="button"
            >
              {props.searchButtonLabel}
            </button>
          </div>
        </div>
        <nav aria-label={`${props.title ?? 'Main'} navigation`} className="overflow-x-auto">
          <div className="flex min-w-max gap-1">
            {props.links.map((link) => {
              const action = findActionForLabel(props.actions, link.label, link.href);
              return (
                <AppActionControl
                  action={action}
                  className="inline-flex h-9 shrink-0 items-center border-transparent border-b-2 px-3 text-muted-foreground text-sm font-medium hover:border-border hover:text-foreground"
                  fallbackHref={link.href}
                  fallbackLabel={link.label}
                  key={action?.id ?? link.href}
                />
              );
            })}
          </div>
        </nav>
      </div>
    </section>
  );
}
