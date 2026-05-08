import type { BaseComponentProps } from '@json-render/react';
import { Clock3, Sun, Thermometer, Volume2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { z } from 'zod';
import { cn } from '../../../../lib/utils';
import type { componentPropsSchemas } from '../../services/catalog.service';
import { AppActionList } from '../AppActionControl';
import { SectionShell } from './SectionShell';

type ControlPanelSectionProps = z.infer<(typeof componentPropsSchemas)['ControlPanelSection']>;

const controlIconByName = {
  sun: Sun,
  thermometer: Thermometer,
  volume: Volume2,
  timer: Clock3,
} as const;

export function ControlPanelSection({ props }: BaseComponentProps<ControlPanelSectionProps>) {
  const [enabled, setEnabled] = useState(props.enabled ?? true);
  const [activeModeId, setActiveModeId] = useState(props.activeModeId ?? props.modes[0]?.id ?? '');
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(props.controls.map((control) => [control.id, control.value]))
  );

  const controls = useMemo(
    () =>
      props.controls.map((control) => ({
        ...control,
        liveValue: values[control.id] ?? control.value,
      })),
    [props.controls, values]
  );

  return (
    <SectionShell
      bodyClassName="space-y-[var(--ui-section-gap)]"
      description={props.description}
      title={props.title}
      visualIntent={props.visualIntent}
      headerExtra={
        <button
          aria-label="Toggle controls"
          aria-pressed={enabled}
          className={cn(
            'relative inline-flex h-9 w-16 items-center rounded-full border border-border/70 transition-colors',
            enabled ? 'bg-muted/80' : 'bg-background'
          )}
          onClick={() => setEnabled((prev) => !prev)}
          type="button"
        >
          <span
            className={cn(
              'inline-block h-7 w-7 rounded-full bg-foreground shadow transition-transform',
              enabled ? 'translate-x-8' : 'translate-x-1'
            )}
          />
        </button>
      }
    >
      {props.modes.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {props.modes.map((mode) => (
            <button
              className={cn(
                'inline-flex h-ui items-center rounded-md border px-ui-button text-sm font-medium transition-colors',
                activeModeId === mode.id
                  ? 'border-border bg-muted/60 text-foreground'
                  : 'border-border/70 bg-background/75 text-muted-foreground hover:bg-muted/40'
              )}
              key={mode.id}
              onClick={() => setActiveModeId(mode.id)}
              type="button"
            >
              {mode.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="space-y-3">
        {controls.map((control) => {
          const Icon = controlIconByName[control.icon];
          return (
            <div
              className={cn(
                'grid grid-cols-[minmax(0,1fr)_minmax(12rem,1fr)] items-center gap-3 rounded-md border border-border/70 bg-background/95 px-4 py-3',
                !enabled && 'opacity-55'
              )}
              key={control.id}
            >
              <div className="flex min-w-0 items-center gap-3">
                <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                <span className="truncate font-medium text-lg">{control.label}</span>
              </div>
              <input
                className="w-full accent-foreground"
                disabled={!enabled}
                max={control.max}
                min={control.min}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [control.id]: Number(event.target.value),
                  }))
                }
                step={control.step}
                type="range"
                value={control.liveValue}
              />
            </div>
          );
        })}
      </div>
      <AppActionList actions={props.actions} className="mt-0" />
    </SectionShell>
  );
}
