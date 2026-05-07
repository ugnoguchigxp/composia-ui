import type { BaseComponentProps } from '@json-render/react';
import type { z } from 'zod';
import type { componentPropsSchemas } from '../../services/catalog.service';
import { visualIntentClassName } from '../../services/visual-intent.service';
import { AppActionList } from '../AppActionControl';

type TimelineProps = z.infer<(typeof componentPropsSchemas)['TimelineSection']>;

export function TimelineSection({ props }: BaseComponentProps<TimelineProps>) {
  return (
    <section
      className={visualIntentClassName(
        props.visualIntent,
        'rounded-lg border p-[var(--ui-card-padding)]'
      )}
    >
      <h2 className="text-lg font-semibold">{props.title}</h2>
      <ol className="mt-5 space-y-4">
        {props.items.map((item) => (
          <li className="border-l border-border pl-4" key={`${item.title}:${item.timestamp ?? ''}`}>
            <div className="text-sm font-medium">{item.title}</div>
            {item.timestamp ? (
              <time className="mt-1 block text-xs text-muted-foreground">{item.timestamp}</time>
            ) : null}
            {item.description ? (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
            ) : null}
          </li>
        ))}
      </ol>
      <AppActionList actions={props.actions} />
    </section>
  );
}
