import type { BaseComponentProps } from '@json-render/react';
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { z } from 'zod';
import type { componentPropsSchemas } from '../../services/catalog.service';
import { AppActionList } from '../AppActionControl';
import { SectionShell } from './SectionShell';

type ChartInsightSectionProps = z.infer<(typeof componentPropsSchemas)['ChartInsightSection']>;

const chartColors = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
];

function renderChart(props: ChartInsightSectionProps) {
  if (props.data.length === 0) {
    return (
      <div className="flex min-h-[220px] items-center justify-center rounded-md border border-dashed border-border/70 bg-background/95 text-sm text-muted-foreground">
        No chart data
      </div>
    );
  }

  if (props.chartType === 'pie') {
    return (
      <ResponsiveContainer height={260} width="100%">
        <PieChart>
          <Tooltip />
          <Pie data={props.data} dataKey="value" nameKey="label" outerRadius="74%" label>
            {props.data.map((item, index) => (
              <Cell fill={chartColors[index % chartColors.length]} key={item.label} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer height={260} width="100%">
      <BarChart data={props.data}>
        <XAxis dataKey="label" tick={{ fill: 'var(--color-muted-foreground)' }} />
        <YAxis tick={{ fill: 'var(--color-muted-foreground)' }} />
        <Tooltip />
        <Bar dataKey="value" fill={chartColors[0]} name={props.valueLabel} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ChartInsightSection({ props }: BaseComponentProps<ChartInsightSectionProps>) {
  return (
    <SectionShell
      bodyClassName="space-y-[var(--ui-section-gap)]"
      description={props.description}
      title={props.title}
      visualIntent={props.visualIntent}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.9fr)]">
        <div className="rounded-md border border-border/70 bg-background/95 p-3">
          {renderChart(props)}
        </div>
        <div className="space-y-3">
          {props.insights.map((insight) => (
            <article
              className="rounded-md border border-border/70 bg-background/95 p-3"
              key={insight.title}
            >
              <h3 className="font-semibold text-sm">{insight.title}</h3>
              <p className="mt-1 text-muted-foreground text-sm leading-6">{insight.body}</p>
            </article>
          ))}
        </div>
      </div>
      <AppActionList actions={props.actions} className="mt-0" />
    </SectionShell>
  );
}
