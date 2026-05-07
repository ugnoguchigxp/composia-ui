import type { BaseComponentProps } from '@json-render/react';
import type { z } from 'zod';
import type { componentPropsSchemas } from '../../services/catalog.service';
import { visualIntentClassName } from '../../services/visual-intent.service';
import {
  AppActionControl,
  findActionForLabel,
  type RenderableAppActionProps,
} from '../AppActionControl';

type EmptyStateProps = z.infer<(typeof componentPropsSchemas)['EmptyState']> &
  RenderableAppActionProps;

export function EmptyState({ props }: BaseComponentProps<EmptyStateProps>) {
  const primaryAction = findActionForLabel(props.actions, props.action?.label, props.action?.href);

  return (
    <section
      className={visualIntentClassName(
        props.visualIntent,
        'rounded-lg border p-[var(--ui-card-padding)] text-center'
      )}
    >
      <h2 className="text-lg font-semibold">{props.title}</h2>
      {props.description ? (
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          {props.description}
        </p>
      ) : null}
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <AppActionControl
          action={primaryAction}
          className="inline-flex h-ui items-center rounded-md bg-primary px-ui-button text-sm font-medium text-primary-foreground"
          fallbackHref={props.action?.href}
          fallbackLabel={props.action?.label}
        />
        {props.actions
          ?.filter((action) => action.id !== primaryAction?.id)
          .map((action) => (
            <AppActionControl
              action={action}
              className="inline-flex h-ui items-center rounded-md border border-border bg-background px-ui-button text-sm font-medium hover:bg-accent"
              key={action.id}
            />
          ))}
      </div>
    </section>
  );
}
