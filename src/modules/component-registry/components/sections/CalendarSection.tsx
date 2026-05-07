import type { BaseComponentProps } from '@json-render/react';
import { CalendarDays } from 'lucide-react';
import type { z } from 'zod';
import type { componentPropsSchemas } from '../../services/catalog.service';
import { visualIntentClassName } from '../../services/visual-intent.service';
import { AppActionList } from '../AppActionControl';

type CalendarSectionProps = z.infer<(typeof componentPropsSchemas)['CalendarSection']>;

export function CalendarSection({ props }: BaseComponentProps<CalendarSectionProps>) {
  return (
    <section className={visualIntentClassName(props.visualIntent, 'rounded-lg border p-5')}>
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary">
          <CalendarDays className="h-5 w-5 text-secondary-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">{props.title}</h2>
          {props.description ? (
            <p className="mt-1 text-muted-foreground text-sm leading-6">{props.description}</p>
          ) : null}
        </div>
      </div>
      <ol className="grid gap-3">
        {props.events.map((event) => (
          <li
            className="grid gap-3 rounded-md border border-border bg-background p-4 sm:grid-cols-[9rem_minmax(0,1fr)]"
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
      <AppActionList actions={props.actions} />
    </section>
  );
}
