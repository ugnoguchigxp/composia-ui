import type { BaseComponentProps } from '@json-render/react';
import type { z } from 'zod';
import type { componentPropsSchemas } from '../../services/catalog.service';
import { visualIntentClassName } from '../../services/visual-intent.service';

type ErrorStateProps = z.infer<(typeof componentPropsSchemas)['ErrorState']>;

export function ErrorState({ props }: BaseComponentProps<ErrorStateProps>) {
  return (
    <section
      className={visualIntentClassName(
        { ...props.visualIntent, tone: props.visualIntent?.tone ?? 'danger' },
        'rounded-lg border p-[var(--ui-card-padding)]'
      )}
      role="alert"
    >
      <h2 className="text-lg font-semibold">{props.title}</h2>
      {props.description ? (
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{props.description}</p>
      ) : null}
    </section>
  );
}
