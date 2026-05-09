import type { BaseComponentProps } from '@json-render/react';
import { Search } from 'lucide-react';
import type { z } from 'zod';
import type { componentPropsSchemas } from '../../services/catalog.service';
import {
  AppActionControl,
  findActionForLabel,
  type RenderableAppActionProps,
} from '../AppActionControl';
import { formatDisplayMetadata } from './display-metadata';
import { SectionShell } from './SectionShell';

type MainSearchNavigationSectionProps = z.infer<
  (typeof componentPropsSchemas)['MainSearchNavigationSection']
> &
  RenderableAppActionProps;

export function MainSearchNavigationSection({
  props,
}: BaseComponentProps<MainSearchNavigationSectionProps>) {
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
        {props.links.length > 0 ? (
          <nav
            aria-label={`${props.title ?? 'Main'} navigation`}
            className="rounded-md border border-border/70 bg-muted/50 px-1.5 py-1"
          >
            <div className="flex flex-wrap gap-1">
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
        ) : null}
      </div>
      {props.results.length > 0 ? (
        <section aria-label={props.resultsTitle} className="grid gap-3">
          <h3 className="font-semibold text-foreground text-sm">{props.resultsTitle}</h3>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {props.results.map((item) => {
              const meta = formatDisplayMetadata(item.meta);
              const image = item.image ? (
                <img
                  alt={item.image.alt}
                  className="aspect-[4/3] w-full rounded-md border border-border/70 object-cover"
                  decoding="async"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  src={item.image.src}
                />
              ) : null;

              return (
                <article className="grid gap-2" key={`${item.title}-${item.href ?? ''}`}>
                  {item.href ? (
                    <a aria-label={item.title} className="block" href={item.href}>
                      {image}
                    </a>
                  ) : (
                    image
                  )}
                  <div className="grid gap-1">
                    <div className="flex items-start gap-2">
                      {item.href ? (
                        <a
                          className="font-medium text-primary text-sm leading-5 underline-offset-4 hover:underline"
                          href={item.href}
                        >
                          {item.title}
                        </a>
                      ) : (
                        <span className="font-medium text-foreground text-sm leading-5">
                          {item.title}
                        </span>
                      )}
                      {item.badge ? (
                        <span className="rounded-sm bg-secondary px-2 py-0.5 text-secondary-foreground text-xs">
                          {item.badge}
                        </span>
                      ) : null}
                    </div>
                    {meta ? <p className="text-muted-foreground text-xs">{meta}</p> : null}
                    {item.description ? (
                      <p className="line-clamp-2 text-muted-foreground text-sm leading-5">
                        {item.description}
                      </p>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
    </SectionShell>
  );
}
