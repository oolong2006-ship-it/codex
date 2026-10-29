'use client';
import Link from 'next/link';
import { EmptyState } from '@/components/ui';
import { useLang } from '@/lib/i18n';
import { date, money } from '@/lib/format';
import { BILLING_CYCLE, COMPANY_STATUS, EMAIL_TYPE, PAYMENT_METHOD, PLAN, companyName, lbl, type CompanyEvent } from '@/lib/adminTypes';
import { EventChip, timeAgo } from './primitives';

/** Vertical timeline of company lifecycle events. */
export function Timeline({ events, showCompany, companyLabel }: { events: CompanyEvent[]; showCompany?: boolean; companyLabel?: (id: string) => string | undefined }) {
  const { t, lang } = useLang();
  if (!events.length) return <EmptyState title={t('لا توجد أحداث', 'No events yet')} />;
  return (
    <ol className="relative space-y-5 border-s-2 border-line ps-5">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span className="absolute -start-[27px] top-1 h-3 w-3 rounded-full border-2 border-white bg-primary-500 ring-2 ring-line" />
          <div className="flex flex-wrap items-center gap-2">
            <EventChip type={e.type} />
            {e.fromStatus && e.toStatus && e.fromStatus !== e.toStatus && (
              <span className="flex items-center gap-1 text-xs text-ink-muted">
                {lbl(COMPANY_STATUS, e.fromStatus, lang)} <span className="inline-block ltr:rotate-180">←</span> {lbl(COMPANY_STATUS, e.toStatus, lang)}
              </span>
            )}
            {showCompany && (() => {
              const n = e.company ? companyName(e.company, lang) : e.companyName || companyLabel?.(e.companyId);
              if (!n) return null;
              return e.type === 'DELETED'
                ? <span className="text-sm font-medium text-ink">{n}</span>
                : <Link href={`/admin/companies/${e.companyId}`} className="text-sm font-medium text-primary-500 hover:underline">{n}</Link>;
            })()}
          </div>
          <EventDetails e={e} />
          <p className="mt-1 text-xs text-ink-soft">
            {date(e.createdAt, lang)} · {timeAgo(e.createdAt, lang)}{e.adminName ? ` · ${e.adminName}` : ''}
          </p>
        </li>
      ))}
    </ol>
  );
}

function EventDetails({ e }: { e: CompanyEvent }) {
  const { t, lang } = useLang();
  const d = e.data;
  if (!d || typeof d !== 'object') return null;
  const parts: string[] = [];
  const s = (k: string) => (d[k] === undefined || d[k] === null ? null : String(d[k]));
  if (s('number')) parts.push(`${t('فاتورة', 'Invoice')} ${s('number')}${typeof d.total === 'number' ? ` · ${money(d.total)}` : ''}`);
  if (s('paymentMethod')) parts.push(lbl(PAYMENT_METHOD, s('paymentMethod'), lang));
  if (e.type === 'REMINDER_SENT' && s('type')) parts.push(lbl(EMAIL_TYPE, s('type'), lang) + (typeof d.daysOverdue === 'number' ? ` · ${t(`متأخرة ${d.daysOverdue} يوم`, `${d.daysOverdue} days overdue`)}` : typeof d.daysLeft === 'number' && d.type !== 'EXPIRED' ? ` · ${t(`متبقٍ ${d.daysLeft} يوم`, `${d.daysLeft} days left`)}` : ''));
  if (s('reason')) parts.push(`${t('السبب', 'Reason')}: ${s('reason')}`);
  if (s('plan')) parts.push(`${t('الباقة', 'Plan')}: ${lbl(PLAN, s('plan'), lang)}`);
  if (s('billingCycle')) parts.push(lbl(BILLING_CYCLE, s('billingCycle'), lang));
  if (s('days')) parts.push(t(`${s('days')} يوم`, `${s('days')} days`));
  if (s('maxEmployees')) parts.push(`${t('الحد', 'Seats')}: ${s('maxEmployees')}`);
  if (s('mode')) parts.push(s('mode') === 'TRIAL' ? t('تجريبي', 'Trial') : t('مدفوع', 'Paid'));
  if (s('note')) parts.push(s('note')!);
  if (!parts.length) return null;
  return <p className="mt-1 text-sm text-ink-muted">{parts.join(' · ')}</p>;
}

