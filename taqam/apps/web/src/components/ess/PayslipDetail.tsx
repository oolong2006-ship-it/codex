'use client';
import clsx from 'clsx';
import Link from 'next/link';
import { ArrowRight, ArrowLeft, Info, Printer, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { useAuth } from '@/lib/auth';
import { useLang } from '@/lib/i18n';
import { money, period as fmtPeriod, todayISO, date as fmtDate } from '@/lib/format';
import { ErrorState } from '@/components/ui/States';
import { Logo } from '@/components/ui/Logo';
import { Skeleton } from '@/components/ess/primitives';
import type { Payslip, PayslipLine } from '@/components/ess/types';
import { maskIban } from '@/components/ess/utils';

/** ESS payslip detail (rendered by /me/payslips/[id] and, in the static demo, /me/payslips/view?id=). */
export function PayslipDetail({ id }: { id: string }) {
  const { t, lang, dir } = useLang();
  const { user } = useAuth();
  const { data: p, loading, error, reload } = useFetch(() => api.get<Payslip>(`/me/payslips/${id}`), [id]);
  const Back = dir === 'rtl' ? ArrowRight : ArrowLeft;
  const lineLabel = (l: PayslipLine) => (lang === 'ar' ? l.labelAr : l.labelEn || l.labelAr);

  return (
    <div className="space-y-4 print:space-y-0">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/me/payslips" className="flex h-11 items-center gap-1.5 rounded-2xl px-2 text-sm font-medium text-primary"><Back className="h-5 w-5" />{t('القسائم', 'Payslips')}</Link>
        {p && (
          <button onClick={() => window.print()} className="flex h-11 items-center gap-2 rounded-2xl bg-primary px-4 text-sm font-semibold text-white shadow-soft active:scale-95">
            <Printer className="h-4 w-4" />{t('طباعة / حفظ PDF', 'Print / Save PDF')}
          </button>
        )}
      </div>

      {error && !p ? <ErrorState message={error} onRetry={reload} /> : loading && !p ? (
        <div className="space-y-4"><Skeleton className="h-44 rounded-[28px]" /><Skeleton className="h-56 rounded-3xl" /><Skeleton className="h-40 rounded-3xl" /></div>
      ) : p ? (
        <article className="space-y-4 print:mx-auto print:max-w-[720px] print:space-y-5 print:text-[13px]">
          {/* Print-only document header */}
          <header className="hidden items-start justify-between border-b-2 border-primary pb-4 print:flex">
            <div>
              <Logo />
              <p className="mt-2 text-sm font-semibold">{user?.company?.nameAr}</p>
              {user?.company?.nameEn && <p className="text-xs text-ink-muted">{user.company.nameEn}</p>}
            </div>
            <div className="text-end">
              <h1 className="text-xl font-bold">{t('قسيمة راتب', 'Payslip')}</h1>
              <p className="text-sm">{fmtPeriod(p.period, lang)}</p>
              <p className="num text-xs text-ink-muted">{t('تاريخ الإصدار', 'Issued')}: {fmtDate(todayISO(), lang)}</p>
            </div>
          </header>

          {/* Net hero */}
          <div className="relative overflow-hidden rounded-[28px] bg-primary p-5 text-white shadow-lift print:rounded-xl print:border print:border-line print:bg-white print:text-ink print:shadow-none">
            <div className="taqam-pattern pointer-events-none absolute inset-0 opacity-30 print:hidden" aria-hidden />
            <div className="relative">
              <p className="text-sm text-white/70 print:text-ink-muted">{t('صافي الراتب', 'Net salary')} · {fmtPeriod(p.period, lang)}</p>
              <p className="num mt-1 text-4xl font-bold print:text-3xl print:text-primary">{money(p.net, { currency: false })} <span className="text-base font-medium text-accent print:text-ink-muted">{t('ر.س', 'SAR')}</span></p>
              <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-white/[.08] p-3 text-center ring-1 ring-white/10 print:bg-sand print:ring-line">
                <Mini label={t('الإجمالي', 'Gross')} value={money(p.gross, { decimals: 0, currency: false })} />
                <Mini label={t('الخصومات', 'Deductions')} value={money(p.totalDeductions, { decimals: 0, currency: false })} />
                <Mini label={t('أيام مستحقة', 'Payable days')} value={String(p.payableDays)} />
              </div>
            </div>
          </div>

          {/* Employee info */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-3xl border border-line bg-white p-4 text-sm shadow-soft print:rounded-xl print:shadow-none">
            <Info2 label={t('الموظف', 'Employee')} value={p.employee?.name} />
            <Info2 label={t('الرقم الوظيفي', 'Employee no.')} value={p.employee?.employeeNumber} num />
            <Info2 label={t('الفرع', 'Branch')} value={p.employee?.branchName} />
            <Info2 label={t('الحساب البنكي', 'Bank account')} value={maskIban(p.employee?.iban)} num ltr />
          </div>

          <Lines title={t('الاستحقاقات', 'Earnings')} lines={p.earnings} total={p.gross} totalLabel={t('إجمالي الاستحقاقات', 'Total earnings')} tone="success" lineLabel={lineLabel} />
          <Lines title={t('الخصومات', 'Deductions')} lines={p.deductions} total={p.totalDeductions} totalLabel={t('إجمالي الخصومات', 'Total deductions')} tone="danger" lineLabel={lineLabel} />

          <div className="flex items-center justify-between rounded-3xl bg-accent-50 px-5 py-4 ring-1 ring-accent-100 print:rounded-xl print:border-2 print:border-primary print:bg-white">
            <span className="font-semibold text-ink">{t('صافي الراتب المستحق', 'Net pay')}</span>
            <span className="num text-xl font-bold text-primary">{money(p.net)}</span>
          </div>

          {/* GOSI */}
          <div className="rounded-3xl border border-line bg-white p-4 shadow-soft print:rounded-xl print:shadow-none">
            <div className="flex items-center gap-2 text-sm font-bold text-ink"><ShieldCheck className="h-5 w-5 text-primary-500" />{t('التأمينات الاجتماعية (GOSI)', 'Social insurance (GOSI)')}</div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-sand p-3"><p className="text-xs text-ink-muted">{t('حصة الموظف', 'Employee share')}</p><p className="num mt-0.5 font-bold text-ink">{money(p.gosiEmployee)}</p></div>
              <div className="rounded-2xl bg-sand p-3"><p className="text-xs text-ink-muted">{t('حصة صاحب العمل', 'Employer share')}</p><p className="num mt-0.5 font-bold text-ink">{money(p.gosiEmployer)}</p></div>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-soft">
              {p.employee?.isSaudi === false
                ? t('لغير السعوديين: يتحمل صاحب العمل اشتراك الأخطار المهنية كاملاً.', 'Non-Saudis: occupational hazards are fully paid by the employer.')
                : t('تُحتسب الاشتراكات على الراتب الأساسي وبدل السكن (المعاشات وساند والأخطار المهنية).', 'Contributions are calculated on basic + housing (annuities, SANED, hazards).')}
            </p>
          </div>

          {p.notes && p.notes.length > 0 && (
            <div className="rounded-3xl border border-info/20 bg-info-50 p-4 text-sm text-info print:rounded-xl">
              <p className="flex items-center gap-1.5 font-semibold"><Info className="h-4 w-4" />{t('ملاحظات', 'Notes')}</p>
              <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-[13px]">{p.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
            </div>
          )}

          <p className="hidden pt-6 text-center text-[11px] text-ink-soft print:block">{t('هذه القسيمة صادرة إلكترونياً من منصة طاقم ولا تحتاج إلى توقيع.', 'This payslip was generated electronically by Taqam and requires no signature.')}</p>
        </article>
      ) : null}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[11px] text-white/60 print:text-ink-muted">{label}</p><p className="num mt-0.5 font-bold">{value}</p></div>;
}
function Info2({ label, value, num, ltr }: { label: string; value?: string | null; num?: boolean; ltr?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={clsx('truncate font-semibold text-ink', num && 'num')} dir={ltr ? 'ltr' : undefined} style={ltr ? { textAlign: 'start' } : undefined}>{value || '—'}</p>
    </div>
  );
}
function Lines({ title, lines, total, totalLabel, tone, lineLabel }:
  { title: string; lines: PayslipLine[]; total: number; totalLabel: string; tone: 'success' | 'danger'; lineLabel: (l: PayslipLine) => string }) {
  return (
    <section className="overflow-hidden rounded-3xl border border-line bg-white shadow-soft print:break-inside-avoid print:rounded-xl print:shadow-none">
      <h2 className={clsx('flex items-center gap-2 border-b border-line px-4 py-3 text-sm font-bold', tone === 'success' ? 'text-success' : 'text-danger')}>
        <span className={clsx('h-2 w-2 rounded-full', tone === 'success' ? 'bg-success' : 'bg-danger')} />{title}
      </h2>
      {lines?.length ? (
        <ul className="divide-y divide-line/70">
          {lines.map((l, i) => (
            <li key={`${l.code}-${i}`} className="flex items-center justify-between px-4 py-3 text-sm print:py-2">
              <span className="text-ink">{lineLabel(l)}</span>
              <span className="num font-medium text-ink">{money(l.amount, { currency: false })}</span>
            </li>
          ))}
        </ul>
      ) : <p className="px-4 py-3 text-sm text-ink-soft">—</p>}
      <div className="flex items-center justify-between bg-sand/70 px-4 py-3 text-sm font-bold">
        <span>{totalLabel}</span><span className="num">{money(total)}</span>
      </div>
    </section>
  );
}
