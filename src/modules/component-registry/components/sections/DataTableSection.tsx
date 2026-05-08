import type { BaseComponentProps } from '@json-render/react';
import type { z } from 'zod';
import { isDatabaseSystemColumnName } from '../../../../../shared/schemas/database-design.schema';
import type { componentPropsSchemas } from '../../services/catalog.service';
import { AppActionList } from '../AppActionControl';
import { SectionShell } from './SectionShell';

type DataTableProps = z.infer<(typeof componentPropsSchemas)['DataTableSection']>;

export function DataTableSection({ props }: BaseComponentProps<DataTableProps>) {
  const rows = props.rows ?? [];
  const columns = props.columns.filter((column) => !isDatabaseSystemColumnName(column.key));

  return (
    <SectionShell
      bodyClassName="space-y-[var(--ui-section-gap)]"
      description={props.description}
      title={props.title}
      visualIntent={props.visualIntent}
    >
      <div className="overflow-x-auto rounded-md border border-border/70 bg-background/95">
        <table className="w-full min-w-[560px] border-collapse text-left text-sm">
          <thead className="bg-muted/70 text-muted-foreground">
            <tr>
              {columns.map((column) => (
                <th
                  className="px-ui py-ui font-semibold tracking-wide text-[11px] uppercase"
                  key={column.key}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr
                className="border-t border-border/70 odd:bg-background even:bg-muted/20 hover:bg-accent/20"
                key={String(row.id ?? rowIndex)}
              >
                {columns.map((column) => (
                  <td className="px-ui py-ui text-foreground" key={column.key}>
                    {String(row[column.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <AppActionList actions={props.actions} className="mt-0" />
    </SectionShell>
  );
}
