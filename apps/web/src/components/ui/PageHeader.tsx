import { ReactNode } from 'react';

export function PageHeader({
  title,
  sub,
  actions,
}: {
  title: string;
  sub?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight">{title}</h2>
        {sub != null && <div className="mt-0.5 text-sm text-text-dim">{sub}</div>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <div className="mb-2.5 mt-6 px-1 text-xs font-bold uppercase tracking-wider text-text-dim">
      {children}
    </div>
  );
}
