import { ReactNode } from 'react';
import { cx } from '@/lib/format';

export type Tone = 'safe' | 'watch' | 'busy' | 'danger' | 'critical' | 'info' | 'accent' | 'neutral';

const SOLID: Record<Tone, string> = {
  safe: 'var(--safe)',
  watch: 'var(--watch)',
  busy: 'var(--busy)',
  danger: 'var(--danger)',
  critical: 'var(--critical)',
  info: 'var(--info)',
  accent: 'var(--accent)',
  neutral: 'var(--text-dim)',
};

const SOFT: Record<Tone, string> = {
  safe: 'var(--safe-soft)',
  watch: 'var(--watch-soft)',
  busy: 'var(--busy-soft)',
  danger: 'var(--danger-soft)',
  critical: 'var(--critical-soft)',
  info: 'var(--surface-2)',
  accent: 'var(--accent-soft)',
  neutral: 'var(--surface-2)',
};

interface BadgeProps {
  tone?: Tone;
  label: ReactNode;
  icon?: ReactNode;
  solid?: boolean;
  className?: string;
}

/**
 * Status badge. Always pairs color with a text label (and optional icon),
 * so state never depends on color alone.
 */
export function Badge({ tone = 'neutral', label, icon, solid = false, className }: BadgeProps) {
  const style = solid
    ? { backgroundColor: SOLID[tone], color: '#fff' }
    : { backgroundColor: SOFT[tone], color: SOLID[tone] };
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold',
        className,
      )}
      style={style}
    >
      {icon}
      {label}
    </span>
  );
}
