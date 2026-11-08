import type { ReactNode } from 'react';
import { cx } from '../common/components/ui.tsx';

export interface Column<T> {
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
  // Shown as the card title on phones instead of a labelled row.
  primary?: boolean;
}

// A table on wider screens and a list of cards on phones.
export function Table<T>({
  columns,
  rows,
  rowKey,
  expanded,
  empty,
  highlight,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  expanded?: (row: T) => ReactNode;
  empty?: string;
  highlight?: (row: T) => boolean;
}) {
  if (rows.length === 0 && empty) {
    return <div className="rounded-2xl border border-line bg-surface px-4 py-6 text-center text-muted">{empty}</div>;
  }
  return (
    <>
      <div className="hidden overflow-x-auto rounded-2xl border border-line bg-surface md:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-2 text-left text-xs font-semibold tracking-wide text-muted uppercase">
              {columns.map((column, index) => (
                <th key={index} className={cx('px-4 py-3 font-semibold', column.className)}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const extra = expanded?.(row);
              return [
                <tr key={rowKey(row)} className={cx('border-b border-line last:border-b-0', highlight?.(row) && 'bg-accent-soft')}>
                  {columns.map((column, index) => (
                    <td key={index} className={cx('px-4 py-3 align-middle', column.className)}>
                      {column.render(row)}
                    </td>
                  ))}
                </tr>,
                extra ? (
                  <tr key={`${rowKey(row)}-extra`} className="border-b border-line">
                    <td colSpan={columns.length} className="px-4 pt-0 pb-3.5">
                      {extra}
                    </td>
                  </tr>
                ) : null,
              ];
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-2 md:hidden">
        {rows.map((row) => {
          const primary = columns.filter((column) => column.primary);
          const rest = columns.filter((column) => !column.primary && column.header);
          const actions = columns.filter((column) => !column.header);
          const extra = expanded?.(row);
          return (
            <div key={rowKey(row)} className={cx('flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3.5', highlight?.(row) && 'border-accent')}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col gap-1">
                  {primary.map((column, index) => (
                    <div key={index}>{column.render(row)}</div>
                  ))}
                </div>
                {actions.map((column, index) => (
                  <div key={index} className="shrink-0">
                    {column.render(row)}
                  </div>
                ))}
              </div>
              {rest.map((column, index) => (
                <div key={index} className="flex justify-between gap-3 text-sm">
                  <span className="text-muted">{column.header}</span>
                  <span className="text-right">{column.render(row)}</span>
                </div>
              ))}
              {extra}
            </div>
          );
        })}
      </div>
    </>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="m-0 text-[26px] font-bold tracking-tight">{title}</h1>
        {subtitle && <span className="text-[13px] text-muted">{subtitle}</span>}
      </div>
      {actions}
    </div>
  );
}
