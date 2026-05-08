import type { BaseComponentProps } from '@json-render/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { z } from 'zod';
import { cn } from '../../../../lib/utils';
import type { componentPropsSchemas } from '../../services/catalog.service';
import { AppActionList } from '../AppActionControl';
import { SectionShell } from './SectionShell';

type ScheduleSectionProps = z.infer<(typeof componentPropsSchemas)['ScheduleSection']>;

export function ScheduleSection({ props }: BaseComponentProps<ScheduleSectionProps>) {
  const weekDays = props.weekDays ?? ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const days = props.days ?? [];
  const selectedDay = props.selectedDay ?? 1;

  return (
    <SectionShell
      bodyClassName="space-y-[var(--ui-section-gap)]"
      description={props.description}
      title={props.title}
      visualIntent={props.visualIntent}
    >
      <div className="rounded-md border border-border/70 bg-background/95 p-4">
        <div className="mb-4 flex items-center justify-between">
          <button
            aria-label="Previous month"
            className="inline-flex h-ui w-ui items-center justify-center rounded-md border border-border/70 bg-muted/40"
            type="button"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h3 className="text-lg font-semibold">{props.monthLabel}</h3>
          <button
            aria-label="Next month"
            className="inline-flex h-ui w-ui items-center justify-center rounded-md border border-border/70 bg-muted/40"
            type="button"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-2 text-center">
          {weekDays.map((day) => (
            <div className="py-2 text-muted-foreground text-sm" key={day}>
              {day}
            </div>
          ))}
          {days.map((day, index) => (
            <div
              className={cn(
                'flex h-11 items-center justify-center rounded-md text-sm',
                day === selectedDay
                  ? 'bg-muted text-foreground font-semibold'
                  : 'text-foreground/90',
                index < 7 || index >= 35 ? 'text-muted-foreground' : undefined
              )}
              key={`${day}-${index}`}
            >
              {day}
            </div>
          ))}
        </div>
      </div>
      {props.entries.length > 0 ? (
        <div className="rounded-md border border-border/70 bg-background/95">
          {props.entries.map((entry) => (
            <div
              className="flex items-center justify-between border-border/70 border-b px-ui py-ui last:border-b-0"
              key={`${entry.date}-${entry.title}`}
            >
              <div>
                <div className="font-medium text-sm">{entry.title}</div>
                <div className="text-muted-foreground text-xs">{entry.date}</div>
              </div>
              <div className="text-right">
                <div className="font-semibold text-sm">{String(entry.amount)}</div>
                <div className="text-muted-foreground text-xs uppercase">{entry.status}</div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <AppActionList actions={props.actions} className="mt-0" />
    </SectionShell>
  );
}
