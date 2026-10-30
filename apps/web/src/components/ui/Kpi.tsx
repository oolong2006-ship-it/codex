import { ReactNode } from 'react';
import { cx } from '@/lib/format';
import { Card } from './Card';
import { Icon, IconName } from './Icon';

interface KpiProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: IconName;
  alert?: boolean;
  trend?: 'up' | 'down' | null;
}

/** Compact executive KPI tile. */
export function Kpi({ label, value, sub, icon, alert, trend }: KpiProps) {
  return (
    <Card className="relative overflow-hidden p-3.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-text-dim">
        {icon && <Icon name={icon} size={14} />}
        <span className="truncate">{label}</span>
      </div>
      <div
        className={cx(
          'tabular mt-1.5 text-2xl font-extrabold leading-none tracking-tight',
          alert ? 'text-busy' : 'text-text',
        )}
      >
        {value}
      </div>
      {sub != null && <div className="tabular mt-1 text-xs text-text-faint">{sub}</div>}
      {trend && (
        <span
          className={cx('absolute top-3 text-xs', trend === 'up' ? 'text-busy' : 'text-safe')}
          style={{ insetInlineEnd: '12px' }}
        >
          <Icon name={trend === 'up' ? 'trendUp' : 'trendDown'} size={16} />
        </span>
      )}
    </Card>
  );
}
