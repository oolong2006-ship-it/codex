'use client';
import { useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { AlertTriangle, ArrowLeft, FileWarning, Flag, Info, ShieldAlert, ShieldCheck, Wallet } from 'lucide-react';
import { RISK_LEVEL_LABELS, riskHeadline } from '@taqam/core';
import { Badge, Card, CardBody, CardHeader, EmptyState, Input, PageHeader, Table, type Column } from '@/components/ui';
import { Async } from '@/components/app/primitives';
import { ADMIN, can } from '@/components/app/utils';
import { canVisit } from '@/components/app/nav';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { COST_SEGMENTS, costBarWidths, FEES_NOTE } from '@/lib/compliance';
import { useFetch } from '@/lib/useFetch';
import { useLang } from '@/lib/i18n';
import { money, num, pct, period as fmtPeriod, todayISO } from '@/lib/format';
import { NITAQAT_BAND, label } from '@/lib/labels';
import { arCount, marginNote, type ArForms } from '@/lib/saudization';
import type { BranchCosts, ComplianceOverview, RiskItem, RiskLevel } from '@/lib/types';

/** Status styling — icon + label always accompany the colour (never colour alone). */
const LEVEL_STYLE: Record<RiskLevel, { icon: typeof ShieldAlert; box: string; text: string; badge: 'danger' | 'warning' | 'success' }> = {
  HIGH: { icon: ShieldAlert, box: 'border-danger/30 bg-danger-50', text: 'text-danger', badge: 'danger' },
  MEDIUM: { icon: AlertTriangle, box: 'border-warning/30 bg-warning-50', text: 'text-warning', badge: 'warning' },
  LOW: { icon: ShieldCheck, box: 'border-success/30 bg-success-50', text: 'text-success', badge: 'success' },
};

function LevelBadge({ level }: { level: RiskLevel }) {
  const { lang } = useLang();
  const s = LEVEL_STYLE[level];
  const Icon = s.icon;
  return <Badge tone={s.badge}><Icon className="h-3.5 w-3.5" aria-hidden />{lang === 'ar' ? `مخاطر ${RISK_LEVEL_LABELS[level].ar}` : `${RISK_LEVEL_LABELS[level].en} risk`}</Badge>;
}

/** What the big number on a risk card means. */
function riskValue(item: RiskItem, o: ComplianceOverview, lang: 'ar' | 'en') {
  if (item.key === 'NITAQAT') {
    const note = o.saudization.band === 'RED' ? { ar: 'وثّق العقود أو وظّف سعوديين للخروج من الأحمر', en: 'Document contracts or hire Saudis to leave red' } : marginNote(item.count);
    return { value: label(NITAQAT_BAND, o.saudization.band, lang), hint: lang === 'ar' ? note.ar : note.en };
  }
  if (item.key === 'WPS_NOT_EXPORTED') return { value: fmtPeriod(o.wps?.prevPeriod, lang), hint: lang === 'ar' ? 'كان يجب تصديره قبل اليوم العاشر' : 'It should have been exported before the 10th' };
  return { value: num(item.count), hint: undefined };
}

/** A link only when the viewer may open the fixing page (PAYROLL cannot open documents / saudization). */
function RiskCard({ item, o }: { item: RiskItem; o: ComplianceOverview }) {
  const { lang, t } = useLang();
  const { user } = useAuth();
  const { value, hint } = riskValue(item, o, lang);
  const linked = canVisit(item.href, user?.role);
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <LevelBadge level={item.level} />
        {linked && <ArrowLeft className="h-4 w-4 text-ink-soft transition-transform group-hover:-translate-x-0.5 ltr:rotate-180" aria-hidden />}
      </div>
      <p className="text-sm font-medium text-ink">{lang === 'ar' ? item.titleAr : item.titleEn}</p>
      <div>
        <p className="text-2xl font-bold text-ink">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-ink-soft">{hint}</p>}
      </div>
      {linked
        ? <span className="text-xs font-medium text-primary-500">{t('معالجة', 'Fix it')}</span>
        : <span className="text-xs text-ink-soft">{t('يعالجها مسؤول الموارد البشرية', 'Handled by HR admins')}</span>}
    </>
  );
  const cls = 'flex flex-col gap-2 rounded-2xl border border-line bg-white p-3 shadow-soft sm:gap-3 sm:p-4';
  return linked
    ? <Link href={item.href} className={clsx('group transition-colors hover:border-primary-500', cls)}>{body}</Link>
    : <div className={cls}>{body}</div>;
}

