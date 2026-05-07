import type { BaseComponentProps } from '@json-render/react';
import type { z } from 'zod';
import type { componentPropsSchemas } from '../../services/catalog.service';
import { visualIntentClassName } from '../../services/visual-intent.service';
import { AppActionList } from '../AppActionControl';
import { formatDisplayMetadata } from './display-metadata';

type MasterDetailSectionProps = z.infer<(typeof componentPropsSchemas)['MasterDetailSection']>;

export function MasterDetailSection({ props }: BaseComponentProps<MasterDetailSectionProps>) {
  return (
    <section
      className={visualIntentClassName(
        props.visualIntent,
        'overflow-hidden rounded-lg border bg-card'
      )}
    >
      <div className="border-border border-b p-5">
        <h2 className="text-lg font-semibold">{props.title}</h2>
        {props.description ? (
          <p className="mt-1 text-muted-foreground text-sm leading-6">{props.description}</p>
        ) : null}
      </div>
      <div className="grid min-h-[24rem] md:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="border-border border-b md:border-r md:border-b-0">
          {props.items.map((item, index) => {
            const meta = formatDisplayMetadata(item.meta);
            return (
              <article
                className={
                  index === 0
                    ? 'border-primary border-l-4 bg-primary/5 p-4'
                    : 'border-border border-t p-4'
                }
                key={item.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-medium text-sm">{item.title}</h3>
                  {item.status ? (
                    <span className="rounded-sm bg-secondary px-2 py-1 text-secondary-foreground text-xs">
                      {item.status}
                    </span>
                  ) : null}
                </div>
                {meta ? <div className="mt-1 text-muted-foreground text-xs">{meta}</div> : null}
                {item.description ? (
                  <p className="mt-2 line-clamp-2 text-muted-foreground text-sm leading-6">
                    {item.description}
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
        <article className="p-5">
          <h3 className="text-xl font-semibold">{props.detail.title}</h3>
          {props.detail.description ? (
            <p className="mt-2 text-muted-foreground text-sm leading-6">
              {props.detail.description}
            </p>
          ) : null}
          {props.detail.fields.length > 0 ? (
            <dl className="mt-5 grid gap-3 sm:grid-cols-2">
              {props.detail.fields.map((field) => (
                <div
                  className="rounded-md border border-border bg-background p-3"
                  key={field.label}
                >
                  <dt className="text-muted-foreground text-xs">{field.label}</dt>
                  <dd className="mt-1 font-medium text-foreground">{String(field.value)}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </article>
      </div>
      <AppActionList actions={props.actions} className="mx-5 mb-5" />
    </section>
  );
}
