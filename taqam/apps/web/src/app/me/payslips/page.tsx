'use client';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, ReceiptText } from 'lucide-react';
import { api } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { useLang } from '@/lib/i18n';
import { money, period as fmtPeriod } from '@/lib/format';
import { label, PAYROLL_STATUS } from '@/lib/labels';
import { Badge, statusTone } from '@/components/ui/Badge';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { IconTile, ListSkeleton, PageTitle, Skeleton } from '@/components/ess/primitives';
import { asArray, type PayslipListItem } from '@/components/ess/types';
import { payslipHref } from '@/lib/paths';

export default function MyPayslipsPage() {
  const { t, lang, dir } = useLang();
  const { data, loading, error, reload } = useFetch(() => api.get<unknown>('/me/payslips'), []);
  const list = asArray<PayslipListItem>(data).slice().sort((a, b) => b.period.localeCompare(a.period));
  const latest = list[0];
  const Chevron = dir === 'rtl' ? ChevronLeft : ChevronRight;
  const ytd = list.filter((p) => latest && p.period.slice(0, 4) === latest.period.slice(0, 4)).reduce((s, p) => s + (p.net || 0), 0);

  return (
    <div className="space-y-5">
      <PageTitle title={t('قسائم الرواتب', 'Payslips')} subtitle={t('رواتبك المعتمدة', 'Your approved salaries')} />

      {error && !data ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? (
        <><Skeleton className="h-40 w-full rounded-[28px]" /><ListSkeleton /></>
      ) : list.length === 0 ? (
        <div className="rounded-3xl border border-line bg-white"><EmptyState title={t('لا توجد قسائم بعد', 'No payslips yet')} description={t('ستظهر قسيمتك هنا بعد اعتماد مسير الرواتب.', 'Your payslip appears once payroll is approved.')} /></div>
      ) : (
        <>
          <Link href={payslipHref(latest.id)} className="relative block overflow-hidden rounded-[28px] bg-night p-5 text-white shadow-lift active:scale-[.99]">
            <div className="taqam-pattern pointer-events-none absolute inset-0 opacity-30" aria-hidden />
            <div className="relative">
              <p className="text-sm text-white/70">{t('آخر راتب', 'Latest pay')} · {fmtPeriod(latest.period, lang)}</p>
              <p className="num mt-2 text-4xl font-bold">{money(latest.net, { currency: false })} <span className="text-base font-medium text-accent">{t('ر.س', 'SAR')}</span></p>
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="num text-white/70">{t('الإجمالي', 'Gross')} {money(latest.gross, { decimals: 0 })}</span>
                <span className="flex items-center gap-1 font-medium text-accent">{t('التفاصيل', 'Details')}<Chevron className="h-4 w-4" /></span>
              </div>
            </div>
          </Link>
          <p className="num px-1 text-xs text-ink-muted">{t(`صافي ما استلمته في ${latest.period.slice(0, 4)}: `, `Net received in ${latest.period.slice(0, 4)}: `)}<span className="font-semibold text-ink">{money(ytd)}</span></p>

          <ul className="space-y-2.5">
            {list.map((p) => (
              <li key={p.id}>
                <Link href={payslipHref(p.id)} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3.5 shadow-soft active:scale-[.99]">
                  <IconTile icon={<ReceiptText className="h-5 w-5" />} tone="accent" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">{fmtPeriod(p.period, lang)}</p>
                    <p className="num text-xs text-ink-muted">{t('الإجمالي', 'Gross')} {money(p.gross, { decimals: 0 })}</p>
                  </div>
                  <div className="text-end">
                    <p className="num font-bold text-primary">{money(p.net, { decimals: 0 })}</p>
                    {p.status && <Badge tone={statusTone(p.status)} className="mt-0.5">{label(PAYROLL_STATUS, p.status, lang)}</Badge>}
                  </div>
                  <Chevron className="h-5 w-5 text-ink-soft" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
