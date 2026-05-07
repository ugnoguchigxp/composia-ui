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

type SplitHeroSectionProps = z.infer<(typeof componentPropsSchemas)['SplitHeroSection']> &
  RenderableAppActionProps;

export function SplitHeroSection({ props }: BaseComponentProps<SplitHeroSectionProps>) {
  const primaryAction = findActionForLabel(
    props.actions,
    props.primaryAction?.label,
    props.primaryAction?.href
  );
  const secondaryAction = findActionForLabel(
    props.actions,
    props.secondaryAction?.label,
    props.secondaryAction?.href
  );
  const extraActions = excludeRenderedActions(props.actions, [primaryAction, secondaryAction]);

  return (
    <section
      className={visualIntentClassName(
        props.visualIntent,
        'grid overflow-hidden rounded-lg border bg-card md:grid-cols-[minmax(0,1fr)_minmax(18rem,0.85fr)]'
      )}
    >
      <div className="flex min-h-[22rem] flex-col justify-center p-6 md:p-8">
        {props.eyebrow ? (
          <div className="mb-3 font-medium text-primary text-sm">{props.eyebrow}</div>
        ) : null}
        <h2 className="max-w-2xl text-3xl font-semibold tracking-normal md:text-4xl">
          {props.title}
        </h2>
        {props.description ? (
          <p className="mt-4 max-w-2xl text-base text-muted-foreground leading-7">
            {props.description}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <AppActionControl
            action={primaryAction}
            className="inline-flex h-ui items-center rounded-md bg-primary px-ui-button text-primary-foreground text-sm font-medium hover:bg-primary/90"
            fallbackHref={props.primaryAction?.href}
            fallbackLabel={props.primaryAction?.label}
          />
          <AppActionControl
            action={secondaryAction}
            className="inline-flex h-ui items-center rounded-md border border-border bg-background px-ui-button text-sm font-medium hover:bg-accent"
            fallbackHref={props.secondaryAction?.href}
            fallbackLabel={props.secondaryAction?.label}
          />
        </div>
        <AppActionList actions={extraActions} />
      </div>
      {props.image ? (
        <figure className="min-h-[20rem] border-border border-t bg-muted md:border-t-0 md:border-l">
          <img
            alt={props.image.alt}
            className="h-full w-full object-cover"
            decoding="async"
            loading="lazy"
            referrerPolicy="no-referrer"
            src={props.image.src}
          />
        </figure>
      ) : null}
    </section>
  );
}