function Headline({ o }: { o: ComplianceOverview }) {
  const { lang, t } = useLang();
  const level = o.risk.level;
  const s = LEVEL_STYLE[level];
  const Icon = s.icon;
  const high = o.risk.items.filter((i) => i.level === 'HIGH').length;
  const medium = o.risk.items.filter((i) => i.level === 'MEDIUM').length;
  const h = riskHeadline(level);
  return (
    <div role="status" className={clsx('flex items-start gap-4 rounded-2xl border p-5', s.box)}>
      <span className={clsx('rounded-xl bg-white p-2.5', s.text)}><Icon className="h-6 w-6" aria-hidden /></span>
      <div>
        <h2 className="text-lg font-bold text-ink">{lang === 'ar' ? h.ar : h.en}</h2>
        <p className="mt-1 text-sm text-ink-muted">
          {o.risk.items.length
            ? t(`${num(high)} مرتفعة · ${num(medium)} متوسطة — ابدأ بالمرتفعة`, `${num(high)} high · ${num(medium)} medium — start with the high ones`)
            : t('لا توجد مخاطر على خدماتك الحكومية حالياً', 'No risks to your government services right now')}
        </p>
      </div>
    </div>
  );
}

/** One KPI tile (label · value · hint) — a figure, not a chart. */
function Tile({ icon, label: l, value, hint }: { icon: React.ReactNode; label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4 shadow-soft">
      <p className="flex items-center gap-2 text-sm text-ink-muted"><span className="text-ink-soft">{icon}</span>{l}</p>
      <p className="mt-2 text-xl font-bold text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-soft">{hint}</p>}
    </div>
  );
}

