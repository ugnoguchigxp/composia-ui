import type { BaseComponentProps } from '@json-render/react';
import {
  BarChart3,
  Database,
  DollarSign,
  Download,
  FileText,
  Package,
  Play,
  RefreshCw,
  Settings,
  Shield,
  Users,
} from 'lucide-react';
import type { z } from 'zod';
import type { componentPropsSchemas } from '../../services/catalog.service';
import { AppActionList } from '../AppActionControl';
import { SectionShell } from './SectionShell';

type QuickActionsSectionProps = z.infer<(typeof componentPropsSchemas)['QuickActionsSection']>;

const iconMap = {
  play: Play,
  download: Download,
  'refresh-cw': RefreshCw,
  settings: Settings,
  shield: Shield,
  users: Users,
  database: Database,
  'file-text': FileText,
  'bar-chart': BarChart3,
  package: Package,
  'dollar-sign': DollarSign,
} as const;

export function QuickActionsSection({ props }: BaseComponentProps<QuickActionsSectionProps>) {
  return (
    <SectionShell
      bodyClassName="space-y-[var(--ui-section-gap)]"
      description={props.description}
      title={props.title}
      visualIntent={props.visualIntent}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {props.items.map((item) => {
          const Icon = iconMap[item.icon];
          return (
            <button
              className="rounded-md border border-border/70 bg-background/95 p-4 text-left transition hover:bg-muted/30"
              key={item.id}
              type="button"
            >
              <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-md border border-border/70 bg-muted/40">
                <Icon className="h-4 w-4" />
              </div>
              <div className="font-medium text-sm">{item.label}</div>
              {item.description ? (
                <p className="mt-1 text-muted-foreground text-sm leading-6">{item.description}</p>
              ) : null}
            </button>
          );
        })}
      </div>
      <AppActionList actions={props.actions} className="mt-0" />
    </SectionShell>
  );
}
