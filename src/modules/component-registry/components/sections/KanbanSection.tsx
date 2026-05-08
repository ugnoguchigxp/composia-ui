import type { BaseComponentProps } from '@json-render/react';
import type { z } from 'zod';
import type { componentPropsSchemas } from '../../services/catalog.service';
import { AppActionList } from '../AppActionControl';
import { formatDisplayMetadata } from './display-metadata';
import { SectionShell } from './SectionShell';

type KanbanSectionProps = z.infer<(typeof componentPropsSchemas)['KanbanSection']>;

export function KanbanSection({ props }: BaseComponentProps<KanbanSectionProps>) {
  return (
    <SectionShell
      bodyClassName="space-y-[var(--ui-section-gap)]"
      description={props.description}
      title={props.title}
      visualIntent={props.visualIntent}
    >
      <div className="grid gap-4 overflow-x-auto md:grid-cols-[repeat(auto-fit,minmax(14rem,1fr))]">
        {props.columns.map((column) => (
          <section
            className="rounded-md border border-border/70 bg-muted/45 p-3"
            key={column.title}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="font-medium text-sm">{column.title}</h3>
              <span className="text-muted-foreground text-xs">{column.cards.length}</span>
            </div>
            <div className="grid gap-3">
              {column.cards.map((card) => {
                const meta = formatDisplayMetadata(card.meta);
                return (
                  <article
                    className="rounded-md border border-border/70 bg-background/95 p-3"
                    key={card.title}
                  >
                    <h4 className="font-medium text-sm">{card.title}</h4>
                    {card.description ? (
                      <p className="mt-2 text-muted-foreground text-sm leading-6">
                        {card.description}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                      {card.assignee ? <span>{card.assignee}</span> : null}
                      {meta ? <span>{meta}</span> : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <AppActionList actions={props.actions} className="mt-0" />
    </SectionShell>
  );
}
