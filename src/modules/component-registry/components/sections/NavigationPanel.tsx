import type { BaseComponentProps } from '@json-render/react';
import type { z } from 'zod';
import type { componentPropsSchemas } from '../../services/catalog.service';
import { visualIntentClassName } from '../../services/visual-intent.service';
import {
  AppActionControl,
  findActionForLabel,
  type RenderableAppActionProps,
} from '../AppActionControl';

type NavigationPanelProps = z.infer<(typeof componentPropsSchemas)['NavigationPanel']> &
  RenderableAppActionProps;

export function NavigationPanel({ props }: BaseComponentProps<NavigationPanelProps>) {
  return (
    <nav
      className={visualIntentClassName(
        props.visualIntent,
        'rounded-lg border p-[var(--ui-card-padding)]'
      )}
    >
      <h2 className="text-lg font-semibold">{props.title}</h2>
      <div className="mt-4 flex flex-wrap gap-3">
        {props.links.map((link) => {
          const action = findActionForLabel(props.actions, link.label, link.href);
          return (
            <AppActionControl
              action={action}
              className="inline-flex h-ui items-center rounded-md border border-border bg-background px-ui-button text-sm font-medium hover:bg-accent"
              fallbackHref={link.href}
              fallbackLabel={link.label}
              key={action?.id ?? link.href}
            />
          );
        })}
        {props.actions
          ?.filter(
            (action) =>
              !props.links.some(
                (link) => link.label === action.label || link.href === action.target
              )
          )
          .map((action) => (
            <AppActionControl
              action={action}
              className="inline-flex h-ui items-center rounded-md border border-border bg-background px-ui-button text-sm font-medium hover:bg-accent"
              key={action.id}
            />
          ))}
      </div>
    </nav>
  );
}
