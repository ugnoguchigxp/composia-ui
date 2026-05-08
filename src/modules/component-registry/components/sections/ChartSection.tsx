import type { BaseComponentProps } from '@json-render/react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { z } from 'zod';
import type { componentPropsSchemas } from '../../services/catalog.service';
import { visualIntentClassName } from '../../services/visual-intent.service';
import { AppActionList } from '../AppActionControl';

type ChartSectionProps = z.infer<(typeof componentPropsSchemas)['ChartSection']>;

const chartColors = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
];

const chartHeight = {
  sm: 220,
  md: 300,
  lg: 380,
} satisfies Record<ChartSectionProps['height'], number>;

function hasSecondarySeries(data: ChartSectionProps['data']) {
  return data.some((item) => typeof item.secondaryValue === 'number');
}

function renderChart(props: ChartSectionProps) {
  const data = props.data ?? [];
  const height = chartHeight[props.height ?? 'md'];
  const secondarySeries = hasSecondarySeries(data);
  const showLegend = props.showLegend && (secondarySeries || props.chartType === 'pie');

  if (data.length === 0) {
    return (
      <div className="flex min-h-[220px] items-center justify-center rounded-md border border-dashed border-border bg-background text-sm text-muted-foreground">
        No chart data
      </div>
    );
  }

  if (props.chartType === 'pie') {
    return (
      <ResponsiveContainer height={height} width="100%">
        <PieChart>
          <Tooltip />
          {showLegend ? <Legend /> : null}
          <Pie data={data} dataKey="value" nameKey="label" outerRadius="74%" label>
            {data.map((item, index) => (
              <Cell fill={chartColors[index % chartColors.length]} key={item.label} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (props.chartType === 'radar') {
    return (
      <ResponsiveContainer height={height} width="100%">
        <RadarChart data={data}>
          <PolarGrid stroke="var(--color-border)" />
          <PolarAngleAxis dataKey="label" tick={{ fill: 'var(--color-muted-foreground)' }} />
          <PolarRadiusAxis tick={{ fill: 'var(--color-muted-foreground)' }} />
          <Tooltip />
          {showLegend ? <Legend /> : null}
          <Radar
            dataKey="value"
            fill={chartColors[0]}
            fillOpacity={0.24}
            name={props.valueLabel}
            stroke={chartColors[0]}
          />
          {secondarySeries ? (
            <Radar
              dataKey="secondaryValue"
              fill={chartColors[1]}
              fillOpacity={0.14}
              name={props.secondaryValueLabel ?? 'Secondary'}
              stroke={chartColors[1]}
            />
          ) : null}
        </RadarChart>
      </ResponsiveContainer>
    );
  }

  const commonCartesianProps = (
    <>
      <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
      <XAxis dataKey="label" tick={{ fill: 'var(--color-muted-foreground)' }} />
      <YAxis tick={{ fill: 'var(--color-muted-foreground)' }} />
      <Tooltip />
      {showLegend ? <Legend /> : null}
    </>
  );

  if (props.chartType === 'line') {
    return (
      <ResponsiveContainer height={height} width="100%">
        <LineChart data={data}>
          {commonCartesianProps}
          <Line dataKey="value" name={props.valueLabel} stroke={chartColors[0]} strokeWidth={2} />
          {secondarySeries ? (
            <Line
              dataKey="secondaryValue"
              name={props.secondaryValueLabel ?? 'Secondary'}
              stroke={chartColors[1]}
              strokeWidth={2}
            />
          ) : null}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (props.chartType === 'area') {
    return (
      <ResponsiveContainer height={height} width="100%">
        <AreaChart data={data}>
          {commonCartesianProps}
          <Area
            dataKey="value"
            fill={chartColors[0]}
            fillOpacity={0.18}
            name={props.valueLabel}
            stroke={chartColors[0]}
          />
          {secondarySeries ? (
            <Area
              dataKey="secondaryValue"
              fill={chartColors[1]}
              fillOpacity={0.12}
              name={props.secondaryValueLabel ?? 'Secondary'}
              stroke={chartColors[1]}
            />
          ) : null}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer height={height} width="100%">
      <BarChart data={data}>
        {commonCartesianProps}
        <Bar dataKey="value" fill={chartColors[0]} name={props.valueLabel} radius={[4, 4, 0, 0]} />
        {secondarySeries ? (
          <Bar
            dataKey="secondaryValue"
            fill={chartColors[1]}
            name={props.secondaryValueLabel ?? 'Secondary'}
            radius={[4, 4, 0, 0]}
          />
        ) : null}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ChartSection({ props }: BaseComponentProps<ChartSectionProps>) {
  return (
    <section
      className={visualIntentClassName(
        props.visualIntent,
        'rounded-lg border p-[var(--ui-card-padding)]'
      )}
    >
      <div className="mb-4">
        <h2 className="text-lg font-semibold">{props.title}</h2>
        {props.description ? (
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{props.description}</p>
        ) : null}
      </div>
      <div className="rounded-md border border-border bg-background p-3">{renderChart(props)}</div>
      <AppActionList actions={props.actions} />
    </section>
  );
}
