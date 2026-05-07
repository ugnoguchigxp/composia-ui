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

type ActionFooterSectionProps = z.infer<(typeof componentPropsSchemas)['ActionFooterSection']> &
  RenderableAppActionProps;

export function ActionFooterSection({ props }: BaseComponentProps<ActionFooterSectionProps>) {
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
        'sticky bottom-4 z-10 rounded-lg border bg-card/95 p-4 shadow-lg backdrop-blur'
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          {props.title ? <h2 className="font-semibold">{props.title}</h2> : null}
          {props.description ? (
            <p className="mt-1 text-muted-foreground text-sm leading-6">{props.description}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-3">
          <AppActionControl
            action={secondaryAction}
            className="inline-flex h-ui items-center rounded-md border border-border bg-background px-ui-button text-sm font-medium hover:bg-accent"
            fallbackHref={props.secondaryAction?.href}
            fallbackLabel={props.secondaryAction?.label}
          />
          <AppActionControl
            action={primaryAction}
            className="inline-flex h-ui items-center rounded-md bg-primary px-ui-button text-primary-foreground text-sm font-medium hover:bg-primary/90"
            fallbackHref={props.primaryAction?.href}
            fallbackLabel={props.primaryAction?.label}
          />
        </div>
      </div>
      <AppActionList actions={extraActions} className="mt-4" />
    </section>
  );
}
