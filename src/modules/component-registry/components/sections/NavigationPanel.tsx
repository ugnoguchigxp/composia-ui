import type { BaseComponentProps } from '@json-render/react';
import type { z } from 'zod';
import type { componentPropsSchemas } from '../../services/catalog.service';
import {
  AppActionControl,
  findActionForLabel,
  type RenderableAppActionProps,
} from '../AppActionControl';

type NavigationPanelProps = z.infer<(typeof componentPropsSchemas)['NavigationPanel']> &
  RenderableAppActionProps;

export function NavigationPanel({ props }: BaseComponentProps<NavigationPanelProps>) {
  const tabClassName =
    'inline-flex h-ui shrink-0 items-center border-transparent border-b-2 px-3 text-muted-foreground text-sm font-medium transition-colors hover:border-border hover:text-foreground';

  return (
    <nav aria-label={props.title} className="border-border border-b pb-1">
      <h2 className="sr-only">{props.title}</h2>
      <div className="flex flex-wrap gap-x-1 gap-y-2">
        {props.links.map((link) => {
          const action = findActionForLabel(props.actions, link.label, link.href);
          return (
            <AppActionControl
              action={action}
              className={tabClassName}
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
            <AppActionControl action={action} className={tabClassName} key={action.id} />
          ))}
      </div>
    </nav>
  );
}
