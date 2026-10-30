import { ReactNode } from 'react';
import { Icon, IconName } from './Icon';

interface EmptyStateProps {
  icon?: IconName;
  title: string;
  hint?: ReactNode;
  tone?: 'neutral' | 'danger';
}

export function EmptyState({ icon = 'shield', title, hint, tone = 'neutral' }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded border border-dashed border-border px-6 py-12 text-center">
      <span style={{ color: tone === 'danger' ? 'var(--danger)' : 'var(--text-faint)' }}>
        <Icon name={icon} size={34} />
      </span>
      <div className="mt-3 text-base font-semibold text-text">{title}</div>
      {hint && <div className="mt-1 max-w-sm text-sm text-text-dim">{hint}</div>}
    </div>
  );
}
