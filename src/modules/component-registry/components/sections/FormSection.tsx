import type { BaseComponentProps } from '@json-render/react';
import { type FormEvent, useEffect, useState } from 'react';
import type { z } from 'zod';
import type { componentPropsSchemas } from '../../services/catalog.service';
import {
  AppActionControl,
  AppActionList,
  excludeRenderedActions,
  findActionForLabel,
  type RenderableAppActionProps,
  useAppActionRenderContext,
} from '../AppActionControl';
import { SectionShell } from './SectionShell';

type FormSectionProps = z.infer<(typeof componentPropsSchemas)['FormSection']> &
  RenderableAppActionProps;

export function FormSection({ props }: BaseComponentProps<FormSectionProps>) {
  const { onSubmitBinding, pendingBindingId } = useAppActionRenderContext();
  const secondaryAction = findActionForLabel(
    props.actions,
    props.secondaryAction?.label,
    props.secondaryAction?.href
  );
  const extraActions = excludeRenderedActions(props.actions, [secondaryAction]);
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    valuesFromFields(props.fields)
  );
  const isSubmitting = Boolean(props.dataBindingId && pendingBindingId === props.dataBindingId);
  const canSubmit = !props.dataBindingId || Boolean(onSubmitBinding && !isSubmitting);

  useEffect(() => {
    setValues(valuesFromFields(props.fields));
  }, [props.fields]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!props.dataBindingId || !onSubmitBinding) return;
    const payload = Object.fromEntries(
      props.fields.flatMap((field) => {
        const value = values[field.name];
        if ((value === '' || value === undefined) && !field.required) return [];
        return [[field.name, field.type === 'checkbox' ? Boolean(value) : value]];
      })
    );
    onSubmitBinding(props.dataBindingId, payload);
  };

  return (
    <SectionShell
      bodyClassName="space-y-[var(--ui-section-gap)]"
      description={props.description}
      title={props.title}
      visualIntent={props.visualIntent}
    >
      <form
        className="grid gap-4 rounded-md border border-border/70 bg-muted/15 p-4 md:grid-cols-2"
        onSubmit={handleSubmit}
      >
        {props.fields.map((field) => (
          <div
            className={field.type === 'textarea' ? 'grid gap-2 md:col-span-2' : 'grid gap-2'}
            key={field.name}
          >
            <span className="font-medium text-sm text-foreground/90">
              {field.label}
              {field.required ? <span className="text-destructive"> *</span> : null}
            </span>
            <FormField
              field={field}
              onChange={(value) => setValues((current) => ({ ...current, [field.name]: value }))}
              value={values[field.name]}
            />
          </div>
        ))}
        <div className="mt-1 flex flex-wrap gap-3 border-t border-border/70 pt-3 md:col-span-2">
          <button
            className="inline-flex h-ui items-center rounded-md bg-primary px-ui-button text-primary-foreground text-sm font-medium shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!canSubmit}
            type="submit"
          >
            {isSubmitting ? '保存中...' : (props.submitLabel ?? 'Submit')}
          </button>
          <AppActionControl
            action={secondaryAction}
            className="inline-flex h-ui items-center rounded-md border border-border bg-background px-ui-button text-sm font-medium hover:bg-accent/70"
            fallbackHref={props.secondaryAction?.href}
            fallbackLabel={props.secondaryAction?.label}
          />
          <AppActionList actions={extraActions} className="mt-0" />
        </div>
      </form>
    </SectionShell>
  );
}

function valuesFromFields(fields: FormSectionProps['fields']) {
  return Object.fromEntries(
    fields.map((field) => [field.name, field.value ?? (field.type === 'checkbox' ? false : '')])
  );
}

function FormField({
  field,
  onChange,
  value,
}: {
  field: FormSectionProps['fields'][number];
  onChange: (value: unknown) => void;
  value: unknown;
}) {
  const commonClass =
    'h-ui rounded-md border border-input/80 bg-background/95 px-ui text-sm outline-none focus:ring-2 focus:ring-ring/30';

  if (field.type === 'textarea') {
    return (
      <textarea
        aria-label={field.label}
        className="min-h-28 rounded-md border border-input/80 bg-background/95 px-ui py-ui text-sm outline-none focus:ring-2 focus:ring-ring/30"
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.placeholder}
        value={String(value ?? '')}
      />
    );
  }

  if (field.type === 'select') {
    return (
      <select
        aria-label={field.label}
        className={commonClass}
        onChange={(event) => onChange(event.target.value)}
        value={String(value ?? '')}
      >
        <option value="">Select</option>
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
        checked={Boolean(value)}
        className="h-5 w-5 rounded border-input"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
    );
  }

  return (
    <input
      aria-label={field.label}
      className={commonClass}
      onChange={(event) => onChange(event.target.value)}
      placeholder={field.placeholder}
      type={field.type}
      value={String(value ?? '')}
    />
  );
}
