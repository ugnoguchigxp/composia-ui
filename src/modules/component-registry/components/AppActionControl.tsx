import { createContext, type ReactNode, useContext } from 'react';
import type { AppAction } from '../../../../shared/schemas/ui-schema.schema';
import { cn } from '../../../lib/utils';

export type RenderableAppActionProps = {
  actions?: AppAction[];
  dataBindingId?: string;
};

type AppActionContextValue = {
  onAction?: (action: AppAction) => void;
  onSubmitBinding?: (dataBindingId: string, value: Record<string, unknown>) => void;
  pendingBindingId?: string | null;
  pendingActionId?: string | null;
};

const AppActionRenderContext = createContext<AppActionContextValue>({});

export function AppActionRenderProvider({
  children,
  onAction,
  pendingActionId,
  pendingBindingId,
  onSubmitBinding,
}: AppActionContextValue & { children: ReactNode }) {
  return (
    <AppActionRenderContext.Provider
      value={{ onAction, onSubmitBinding, pendingActionId, pendingBindingId }}
    >
      {children}
    </AppActionRenderContext.Provider>
  );
}

export function useAppActionRenderContext() {
  return useContext(AppActionRenderContext);
}

type AppActionControlProps = {
  action?: AppAction;
  className?: string;
  fallbackHref?: string;
  fallbackLabel?: string;
};

type AppActionListProps = {
  actions?: AppAction[];
  className?: string;
  itemClassName?: string;
};

const defaultActionClassName =
  'inline-flex h-ui items-center rounded-md border border-border bg-background px-ui-button text-sm font-medium hover:bg-accent';

export function findActionForLabel(
  actions: AppAction[] | undefined,
  label?: string,
  href?: string
) {
  if (!actions?.length) return undefined;
  return (
    actions.find((action) => action.label === label) ??
    actions.find((action) => action.target === href)
  );
}

export function excludeRenderedActions(
  actions: AppAction[] | undefined,
  renderedActions: Array<AppAction | undefined>
) {
  const renderedIds = new Set(renderedActions.map((action) => action?.id).filter(Boolean));
  return actions?.filter((action) => !renderedIds.has(action.id));
}

export function AppActionControl({
  action,
  className,
  fallbackHref,
  fallbackLabel,
}: AppActionControlProps) {
  const { onAction, pendingActionId } = useContext(AppActionRenderContext);
  const label = action?.label ?? fallbackLabel;
  if (!label) return null;

  if (action?.kind === 'generate-screen' && onAction) {
    return (
      <button
        className={cn(className, 'disabled:cursor-not-allowed disabled:opacity-60')}
        disabled={pendingActionId === action.id}
        onClick={() => onAction(action)}
        type="button"
      >
        {pendingActionId === action.id ? '処理中...' : label}
      </button>
    );
  }

  if (action?.kind === 'navigate' && action.target) {
    return (
      <a className={className} href={action.target}>
        {label}
      </a>
    );
  }

  if (action?.kind === 'submit') {
    return (
      <button className={className} type="button">
        {label}
      </button>
    );
  }

  if (fallbackHref) {
    return (
      <a className={className} href={fallbackHref}>
        {label}
      </a>
    );
  }

  return null;
}

export function AppActionList({
  actions,
  className,
  itemClassName = defaultActionClassName,
}: AppActionListProps) {
  if (!actions?.length) return null;

  return (
    <div className={cn('mt-5 flex flex-wrap gap-3', className)}>
      {actions.map((action) => (
        <AppActionControl action={action} className={itemClassName} key={action.id} />
      ))}
    </div>
  );
}
