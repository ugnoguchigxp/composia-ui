import type { BaseComponentProps } from '@json-render/react';
import type { z } from 'zod';
import { cn } from '../../../../lib/utils';
import type { componentPropsSchemas } from '../../services/catalog.service';
import { AppActionList } from '../AppActionControl';
import { SectionShell } from './SectionShell';

type CheckoutSummarySectionProps = z.infer<
  (typeof componentPropsSchemas)['CheckoutSummarySection']
>;

export function CheckoutSummarySection({ props }: BaseComponentProps<CheckoutSummarySectionProps>) {
  return (
    <SectionShell
      bodyClassName="space-y-[var(--ui-section-gap)]"
      description={props.description}
      title={props.title}
      visualIntent={props.visualIntent}
    >
      <div className="rounded-md border border-border/70 bg-background/95">
        {props.lines.map((line) => (
          <div
            className="flex items-center justify-between border-border/70 border-b px-ui py-ui last:border-b-0"
            key={line.label}
          >
            <div
              className={cn('text-sm', line.emphasize ? 'font-semibold' : 'text-muted-foreground')}
            >
              {line.label}
            </div>
            <div
              className={cn('text-sm', line.emphasize ? 'font-semibold text-lg' : 'font-medium')}
            >
              {String(line.value)}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          className="inline-flex h-ui items-center rounded-md bg-primary px-ui-button text-primary-foreground text-sm font-medium"
          type="button"
        >
          {props.primaryActionLabel}
        </button>
        <button
          className="inline-flex h-ui items-center rounded-md border border-border/70 bg-background px-ui-button text-sm font-medium"
          type="button"
        >
          {props.secondaryActionLabel}
        </button>
      </div>
      <AppActionList actions={props.actions} className="mt-0" />
    </SectionShell>
  );
}
