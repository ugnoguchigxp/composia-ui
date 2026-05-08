import type { BaseComponentProps } from '@json-render/react';
import type { z } from 'zod';
import type { componentPropsSchemas } from '../../services/catalog.service';
import { AppActionList } from '../AppActionControl';
import { SectionShell } from './SectionShell';

type TimelineProps = z.infer<(typeof componentPropsSchemas)['TimelineSection']>;

export function TimelineSection({ props }: BaseComponentProps<TimelineProps>) {
  return (
    <SectionShell
      bodyClassName="space-y-[var(--ui-section-gap)]"
      title={props.title}
      visualIntent={props.visualIntent}
    >
      <ol className="space-y-4">
        {props.items.map((item) => (
          <li
            className="rounded-md border border-border/70 bg-background/95 px-4 py-3"
            key={`${item.title}:${item.timestamp ?? ''}`}
          >
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
      <AppActionList actions={props.actions} className="mt-0" />
    </SectionShell>
  );
}
