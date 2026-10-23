import clsx from 'clsx';

export function StatCard({ label, value, hint, icon, tone = 'primary', className }:
  { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: React.ReactNode; tone?: 'primary' | 'accent' | 'success' | 'danger' | 'info'; className?: string }) {
  const iconBg = { primary: 'bg-primary-100 text-primary', accent: 'bg-accent-100 text-accent-600', success: 'bg-success-50 text-success', danger: 'bg-danger-50 text-danger', info: 'bg-info-50 text-info' }[tone];
  return (
    <div className={clsx('rounded-2xl border border-line bg-white p-5 shadow-soft', className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-ink-muted">{label}</p>
          <p className="num mt-2 text-2xl font-bold text-ink">{value}</p>
          {hint && <p className="mt-1 text-xs text-ink-soft">{hint}</p>}
        </div>
        {icon && <div className={clsx('rounded-xl p-2.5', iconBg)}>{icon}</div>}
      </div>
    </div>
  );
}
