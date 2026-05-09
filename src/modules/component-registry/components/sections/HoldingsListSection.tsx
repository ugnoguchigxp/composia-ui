import type { BaseComponentProps } from '@json-render/react';
import { Search } from 'lucide-react';
import type { z } from 'zod';
import { cn } from '../../../../lib/utils';
import type { componentPropsSchemas } from '../../services/catalog.service';
import { AppActionList } from '../AppActionControl';
import { SectionShell } from './SectionShell';

type HoldingsListSectionProps = z.infer<(typeof componentPropsSchemas)['HoldingsListSection']>;

export function HoldingsListSection({ props }: BaseComponentProps<HoldingsListSectionProps>) {
  const inferredTabs = [
    ...new Set(props.holdings.map((holding) => holding.category).filter(Boolean)),
  ];
  const tabs = props.tabs.length > 0 ? props.tabs : inferredTabs;
  const activeTab = props.activeTab ?? tabs[0];

  return (
    <SectionShell bodyClassName="space-y-[var(--ui-section-gap)]" visualIntent={props.visualIntent}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <label className="relative block min-w-0 flex-1">
          <Search className="-translate-y-1/2 absolute top-1/2 left-3 h-5 w-5 text-muted-foreground" />
          <input
            aria-label={props.searchPlaceholder}
            className="h-section-control w-full rounded-md border border-input/80 bg-background/95 pr-3 pl-11 text-sm outline-none"
            placeholder={props.searchPlaceholder}
            readOnly
          />
        </label>
        {tabs.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {tabs.map((tab) => (
              <button
                className={cn(
                  'inline-flex h-ui items-center rounded-md border px-ui-button text-sm font-medium',
                  tab === activeTab
                    ? 'border-border bg-muted/60 text-foreground'
                    : 'border-border/70 bg-background/70 text-muted-foreground'
                )}
                key={tab}
                type="button"
              >
                {tab}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="space-y-3">
        {props.holdings.map((holding) => (
          <article
            className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-4 rounded-md border border-border/70 bg-background/95 px-4 py-4"
            key={`${holding.ticker}-${holding.name}`}
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-md border border-border/70 bg-muted/20 font-semibold text-4 leading-none">
              {holding.ticker}
            </div>
            <div className="min-w-0">
              <h3 className="truncate font-semibold text-lg">{holding.name}</h3>
              <p className="truncate text-muted-foreground text-sm uppercase tracking-wide">
                {holding.quantityLabel} · {holding.acquiredLabel}
              </p>
            </div>
            <div className="text-right">
              <div className="mb-1 inline-flex rounded-full border border-border/70 px-2 py-0.5 text-xs">
                {holding.category}
              </div>
              <div className="text-muted-foreground text-xs uppercase tracking-wide">Value</div>
              <div className="font-semibold text-2xl leading-none">{String(holding.value)}</div>
            </div>
          </article>
        ))}
      </div>
      <AppActionList actions={props.actions} className="mt-0" />
    </SectionShell>
  );
}
