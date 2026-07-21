import type { Key, ReactNode } from "react";

import { FeedbackState } from "@/components/lonaci/ui/feedback-state";
import { cn } from "@/lib/ui/cn";

export interface DataTableColumn<Row> {
  id: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  align?: "left" | "center" | "right";
  className?: string;
}

export interface DataTableProps<Row> {
  rows: readonly Row[];
  columns: readonly DataTableColumn<Row>[];
  rowKey: (row: Row) => Key;
  caption: string;
  mobileCard?: (row: Row) => ReactNode;
  emptyState?: ReactNode;
  getRowLabel?: (row: Row) => string;
  className?: string;
}

export function DataTable<Row>({
  rows,
  columns,
  rowKey,
  caption,
  mobileCard,
  emptyState,
  getRowLabel,
  className,
}: DataTableProps<Row>) {
  if (rows.length === 0) {
    return (
      <div className={cn("lonaci-ui-table-empty", className)}>
        {emptyState ?? (
          <FeedbackState title="Aucun résultat" description="Aucune donnée ne correspond aux critères actuels." />
        )}
      </div>
    );
  }

  return (
    <div className={cn("lonaci-ui-data-table", className)}>
      <div className={cn("lonaci-ui-table-scroll", mobileCard && "lonaci-ui-table-scroll--has-mobile")}>
        <table>
          <caption className="lonaci-ui-sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.id}
                  scope="col"
                  className={cn(
                    `lonaci-ui-table-cell--${column.align ?? "left"}`,
                    column.className,
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} aria-label={getRowLabel?.(row)}>
                {columns.map((column) => (
                  <td
                    key={column.id}
                    className={cn(
                      `lonaci-ui-table-cell--${column.align ?? "left"}`,
                      column.className,
                    )}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {mobileCard ? (
        <div className="lonaci-ui-table-mobile" role="list" aria-label={caption}>
          {rows.map((row) => (
            <div key={rowKey(row)} role="listitem">
              {mobileCard(row)}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
