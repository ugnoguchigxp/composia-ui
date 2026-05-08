import type { BaseComponentProps } from '@json-render/react';
import type { z } from 'zod';
import { cn } from '../../../../lib/utils';
import type { componentPropsSchemas } from '../../services/catalog.service';
import { AppActionList } from '../AppActionControl';
import { SectionShell } from './SectionShell';

type StatsTrendCardsSectionProps = z.infer<
  (typeof componentPropsSchemas)['StatsTrendCardsSection']
>;

const toneClass = {
  neutral: 'bg-muted/50 text-muted-foreground',
  primary: 'bg-primary/15 text-primary',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-destructive/15 text-destructive',
} as const;

export function StatsTrendCardsSection({ props }: BaseComponentProps<StatsTrendCardsSectionProps>) {
  return (
    <SectionShell
      bodyClassName="space-y-[var(--ui-section-gap)]"
      description={props.description}
      title={props.title}
      visualIntent={props.visualIntent}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {props.cards.map((card) => (
          <article
            className="rounded-md border border-border/70 bg-background/95 p-4"
            key={card.label}
          >
            <div className="text-muted-foreground text-xs uppercase tracking-wide">
              {card.label}
            </div>
            <div className="mt-2 font-semibold text-2xl">{String(card.value)}</div>
            <div className="mt-2 flex items-center gap-2">
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-medium',
                  toneClass[card.deltaTone]
                )}
              >
                {card.delta}
              </span>
              <span className="text-muted-foreground text-xs">{card.period}</span>
            </div>
          </article>
        ))}
      </div>
      <AppActionList actions={props.actions} className="mt-0" />
    </SectionShell>
  );
}
