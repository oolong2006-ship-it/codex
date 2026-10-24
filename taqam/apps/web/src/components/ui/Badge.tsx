import clsx from 'clsx';

export type Tone = 'neutral' | 'primary' | 'accent' | 'success' | 'warning' | 'danger' | 'info';
const tones: Record<Tone, string> = {
  neutral: 'bg-sand-200 text-ink-muted',
  primary: 'bg-primary-100 text-primary',
  accent: 'bg-accent-100 text-accent-600',
  success: 'bg-success-50 text-success',
  warning: 'bg-warning-50 text-warning',
  danger: 'bg-danger-50 text-danger',
  info: 'bg-info-50 text-info',
};
export function Badge({ tone = 'neutral', className, children }: { tone?: Tone; className?: string; children: React.ReactNode }) {
  return <span className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', tones[tone], className)}>{children}</span>;
}

/** Map common API status enums to a tone. */
export function statusTone(status: string | null | undefined): Tone {
  switch (status) {
    case 'APPROVED': case 'PAID': case 'PRESENT': case 'ACTIVE': case 'OK': case 'HIRED': case 'PLATINUM': case 'HIGH_GREEN': case 'SUBMITTED': case 'OPEN':
      return 'success';
    case 'PENDING': case 'CALCULATED': case 'LATE': case 'WARNING': case 'INCOMPLETE': case 'LOW_GREEN': case 'INTERVIEW': case 'OFFER':
      return 'warning';
    case 'REJECTED': case 'ABSENT': case 'EXPIRED': case 'CRITICAL': case 'RED': case 'TERMINATED':
      return 'danger';
    case 'ON_LEAVE': case 'DRAFT': case 'MID_GREEN': case 'SCREENING':
      return 'info';
    default:
      return 'neutral';
  }
}
