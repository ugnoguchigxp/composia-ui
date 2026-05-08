import type { BaseComponentProps } from '@json-render/react';
import { Check } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import type { z } from 'zod';
import { cn } from '../../../../lib/utils';
import type { componentPropsSchemas } from '../../services/catalog.service';
import { AppActionList } from '../AppActionControl';
import { formatDisplayMetadata } from './display-metadata';
import { SectionShell } from './SectionShell';

type StepperSectionProps = z.infer<(typeof componentPropsSchemas)['StepperSection']>;

function resolveStepState(
  step: StepperSectionProps['steps'][number],
  index: number,
  activeIndex: number
): 'completed' | 'current' | 'upcoming' {
  if (step.status) return step.status;
  if (index < activeIndex) return 'completed';
  if (index === activeIndex) return 'current';
  return 'upcoming';
}

function renderStepCircle(
  state: 'completed' | 'current' | 'upcoming',
  index: number,
  disabled?: boolean
): ReactNode {
  return (
    <div
      className={cn(
        'flex h-[var(--ui-step-circle-size)] w-[var(--ui-step-circle-size)] flex-shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors',
        state === 'completed' && 'border-success bg-success text-primary-foreground',
        state === 'current' && 'border-primary bg-primary text-primary-foreground',
        state === 'upcoming' && 'border-border bg-background text-muted-foreground',
        disabled && 'opacity-50'
      )}
    >
      {state === 'completed' ? <Check className="h-4 w-4" /> : index + 1}
    </div>
  );
}

export function StepperSection({ props }: BaseComponentProps<StepperSectionProps>) {
  const initialActiveStepId = useMemo(() => {
    if (props.steps.length === 0) return '';
    if (props.activeStepId) {
      const found = props.steps.find((step) => step.id === props.activeStepId);
      if (found) return found.id;
    }
    const currentByStatus = props.steps.find((step) => step.status === 'current');
    return currentByStatus?.id ?? props.steps[0]?.id ?? '';
  }, [props.activeStepId, props.steps]);
  const [activeStepId, setActiveStepId] = useState(initialActiveStepId);
  useEffect(() => {
    setActiveStepId(initialActiveStepId);
  }, [initialActiveStepId]);

  const activeIndex = useMemo(() => {
    const found = props.steps.findIndex((step) => step.id === activeStepId);
    return found >= 0 ? found : 0;
  }, [activeStepId, props.steps]);

  if (props.steps.length === 0) {
    return (
      <SectionShell
        bodyClassName="space-y-[var(--ui-section-gap)]"
        description={props.description}
        title={props.title}
        visualIntent={props.visualIntent}
      >
        <p className="text-muted-foreground text-sm">No steps</p>
        <AppActionList actions={props.actions} className="mt-0" />
      </SectionShell>
    );
  }

  const orientation = props.orientation ?? 'horizontal';
  const variant = props.variant ?? 'split';
  const compactOnMobile = props.compactOnMobile ?? true;
  const inlineContentOnVerticalMobile = props.inlineContentOnVerticalMobile ?? true;
  const activeStep = props.steps[activeIndex];
  const activeStepMeta = activeStep ? formatDisplayMetadata(activeStep.meta) : undefined;

  return (
    <SectionShell
      bodyClassName="space-y-[var(--ui-section-gap)]"
      description={props.description}
      title={props.title}
      visualIntent={props.visualIntent}
    >
      {orientation === 'vertical' ? (
        <div
          className={cn(
            'grid gap-4',
            variant === 'accordion' ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-[208px_1fr]'
          )}
        >
          <ol className="flex flex-col">
            {props.steps.map((step, index) => {
              const state = resolveStepState(step, index, activeIndex);
              const isLast = index === props.steps.length - 1;
              const isActive = index === activeIndex;
              const meta = formatDisplayMetadata(step.meta);

              return (
                <li className="flex flex-col" key={step.id}>
                  <div className="flex items-start gap-2">
                    <div className="flex flex-col items-center">
                      <button
                        aria-current={isActive ? 'step' : undefined}
                        className="cursor-pointer"
                        disabled={step.disabled}
                        onClick={() => setActiveStepId(step.id)}
                        type="button"
                      >
                        {renderStepCircle(state, index, step.disabled)}
                      </button>
                      {!isLast ? (
                        <div
                          className={cn(
                            'mt-2 w-0.5 flex-1',
                            state === 'completed' ? 'bg-success' : 'bg-border'
                          )}
                          style={{ minHeight: variant === 'accordion' && isActive ? 32 : 16 }}
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1 pb-3">
                      <div
                        className={cn(
                          'text-sm font-semibold',
                          step.disabled ? 'text-muted-foreground/50' : 'text-foreground'
                        )}
                      >
                        {step.title}
                      </div>
                      {step.description ? (
                        <div className="mt-0.5 text-muted-foreground text-xs">
                          {step.description}
                        </div>
                      ) : null}
                      {meta ? (
                        <div className="mt-0.5 text-muted-foreground text-xs">{meta}</div>
                      ) : null}
                    </div>
                  </div>

                  {inlineContentOnVerticalMobile && isActive && variant !== 'split' ? (
                    <div className="w-full pb-6 pl-9 sm:hidden">
                      {activeStep ? (
                        <div className="rounded-lg border border-border/70 bg-background/95 p-3">
                          {activeStep.description ? (
                            <p className="text-muted-foreground text-sm leading-6">
                              {activeStep.description}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>

          {variant === 'split' && activeStep ? (
            <div className="hidden sm:block">
              <div className="rounded-lg border border-border/70 bg-background/95 p-4">
                <h3 className="font-semibold text-foreground">{activeStep.title}</h3>
                {activeStep.description ? (
                  <p className="mt-2 text-muted-foreground text-sm leading-6">
                    {activeStep.description}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {compactOnMobile ? (
            <div className="text-muted-foreground text-sm sm:hidden">
              {activeIndex + 1} / {props.steps.length}
            </div>
          ) : null}
          <ol
            className={cn(
              'flex items-center gap-2 overflow-x-auto rounded-md border border-border/70 bg-muted/30 p-2',
              compactOnMobile && 'sm:overflow-visible'
            )}
          >
            {props.steps.map((step, index) => {
              const state = resolveStepState(step, index, activeIndex);
              const isLast = index === props.steps.length - 1;

              const isActive = index === activeIndex;
              return (
                <li
                  className={cn(
                    'flex flex-shrink-0 items-center gap-2',
                    compactOnMobile ? 'min-w-[44px] sm:min-w-[126px]' : 'min-w-[126px]'
                  )}
                  key={step.id}
                >
                  <button
                    aria-current={isActive ? 'step' : undefined}
                    className="cursor-pointer"
                    disabled={step.disabled}
                    onClick={() => setActiveStepId(step.id)}
                    type="button"
                  >
                    {renderStepCircle(state, index, step.disabled)}
                  </button>
                  <span className="truncate text-xs font-semibold">{step.title}</span>
                  {!isLast ? <span className="text-muted-foreground/70">/</span> : null}
                </li>
              );
            })}
          </ol>

          {activeStep ? (
            <div className="rounded-lg border border-border/70 bg-background/95 p-4">
              <h3 className="font-semibold text-foreground">{activeStep.title}</h3>
              {activeStep.description ? (
                <p className="mt-2 text-muted-foreground text-sm leading-6">
                  {activeStep.description}
                </p>
              ) : null}
              {activeStepMeta ? (
                <div className="mt-2 text-muted-foreground text-xs">{activeStepMeta}</div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      <AppActionList actions={props.actions} className="mt-0" />
    </SectionShell>
  );
}
