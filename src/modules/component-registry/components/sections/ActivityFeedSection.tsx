import type { BaseComponentProps } from '@json-render/react';
import type { z } from 'zod';
import { cn } from '../../../../lib/utils';
import type { componentPropsSchemas } from '../../services/catalog.service';
import { AppActionList } from '../AppActionControl';
import { SectionShell } from './SectionShell';

type ActivityFeedSectionProps = z.infer<(typeof componentPropsSchemas)['ActivityFeedSection']>;

const statusDot = {
  neutral: 'bg-muted-foreground',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-destructive',
} as const;

export function ActivityFeedSection({ props }: BaseComponentProps<ActivityFeedSectionProps>) {
  return (
    <SectionShell
      bodyClassName="space-y-[var(--ui-section-gap)]"
      description={props.description}
      title={props.title}
      visualIntent={props.visualIntent}
    >
      <div className="space-y-2">
        {props.items.map((item, index) => (
          <article
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 rounded-md border border-border/70 bg-background/95 px-ui py-ui"
            key={`${item.actor}-${item.timestamp}-${index}`}
          >
            <span className={cn('mt-1 h-2.5 w-2.5 rounded-full', statusDot[item.status])} />
            <div className="min-w-0">
              <p className="text-sm">
                <span className="font-medium">{item.actor}</span> {item.action}{' '}
                <span className="font-medium">{item.target}</span>
              </p>
            </div>
            <time className="text-muted-foreground text-xs">{item.timestamp}</time>
          </article>
        ))}
      </div>
      <AppActionList actions={props.actions} className="mt-0" />
    </SectionShell>
  );
}
