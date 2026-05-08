import type { ReactNode } from 'react';
import type { VisualIntent } from '../../../../../shared/schemas/visual-intent.schema';
import { cn } from '../../../../lib/utils';
import { visualIntentClassName } from '../../services/visual-intent.service';

type SectionShellProps = {
  bodyClassName?: string;
  children: ReactNode;
  description?: string;
  headerExtra?: ReactNode;
  title?: string;
  visualIntent?: VisualIntent;
};

export function SectionShell({
  bodyClassName,
  children,
  description,
  headerExtra,
  title,
  visualIntent,
}: SectionShellProps) {
  return (
    <section
      className={visualIntentClassName(
        visualIntent,
        'rounded-section border border-border/70 bg-gradient-to-b from-card to-card/85 text-card-foreground shadow-sm ring-1 ring-border/30'
      )}
    >
      {(title || description || headerExtra) && (
        <header className="border-b border-border/60 bg-muted/20 px-section-header py-section-header">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {title ? (
                <h2 className="truncate text-base font-semibold tracking-tight">{title}</h2>
              ) : null}
              {description ? (
                <p className="mt-1 text-sm text-muted-foreground leading-6">{description}</p>
              ) : null}
            </div>
            {headerExtra ? <div className="shrink-0">{headerExtra}</div> : null}
          </div>
        </header>
      )}
      <div className={cn('p-section', bodyClassName)}>{children}</div>
    </section>
  );
}
