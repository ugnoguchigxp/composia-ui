import type { BaseComponentProps } from '@json-render/react';
import type { z } from 'zod';
import type { componentPropsSchemas } from '../../services/catalog.service';
import { visualIntentClassName } from '../../services/visual-intent.service';
import {
  AppActionControl,
  AppActionList,
  excludeRenderedActions,
  findActionForLabel,
  type RenderableAppActionProps,
} from '../AppActionControl';

type CardGridSectionProps = z.infer<(typeof componentPropsSchemas)['CardGridSection']> &
  RenderableAppActionProps;

export function CardGridSection({ props }: BaseComponentProps<CardGridSectionProps>) {
  const itemActions = props.items.map((item) =>
    findActionForLabel(props.actions, item.title, item.href)
  );
  const extraActions = excludeRenderedActions(props.actions, itemActions);

  return (
    <section className={visualIntentClassName(props.visualIntent, 'rounded-lg border p-5')}>
      <div className="mb-5">
        <h2 className="text-lg font-semibold">{props.title}</h2>
        {props.description ? (
          <p className="mt-1 text-muted-foreground text-sm leading-6">{props.description}</p>
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {props.items.map((item, index) => {
          const action = itemActions[index];
          return (
            <article
              className="overflow-hidden rounded-md border border-border bg-background"
              key={`${item.title}-${item.href ?? ''}`}
            >
              {item.image ? (
                <img
                  alt={item.image.alt}
                  className="h-36 w-full object-cover"
                  decoding="async"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  src={item.image.src}
                />
              ) : null}
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-medium text-foreground">{item.title}</h3>
                  {item.badge ? (
                    <span className="rounded-sm bg-secondary px-2 py-1 text-secondary-foreground text-xs">
                      {item.badge}
                    </span>
                  ) : null}
                </div>
                {item.meta ? (
                  <div className="mt-1 text-muted-foreground text-xs">{item.meta}</div>
                ) : null}
                {item.description ? (
                  <p className="mt-2 line-clamp-3 text-muted-foreground text-sm leading-6">
                    {item.description}
                  </p>
                ) : null}
                <AppActionControl
                  action={action}
                  className="mt-4 inline-flex h-8 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-accent"
                  fallbackHref={item.href}
                  fallbackLabel={item.href ? item.title : undefined}
                />
              </div>
            </article>
          );
        })}
      </div>
      <AppActionList actions={extraActions} />
    </section>
  );
}
