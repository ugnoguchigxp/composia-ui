import type { BaseComponentProps } from '@json-render/react';
import type { z } from 'zod';
import { isDatabaseSystemColumnName } from '../../../../../shared/schemas/database-design.schema';
import type { componentPropsSchemas } from '../../services/catalog.service';
import { visualIntentClassName } from '../../services/visual-intent.service';
import { AppActionList } from '../AppActionControl';

type DataTableProps = z.infer<(typeof componentPropsSchemas)['DataTableSection']>;

export function DataTableSection({ props }: BaseComponentProps<DataTableProps>) {
  const rows = props.rows ?? [];
  const columns = props.columns.filter((column) => !isDatabaseSystemColumnName(column.key));

  return (
    <section
      className={visualIntentClassName(
        props.visualIntent,
        'overflow-hidden rounded-lg border p-[var(--ui-card-padding)]'
      )}
    >
      <div className="mb-4">
        <h2 className="text-lg font-semibold">{props.title}</h2>
        {props.description ? (
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{props.description}</p>
        ) : null}
      </div>
      <div className="overflow-x-auto rounded-md border border-border bg-background">
        <table className="w-full min-w-[560px] border-collapse text-left text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              {columns.map((column) => (
                <th className="px-ui py-ui font-medium" key={column.key}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr className="border-t border-border" key={String(row.id ?? rowIndex)}>
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
      <AppActionList actions={props.actions} />
    </section>
  );
}