function KeyFigures({ o }: { o: ComplianceOverview }) {
  const { t, lang } = useLang();
  const d = o.documents;
  return (
    <div className={clsx('grid grid-cols-1 gap-4', o.wps ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
      <Tile icon={<Flag className="h-4 w-4" />} label={t('السعودة الرسمية', 'Official Saudization')}
        value={<span dir="ltr">{pct(o.saudization.officialRate)}</span>}
        hint={`${label(NITAQAT_BAND, o.saudization.band, lang)} · ${t(`${num(o.saudization.undocumentedSaudis)} غير موثق في قوى`, `${num(o.saudization.undocumentedSaudis)} not documented in Qiwa`)}`} />
      {o.wps && (
        <Tile icon={<Wallet className="h-4 w-4" />} label={t(`حماية الأجور — ${fmtPeriod(o.wps.prevPeriod, 'ar')}`, `WPS — ${fmtPeriod(o.wps.prevPeriod, 'en')}`)}
          value={o.wps.exported ? t('صُدِّر الملف', 'File exported') : o.wps.due ? t('لم يُصدَّر', 'Not exported') : t('لا رواتب مستحقة', 'Nothing due')}
          hint={o.wps.latestRunPeriod ? t(`آخر مسير (${fmtPeriod(o.wps.latestRunPeriod, 'ar')}): ${num(o.wps.errors)} خطأ`, `Latest run (${fmtPeriod(o.wps.latestRunPeriod, 'en')}): ${num(o.wps.errors)} error(s)`) : t('لا توجد مسيرات محتسبة', 'No calculated runs')} />
      )}
      <Tile icon={<FileWarning className="h-4 w-4" />} label={t('الوثائق المطلوبة', 'Required documents')}
        value={t(`${num(d.docsMissing)} ناقصة · ${num(d.expiredIqamas + d.docsExpired)} منتهية`, `${num(d.docsMissing)} missing · ${num(d.expiredIqamas + d.docsExpired)} expired`)}
        hint={t(`${num(d.iqamasExpiring30)} إقامة تنتهي خلال 30 يوماً`, `${num(d.iqamasExpiring30)} iqama(s) expiring within 30 days`)} />
    </div>
  );
}

type Row = BranchCosts['branches'][number];
const EMPLOYEE: ArForms = { one: 'موظف واحد', two: 'موظفان', few: 'موظفين', many: 'موظفاً' };

/** Horizontal stacked bars — one per branch: gross | GOSI | government fees, total at the tip. */
function CostBars({ rows }: { rows: Row[] }) {
  const { t, lang } = useLang();
  const [hover, setHover] = useState<number | null>(null);
  const widths = costBarWidths(rows);
  const name = (r: Row) => r.branchName ?? t('بدون فرع', 'No branch');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
        {COST_SEGMENTS.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{lang === 'ar' ? s.label.ar : s.label.en}</span>
        ))}
      </div>
      <ul className="space-y-3">
        {rows.map((r, i) => (
          <li key={r.branchId ?? 'none'} className="relative" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0}
            aria-label={`${name(r)}: ${money(r.total, { decimals: 0 })} — ${COST_SEGMENTS.map((s) => `${lang === 'ar' ? s.label.ar : s.label.en} ${money(r[s.key], { decimals: 0 })}`).join('، ')}`}>
            <div className="mb-1 flex items-center justify-between gap-2 text-sm">
              <span className="font-medium text-ink">{name(r)}</span>
              <span className="text-xs text-ink-soft">{lang === 'ar' ? arCount(r.headcount, EMPLOYEE) : `${num(r.headcount)} staff`}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex h-4 min-w-0 flex-1 items-center">
                <div className="flex h-4 gap-[2px] overflow-hidden rounded-e" style={{ width: `${widths[i].total}%` }}>
                  {COST_SEGMENTS.map((s) => (widths[i][s.key] > 0 ? (
                    <span key={s.key} className="h-full" style={{ flexGrow: r[s.key], flexBasis: 0, background: s.color, opacity: hover === null || hover === i ? 1 : 0.55 }} />
                  ) : null))}
                </div>
                <span className="num whitespace-nowrap ps-2 text-xs font-semibold text-ink">{money(r.total, { decimals: 0 })}</span>
              </div>
            </div>
            {hover === i && (
              <div role="tooltip" className="absolute top-full z-10 mt-1 w-64 rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-lift ltr:left-0 rtl:right-0">
                <p className="mb-1 font-semibold text-ink">{name(r)}</p>
                {COST_SEGMENTS.map((s) => (
                  <p key={s.key} className="flex items-center gap-2 text-ink-muted">
                    <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{lang === 'ar' ? s.label.ar : s.label.en}
                    <span className="num ms-auto font-medium text-ink">{money(r[s.key], { decimals: 0 })}</span>
                  </p>
                ))}
                <p className="mt-1 flex border-t border-line pt-1 text-ink-muted">{t('لكل موظف', 'Per employee')}<span className="num ms-auto font-semibold text-ink">{money(r.perEmployee, { decimals: 0 })}</span></p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function BranchCostsCard() {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const [p, setP] = useState(todayISO().slice(0, 7));
  const { data, loading, error, reload } = useFetch(() => api.get<BranchCosts>('/compliance/branch-costs', { period: p }), [p]);
  const total = data ? { ...data.totals, branchId: '__total', branchName: t('الإجمالي', 'Total') } : null;
  const m = (n: number) => <span className="num">{money(n, { decimals: 0 })}</span>;
  const columns: Column<Row>[] = [
    { key: 'name', header: t('الفرع', 'Branch'), render: (r) => <span className="font-medium text-ink">{r.branchName ?? t('بدون فرع', 'No branch')}</span> },
    { key: 'hc', header: t('الموظفون (سعوديون)', 'Staff (Saudis)'), render: (r) => <span className="num">{num(r.headcount)} <span className="text-ink-soft">({num(r.saudis)})</span></span> },
    { key: 'gross', header: t('إجمالي الرواتب', 'Gross pay'), render: (r) => m(r.gross) },
    { key: 'gosi', header: t('التأمينات (المنشأة)', 'GOSI (employer)'), render: (r) => m(r.gosiEmployer) },
    { key: 'fees', header: t('رسوم حكومية', 'Gov. fees'), render: (r) => m(r.govFees) },
    { key: 'total', header: t('التكلفة الحقيقية', 'True cost'), render: (r) => <span className="num font-semibold text-ink">{money(r.total, { decimals: 0 })}</span> },
    { key: 'per', header: t('لكل موظف', 'Per employee'), render: (r) => m(r.perEmployee) },
  ];
  return (
    <Card>
      <CardHeader
        title={<span className="inline-flex flex-wrap items-center gap-2">{t('التكلفة الحقيقية للعمالة حسب الفرع', 'True labor cost per branch')}
          {data?.estimated && <Badge tone="warning">{t('تقديري', 'Estimated')}</Badge>}</span>}
        subtitle={data?.estimated
          ? t('لا يوجد مسير محتسب لهذا الشهر — من رواتب العقود', 'No calculated run for this month — from contract salaries')
          : <>{t('من قسائم مسير الشهر: الرواتب + حصة المنشأة في التأمينات + الرسوم الحكومية لغير السعوديين', "From the month's payslips: gross + employer GOSI + government fees for non-Saudis")}
              {data?.runId && <> · <Link href={`/app/payroll/${data.runId}`} className="font-medium text-primary-500 hover:underline">{t('عرض المسير', 'View the run')}</Link></>}</>}
        action={<div className="w-40 shrink-0"><Input type="month" aria-label={t('الشهر', 'Month')} value={p} onChange={(e) => e.target.value && setP(e.target.value)} /></div>}
      />
      <Async loading={loading} error={error} onRetry={reload} hasData={!!data}>
        {data && (
          <>
            <CardBody>
              {data.branches.length ? <CostBars rows={data.branches} /> : <EmptyState title={t('لا يوجد موظفون في هذا الشهر', 'No staff in this month')} />}
            </CardBody>
            {data.branches.length > 0 && total && (
              <div className="border-t border-line">
                <Table columns={columns} rows={[...data.branches, total]} rowKey={(r) => r.branchId ?? 'none'} />
              </div>
            )}
            <p className="flex items-start gap-2 border-t border-line px-5 py-3 text-xs text-ink-muted">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" aria-hidden />
              <span>
                {t(`الرسوم الحكومية لكل غير سعودي: المقابل المالي ${money(data.fees.expatLevyMonthly, { decimals: 0 })} شهرياً + رسوم الإقامة ${money(data.fees.iqamaFeeAnnual, { decimals: 0 })} سنوياً (÷ 12) — `,
                  `Government fees per non-Saudi: expat levy ${money(data.fees.expatLevyMonthly, { decimals: 0 })} monthly + iqama fee ${money(data.fees.iqamaFeeAnnual, { decimals: 0 })} yearly (÷ 12) — `)}
                {can(user, ADMIN)
                  ? <Link href="/app/settings" className="font-medium text-primary-500 hover:underline">{lang === 'ar' ? FEES_NOTE.ar : FEES_NOTE.en}</Link>
                  : <span className="font-medium">{lang === 'ar' ? FEES_NOTE.ar : FEES_NOTE.en}</span>}
              </span>
            </p>
          </>
        )}
      </Async>
    </Card>
  );
}

export default function CompliancePage() {
  const { t } = useLang();
  const { data, loading, error, reload } = useFetch(() => api.get<ComplianceOverview>('/compliance/overview'), []);
  return (
    <>
      <PageHeader title={t('مركز الامتثال', 'Compliance center')} subtitle={t('مخاطر خدماتك الحكومية والتكلفة الحقيقية للعمالة في مكان واحد', 'Government-services risk and the true cost of your staff in one place')} />
      <div className="space-y-6">
        <Async loading={loading} error={error} onRetry={reload} hasData={!!data}>
          {data && (
            <div className="space-y-6">
              <Headline o={data} />
              {data.risk.items.length > 0 && (
                <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
                  {data.risk.items.map((i) => <RiskCard key={i.key} item={i} o={data} />)}
                </div>
              )}
              <KeyFigures o={data} />
            </div>
          )}
        </Async>
        <BranchCostsCard />
      </div>
    </>
  );
}
