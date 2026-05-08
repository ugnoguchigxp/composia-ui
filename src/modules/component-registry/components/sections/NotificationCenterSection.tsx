import type { BaseComponentProps } from '@json-render/react';
import { Bell } from 'lucide-react';
import type { z } from 'zod';
import { cn } from '../../../../lib/utils';
import type { componentPropsSchemas } from '../../services/catalog.service';
import { AppActionList } from '../AppActionControl';
import { SectionShell } from './SectionShell';

type NotificationCenterSectionProps = z.infer<
  (typeof componentPropsSchemas)['NotificationCenterSection']
>;

const levelClass = {
  info: 'bg-primary/15 text-primary',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-destructive/15 text-destructive',
} as const;

export function NotificationCenterSection({
  props,
}: BaseComponentProps<NotificationCenterSectionProps>) {
  return (
    <SectionShell
      bodyClassName="space-y-[var(--ui-section-gap)]"
      description={props.description}
      title={props.title}
      visualIntent={props.visualIntent}
    >
      <div className="space-y-2">
        {props.items.map((item) => (
          <article
            className={cn(
              'rounded-md border border-border/70 bg-background/95 px-ui py-ui',
              !item.read && 'ring-1 ring-primary/20'
            )}
            key={item.id}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-muted-foreground" />
                  <h3 className="truncate font-medium text-sm">{item.title}</h3>
                  {!item.read ? (
                    <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">
                      NEW
                    </span>
                  ) : null}
                </div>
                {item.body ? (
                  <p className="mt-1 text-muted-foreground text-sm leading-6">{item.body}</p>
                ) : null}
              </div>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-medium',
                  levelClass[item.level]
                )}
              >
                {item.level}
              </span>
            </div>
            {item.timestamp ? (
              <div className="mt-2 text-muted-foreground text-xs">{item.timestamp}</div>
            ) : null}
          </article>
        ))}
      </div>
      <AppActionList actions={props.actions} className="mt-0" />
    </SectionShell>
  );
}
