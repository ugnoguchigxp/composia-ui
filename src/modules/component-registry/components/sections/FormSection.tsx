import type { BaseComponentProps } from '@json-render/react';
import type { z } from 'zod';
import type { componentPropsSchemas } from '../../services/catalog.service';
import { visualIntentClassName } from '../../services/visual-intent.service';
import {
  AppActionControl,
  AppActionList,
  excludeRenderedActions,
  findActionForLabel,
  type RenderableAppActionProps,
} from '../AppActionControl';

type FormSectionProps = z.infer<(typeof componentPropsSchemas)['FormSection']> &
  RenderableAppActionProps;

export function FormSection({ props }: BaseComponentProps<FormSectionProps>) {
  const secondaryAction = findActionForLabel(
    props.actions,
    props.secondaryAction?.label,
    props.secondaryAction?.href
  );
  const extraActions = excludeRenderedActions(props.actions, [secondaryAction]);

  return (
    <section className={visualIntentClassName(props.visualIntent, 'rounded-lg border p-5')}>
      <div className="mb-5">
        <h2 className="text-lg font-semibold">{props.title}</h2>
        {props.description ? (
          <p className="mt-1 text-muted-foreground text-sm leading-6">{props.description}</p>
        ) : null}
      </div>
      <form className="grid gap-4 md:grid-cols-2">
        {props.fields.map((field) => (
          <div
            className={field.type === 'textarea' ? 'grid gap-2 md:col-span-2' : 'grid gap-2'}
            key={field.name}
          >
            <span className="font-medium text-sm">
              {field.label}
              {field.required ? <span className="text-destructive"> *</span> : null}
            </span>
            <FormField field={field} />
          </div>
        ))}
        <div className="flex flex-wrap gap-3 pt-2 md:col-span-2">
          <button
            className="inline-flex h-ui items-center rounded-md bg-primary px-ui-button text-primary-foreground text-sm font-medium"
            type="button"
          >
            {props.submitLabel ?? 'Submit'}
          </button>
          <AppActionControl
            action={secondaryAction}
            className="inline-flex h-ui items-center rounded-md border border-border bg-background px-ui-button text-sm font-medium hover:bg-accent"
            fallbackHref={props.secondaryAction?.href}
            fallbackLabel={props.secondaryAction?.label}
          />
          <AppActionList actions={extraActions} className="mt-0" />
        </div>
      </form>
    </section>
  );
}

function FormField({ field }: { field: FormSectionProps['fields'][number] }) {
  const commonClass =
    'h-ui rounded-md border border-input bg-background px-3 text-sm outline-none disabled:opacity-100';

  if (field.type === 'textarea') {
    return (
      <textarea
        aria-label={field.label}
        className="min-h-28 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none"
        placeholder={field.placeholder}
        readOnly
        value={String(field.value ?? '')}
      />
    );
  }

  if (field.type === 'select') {
    return (
      <select
        aria-label={field.label}
        className={commonClass}
        disabled
        value={String(field.value ?? '')}
      >
        {(field.options ?? []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === 'checkbox') {
    return (
      <input
        aria-label={field.label}
        checked={Boolean(field.value)}
        className="h-5 w-5 rounded border-input"
        disabled
        type="checkbox"
      />
    );
  }

  return (
    <input
      aria-label={field.label}
      className={commonClass}
      placeholder={field.placeholder}
      readOnly
      type={field.type}
      value={String(field.value ?? '')}
    />
  );
}
