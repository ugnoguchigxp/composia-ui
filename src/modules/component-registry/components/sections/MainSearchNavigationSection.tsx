import type { BaseComponentProps } from '@json-render/react';
import { Search } from 'lucide-react';
import type { z } from 'zod';
import type { componentPropsSchemas } from '../../services/catalog.service';
import {
  AppActionControl,
  AppActionList,
  excludeRenderedActions,
  findActionForLabel,
  type RenderableAppActionProps,
} from '../AppActionControl';
import { SectionShell } from './SectionShell';

type MainSearchNavigationSectionProps = z.infer<
  (typeof componentPropsSchemas)['MainSearchNavigationSection']
> &
  RenderableAppActionProps;

export function MainSearchNavigationSection({
  props,
}: BaseComponentProps<MainSearchNavigationSectionProps>) {
  const linkActions = props.links.map((link) =>
    findActionForLabel(props.actions, link.label, link.href)
  );
  const extraActions = excludeRenderedActions(props.actions, linkActions);

  return (
    <SectionShell
      bodyClassName="grid gap-section"
      title={props.title}
      visualIntent={props.visualIntent}
    >
      <div className="flex flex-col gap-section">
        <div className="flex min-w-0 flex-col gap-section lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-1 overflow-hidden rounded-md border border-input/80 bg-background/95 shadow-sm focus-within:ring-2 focus-within:ring-ring">
            {props.categories.length > 0 ? (
              <select
                aria-label="検索カテゴリ"
                className="h-section-control max-w-[10rem] shrink-0 border-border/80 border-r bg-muted/70 px-ui text-muted-foreground text-sm outline-none"
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
                className="h-section-control w-full min-w-0 bg-transparent pr-3 pl-9 text-sm outline-none"
                placeholder={props.searchPlaceholder}
                readOnly
              />
            </label>
            <button
              className="h-section-control shrink-0 border-l border-primary/60 bg-primary px-ui-button font-medium text-primary-foreground text-sm hover:bg-primary/90"
              type="button"
            >
              {props.searchButtonLabel}
            </button>
          </div>
        </div>
        <nav
          aria-label={`${props.title ?? 'Main'} navigation`}
          className="overflow-x-auto rounded-md border border-border/70 bg-muted/50 px-1.5 py-1"
        >
          <div className="flex min-w-max gap-1">
            {props.links.map((link) => {
              const action = findActionForLabel(props.actions, link.label, link.href);
              return (
                <AppActionControl
                  action={action}
                  className="inline-flex h-9 shrink-0 items-center rounded-md border-transparent border-b-2 px-3 text-muted-foreground text-sm font-medium hover:border-border hover:bg-background hover:text-foreground data-[selected=true]:border-primary data-[selected=true]:bg-background data-[selected=true]:text-foreground"
                  fallbackHref={link.href}
                  fallbackLabel={link.label}
                  key={action?.id ?? link.href}
                />
              );
            })}
          </div>
        </nav>
      </div>
      <AppActionList actions={extraActions} className="mt-1" />
    </SectionShell>
  );
}
