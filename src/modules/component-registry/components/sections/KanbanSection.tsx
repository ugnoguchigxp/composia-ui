import type { BaseComponentProps } from '@json-render/react';
import type { z } from 'zod';
import type { componentPropsSchemas } from '../../services/catalog.service';
import { visualIntentClassName } from '../../services/visual-intent.service';
import { AppActionList } from '../AppActionControl';
import { formatDisplayMetadata } from './display-metadata';

type KanbanSectionProps = z.infer<(typeof componentPropsSchemas)['KanbanSection']>;

export function KanbanSection({ props }: BaseComponentProps<KanbanSectionProps>) {
  return (
    <section className={visualIntentClassName(props.visualIntent, 'rounded-lg border p-5')}>
      <div className="mb-5">
        <h2 className="text-lg font-semibold">{props.title}</h2>
        {props.description ? (
          <p className="mt-1 text-muted-foreground text-sm leading-6">{props.description}</p>
        ) : null}
      </div>
      <div className="grid gap-4 overflow-x-auto md:grid-cols-[repeat(auto-fit,minmax(14rem,1fr))]">
        {props.columns.map((column) => (
          <section className="rounded-md border border-border bg-muted/40 p-3" key={column.title}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="font-medium text-sm">{column.title}</h3>
              <span className="text-muted-foreground text-xs">{column.cards.length}</span>
            </div>
            <div className="grid gap-3">
              {column.cards.map((card) => {
                const meta = formatDisplayMetadata(card.meta);
                return (
                  <article
                    className="rounded-md border border-border bg-background p-3"
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
      <AppActionList actions={props.actions} />
    </section>
  );
}
