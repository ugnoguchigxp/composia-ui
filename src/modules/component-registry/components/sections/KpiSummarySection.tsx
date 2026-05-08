import type { BaseComponentProps } from '@json-render/react';
import type { z } from 'zod';
import type { componentPropsSchemas } from '../../services/catalog.service';
import { AppActionList } from '../AppActionControl';
import { SectionShell } from './SectionShell';

type KpiSummaryProps = z.infer<(typeof componentPropsSchemas)['KpiSummarySection']>;

export function KpiSummarySection({ props }: BaseComponentProps<KpiSummaryProps>) {
  return (
    <SectionShell
      bodyClassName="space-y-[var(--ui-section-gap)]"
      title={props.title}
      visualIntent={props.visualIntent}
    >
      <div className="grid gap-3 md:grid-cols-3">
        {props.items.map((item) => (
          <article
            className="rounded-md border border-border/70 bg-background/95 p-4"
            key={item.label}
          >
            <div className="text-sm text-muted-foreground">{item.label}</div>
            <div className="mt-2 text-2xl font-semibold text-foreground">{item.value}</div>
            {item.description ? (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
            ) : null}
          </article>
        ))}
      </div>
      <AppActionList actions={props.actions} className="mt-0" />
    </SectionShell>
  );
}
