'use client';
import clsx from 'clsx';
import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Badge } from '@/components/ui';
import { useLang } from '@/lib/i18n';
import { num } from '@/lib/format';
import { COMPANY_STATUS, EVENT_TONE, EVENT_TYPE, LEAD_STATUS, LEAD_TONE, PLAN, STATUS_TONE, lbl, type CompanyEventType, type CompanyStatus, type LeadStatus } from '@/lib/adminTypes';

const DOT: Record<CompanyStatus, string> = { PENDING: 'bg-warning', TRIAL: 'bg-info', ACTIVE: 'bg-success', SUSPENDED: 'bg-danger', EXPIRED: 'bg-ink-soft' };

export function CompanyStatusChip({ status, className }: { status: CompanyStatus | string | null | undefined; className?: string }) {
  const { lang } = useLang();
  const s = (status || 'EXPIRED') as CompanyStatus;
  return (
    <Badge tone={STATUS_TONE[s] ?? 'neutral'} className={className}>
      <span className={clsx('h-1.5 w-1.5 rounded-full', DOT[s] ?? 'bg-ink-soft')} />
      {lbl(COMPANY_STATUS, s, lang)}
    </Badge>
  );
}

export function PlanBadge({ plan }: { plan: string | null | undefined }) {
  const { lang } = useLang();
  const cls = plan === 'ENTERPRISE' ? 'border-accent/50 bg-accent-50 text-accent-600' : plan === 'GROWTH' ? 'border-primary-100 bg-primary-50 text-primary' : 'border-line bg-white text-ink-muted';
  return <span className={clsx('inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium', cls)}>{lbl(PLAN, plan, lang)}</span>;
}

export function LeadStatusChip({ status }: { status: LeadStatus }) {
  const { lang } = useLang();
  return <Badge tone={LEAD_TONE[status] ?? 'neutral'}>{lbl(LEAD_STATUS, status, lang)}</Badge>;
}
export function EventChip({ type }: { type: CompanyEventType }) {
  const { lang } = useLang();
  return <Badge tone={EVENT_TONE[type] ?? 'neutral'}>{lbl(EVENT_TYPE, type, lang)}</Badge>;
}

/** activeEmployees / maxEmployees as a small bar. */
export function SeatBar({ used, max, className }: { used: number; max: number | null; className?: string }) {
  const { t } = useLang();
  const ratio = max ? Math.min(1, used / Math.max(1, max)) : 0;
  const color = !max ? 'bg-primary-500/40' : ratio >= 1 ? 'bg-danger' : ratio >= 0.85 ? 'bg-warning' : 'bg-primary-500';
  return (
    <div className={clsx('min-w-[96px]', className)}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="num font-medium text-ink" dir="ltr">{num(used)}{max ? ` / ${num(max)}` : ''}</span>
        {!max && <span className="text-[10px] text-ink-soft">{t('غير محدود', 'Unlimited')}</span>}
      </div>
      {max ? (
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sand-200" role="progressbar" aria-valuenow={used} aria-valuemax={max}>
          <div className={clsx('h-full rounded-full', color)} style={{ width: `${Math.max(4, ratio * 100)}%` }} />
        </div>
      ) : (
        <div className="mt-1 h-1.5 rounded-full border border-dashed border-line" aria-hidden="true" />
      )}
    </div>
  );
}

export function DaysLeft({ days }: { days: number | null | undefined }) {
  const { t } = useLang();
  if (days === null || days === undefined) return <span className="text-ink-soft">—</span>;
  const cls = days < 0 ? 'text-danger' : days <= 3 ? 'text-danger font-semibold' : days <= 14 ? 'text-[#9a7400] font-medium' : 'text-ink';
  return <span className={clsx('num text-sm', cls)}>{days < 0 ? t('منتهي', 'Ended') : t(`${days} يوم`, `${days}d`)}</span>;
}

export function timeAgo(iso: string | null | undefined, lang: 'ar' | 'en') {
  if (!iso) return '—';
  const ms = new Date(iso).getTime();
  if (isNaN(ms)) return '—';
  const s = (Date.now() - ms) / 1000;
  const rtf = new Intl.RelativeTimeFormat(lang === 'ar' ? 'ar' : 'en', { numeric: 'auto' });
  const a = Math.abs(s); const sign = s >= 0 ? -1 : 1;
  if (a < 60) return rtf.format(0, 'second');
  if (a < 3600) return rtf.format(sign * Math.round(a / 60), 'minute');
  if (a < 86400) return rtf.format(sign * Math.round(a / 3600), 'hour');
  if (a < 86400 * 30) return rtf.format(sign * Math.round(a / 86400), 'day');
  if (a < 86400 * 365) return rtf.format(sign * Math.round(a / (86400 * 30)), 'month');
  return rtf.format(sign * Math.round(a / (86400 * 365)), 'year');
}

export function CopyButton({ value, className }: { value: string; className?: string }) {
  const { t } = useLang();
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); }
    catch {
      const ta = document.createElement('textarea'); ta.value = value; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch { /* ignore */ } ta.remove();
    }
    setDone(true); setTimeout(() => setDone(false), 1800);
  };
  return (
    <button type="button" onClick={copy} className={clsx('inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-sm font-medium text-primary hover:bg-primary-50', className)}>
      {done ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}{done ? t('تم النسخ', 'Copied') : t('نسخ', 'Copy')}
    </button>
  );
}

/** Uppercase section label used on the overview. */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">{children}</p>;
}
