import type { BaseComponentProps } from '@json-render/react';
import type { z } from 'zod';
import type { componentPropsSchemas } from '../../services/catalog.service';
import { visualIntentClassName } from '../../services/visual-intent.service';
import { AppActionList } from '../AppActionControl';

type KpiSummaryProps = z.infer<(typeof componentPropsSchemas)['KpiSummarySection']>;

export function KpiSummarySection({ props }: BaseComponentProps<KpiSummaryProps>) {
  return (
    <section
      className={visualIntentClassName(
        props.visualIntent,
        'rounded-lg border p-[var(--ui-card-padding)]'
      )}
    >
      {props.title ? <h2 className="mb-4 text-lg font-semibold">{props.title}</h2> : null}
      <div className="grid gap-3 md:grid-cols-3">
        {props.items.map((item) => (
          <article className="rounded-md border border-border bg-background p-4" key={item.label}>
            <div className="text-sm text-muted-foreground">{item.label}</div>
            <div className="mt-2 text-2xl font-semibold text-foreground">{item.value}</div>
            {item.description ? (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
            ) : null}
          </article>
        ))}
      </div>
      <AppActionList actions={props.actions} />
    </section>
  );
}
