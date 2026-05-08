import type { BaseComponentProps } from '@json-render/react';
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

type CarouselSectionProps = z.infer<(typeof componentPropsSchemas)['CarouselSection']> &
  RenderableAppActionProps;

export function CarouselSection({ props }: BaseComponentProps<CarouselSectionProps>) {
  const itemActions = props.items.map((item) =>
    findActionForLabel(props.actions, item.title, item.href)
  );
  const extraActions = excludeRenderedActions(props.actions, itemActions);

  return (
    <SectionShell
      bodyClassName="space-y-[var(--ui-section-gap)]"
      description={props.description}
      title={props.title}
      visualIntent={props.visualIntent}
    >
      <div className="-mx-2 flex snap-x gap-4 overflow-x-auto px-2 pb-3">
        {props.items.map((item, index) => {
          const action = itemActions[index];
          return (
            <article
              className="min-w-[15rem] max-w-[17rem] snap-start overflow-hidden rounded-md border border-border/70 bg-background/95"
              key={`${item.title}-${item.href ?? ''}`}
            >
              {item.image ? (
                <img
                  alt={item.image.alt}
                  className="aspect-[16/9] w-full object-cover"
                  decoding="async"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  src={item.image.src}
                />
              ) : null}
              <div className="p-4">
                {item.badge ? (
                  <div className="mb-2 inline-flex rounded-sm bg-secondary px-2 py-1 text-secondary-foreground text-xs">
                    {item.badge}
                  </div>
                ) : null}
                <h3 className="font-medium text-foreground">{item.title}</h3>
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
      <AppActionList actions={extraActions} className="mt-0" />
    </SectionShell>
  );
}
