'use client';
import clsx from 'clsx';
import { EmptyState } from './States';

export interface Column<T> { key: string; header: React.ReactNode; render: (row: T) => React.ReactNode; className?: string }

export function Table<T>({ columns, rows, rowKey, onRowClick, empty, className }:
  { columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string; onRowClick?: (r: T) => void; empty?: React.ReactNode; className?: string }) {
  if (!rows.length) return <>{empty ?? <EmptyState />}</>;
  return (
    <div className={clsx('overflow-x-auto', className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line bg-sand/60 text-ink-muted">
            {columns.map((c) => <th key={c.key} className={clsx('whitespace-nowrap px-4 py-3 text-start font-medium', c.className)}>{c.header}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined}
              className={clsx('border-b border-line/70 last:border-0', onRowClick && 'cursor-pointer hover:bg-primary-50/50')}>
              {columns.map((c) => <td key={c.key} className={clsx('whitespace-nowrap px-4 py-3', c.className)}>{c.render(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-4 py-3 text-sm text-ink-muted">
      <span className="num">{total}</span>
      <div className="flex gap-1">
        <button className="rounded-lg px-3 py-1 hover:bg-sand disabled:opacity-40" disabled={page <= 1} onClick={() => onChange(page - 1)}>‹</button>
        <span className="num px-2 py-1">{page} / {pages}</span>
        <button className="rounded-lg px-3 py-1 hover:bg-sand disabled:opacity-40" disabled={page >= pages} onClick={() => onChange(page + 1)}>›</button>
      </div>
    </div>
  );
}
