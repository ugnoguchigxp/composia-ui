import type { BaseComponentProps } from '@json-render/react';
import type { z } from 'zod';
import { cn } from '../../../../lib/utils';
import type { componentPropsSchemas } from '../../services/catalog.service';
import { AppActionList } from '../AppActionControl';
import { SectionShell } from './SectionShell';

type ProgressListSectionProps = z.infer<(typeof componentPropsSchemas)['ProgressListSection']>;
type ProgressTone = NonNullable<ProgressListSectionProps['items'][number]['tone']>;

const progressToneClassName = {
  neutral: 'bg-muted-foreground',
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-destructive',
} satisfies Record<ProgressTone, string>;

function percentage(value: number, max: number) {
  if (max <= 0) return 0;
  return Math.min(Math.max((value / max) * 100, 0), 100);
}

export function ProgressListSection({ props }: BaseComponentProps<ProgressListSectionProps>) {
  return (
    <SectionShell
      bodyClassName="space-y-[var(--ui-section-gap)]"
      description={props.description}
      title={props.title}
      visualIntent={props.visualIntent}
    >
      <div className="divide-y divide-border/70 rounded-md border border-border/70 bg-background/95">
        {props.items.length === 0 ? (
          <div className="px-ui py-ui text-sm text-muted-foreground">No progress data</div>
        ) : (
          props.items.map((item) => {
            const max = item.max ?? 100;
            const progress = percentage(item.value, max);
            const tone = item.tone ?? 'primary';
            return (
              <article className="grid gap-2 px-ui py-3" key={item.label}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <h3 className="font-medium text-sm text-foreground">{item.label}</h3>
                    {item.description ? (
                      <p className="mt-1 text-muted-foreground text-xs leading-5">
                        {item.description}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-muted-foreground text-sm">
                    {item.value} / {max}
                  </div>
                </div>
                <div
                  aria-label={item.label}
                  aria-valuemax={max}
                  aria-valuemin={0}
                  aria-valuenow={item.value}
                  className="h-2 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                >
                  <div
                    className={cn('h-full rounded-full', progressToneClassName[tone])}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </article>
            );
          })
        )}
      </div>
      <AppActionList actions={props.actions} className="mt-0" />
    </SectionShell>
  );
}
