import type { BaseComponentProps } from '@json-render/react';
import type { z } from 'zod';
import type { componentPropsSchemas } from '../../services/catalog.service';
import { AppActionList } from '../AppActionControl';
import { SectionShell } from './SectionShell';

type ComparisonSectionProps = z.infer<(typeof componentPropsSchemas)['ComparisonSection']>;

export function ComparisonSection({ props }: BaseComponentProps<ComparisonSectionProps>) {
  return (
    <SectionShell
      bodyClassName="space-y-[var(--ui-section-gap)]"
      description={props.description}
      title={props.title}
      visualIntent={props.visualIntent}
    >
      <div className="grid gap-4 md:grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]">
        {props.columns.map((column) => (
          <article
            className="rounded-md border border-border/70 bg-background/95 p-4"
            key={column.title}
          >
            <h3 className="font-semibold">{column.title}</h3>
            {column.description ? (
              <p className="mt-1 text-muted-foreground text-sm leading-6">{column.description}</p>
            ) : null}
            <dl className="mt-4 grid gap-3">
              {column.items.map((item) => (
                <div className="border-border border-t pt-3" key={item.label}>
                  <dt className="text-muted-foreground text-xs">{item.label}</dt>
                  <dd className="mt-1 font-medium">{String(item.value)}</dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
      <AppActionList actions={props.actions} className="mt-0" />
    </SectionShell>
  );
}
