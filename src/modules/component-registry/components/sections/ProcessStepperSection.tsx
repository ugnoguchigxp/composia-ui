import type { BaseComponentProps } from '@json-render/react';
import { CheckCircle2, Circle, Dot } from 'lucide-react';
import type { z } from 'zod';
import { cn } from '../../../../lib/utils';
import type { componentPropsSchemas } from '../../services/catalog.service';
import { visualIntentClassName } from '../../services/visual-intent.service';
import { AppActionList } from '../AppActionControl';

type ProcessStepperSectionProps = z.infer<(typeof componentPropsSchemas)['ProcessStepperSection']>;

export function ProcessStepperSection({ props }: BaseComponentProps<ProcessStepperSectionProps>) {
  return (
    <section
      className={visualIntentClassName(
        props.visualIntent,
        'rounded-lg border p-[var(--ui-card-padding)]'
      )}
    >
      <div className="mb-5">
        <h2 className="text-lg font-semibold">{props.title}</h2>
        {props.description ? (
          <p className="mt-1 text-muted-foreground text-sm leading-6">{props.description}</p>
        ) : null}
      </div>
      <ol className="grid gap-3 md:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]">
        {props.steps.map((step, index) => {
          const status = step.status ?? (index === 0 ? 'current' : 'upcoming');
          return (
            <li
              className={cn(
                'rounded-md border border-border bg-background p-4',
                status === 'current' && 'border-primary/50 bg-primary/5'
              )}
              key={`${step.title}-${index}`}
            >
              <div className="flex items-center gap-2">
                {status === 'completed' ? (
                  <CheckCircle2 className="h-4 w-4 text-success" />
                ) : status === 'current' ? (
                  <Dot className="h-5 w-5 text-primary" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="text-muted-foreground text-xs">Step {index + 1}</span>
              </div>
              <h3 className="mt-3 font-medium text-foreground">{step.title}</h3>
              {step.description ? (
                <p className="mt-2 text-muted-foreground text-sm leading-6">{step.description}</p>
              ) : null}
            </li>
          );
        })}
      </ol>
      <AppActionList actions={props.actions} />
    </section>
  );
}
