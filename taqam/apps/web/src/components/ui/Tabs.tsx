'use client';
import clsx from 'clsx';

export function Tabs<T extends string>({ tabs, value, onChange, className }:
  { tabs: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={clsx('flex gap-1 overflow-x-auto border-b border-line', className)}>
      {tabs.map((t) => (
        <button key={t.value} onClick={() => onChange(t.value)}
          className={clsx('-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
            value === t.value ? 'border-accent text-primary' : 'border-transparent text-ink-muted hover:text-primary')}>
          {t.label}
          {t.count !== undefined && <span className="num rounded-full bg-sand-200 px-2 text-xs">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
