import type { BaseComponentProps } from '@json-render/react';
import { CalendarDays } from 'lucide-react';
import type { z } from 'zod';
import type { componentPropsSchemas } from '../../services/catalog.service';
import { AppActionList } from '../AppActionControl';
import { SectionShell } from './SectionShell';

type CalendarSectionProps = z.infer<(typeof componentPropsSchemas)['CalendarSection']>;

export function CalendarSection({ props }: BaseComponentProps<CalendarSectionProps>) {
  return (
    <SectionShell
      bodyClassName="space-y-[var(--ui-section-gap)]"
      description={props.description}
      title={props.title}
      visualIntent={props.visualIntent}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary">
          <CalendarDays className="h-5 w-5 text-secondary-foreground" />
        </div>
      </div>
      <ol className="grid gap-3">
        {props.events.map((event) => (
          <li
            className="grid gap-3 rounded-md border border-border/70 bg-background/95 p-4 sm:grid-cols-[9rem_minmax(0,1fr)]"
            key={`${event.date}-${event.title}`}
          >
            <div>
              <div className="font-medium text-sm">{event.date}</div>
              {event.time ? (
                <div className="mt-1 text-muted-foreground text-xs">{event.time}</div>
              ) : null}
            </div>
            <div>
              <h3 className="font-medium">{event.title}</h3>
              {event.description ? (
                <p className="mt-1 text-muted-foreground text-sm leading-6">{event.description}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      <AppActionList actions={props.actions} className="mt-0" />
    </SectionShell>
  );
}
