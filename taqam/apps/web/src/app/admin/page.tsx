'use client';
import clsx from 'clsx';
import Link from 'next/link';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowLeft, BellRing, Building2, CalendarClock, CheckCircle2, Hourglass, TrendingUp, UserPlus, Users, Wallet } from 'lucide-react';
import { Button, ButtonLink, Card, CardBody, CardHeader, EmptyState, ErrorState, PageHeader, Spinner, StatCard } from '@/components/ui';
import { Async } from '@/components/app/primitives';
import { CHART, ChartTooltip, axisProps, useChartDir } from '@/components/app/charts';
import { ActivateModal, ExtendModal } from '@/components/admin/CompanyModals';
import { CompanyStatusChip, DaysLeft, PlanBadge, timeAgo } from '@/components/admin/primitives';
import { api, type Paginated } from '@/lib/api';
import { useLang } from '@/lib/i18n';
import { useFetch } from '@/lib/useFetch';
import { money, num, period } from '@/lib/format';
import { label, SECTOR } from '@/lib/labels';
import { COMPANY_STATUSES, COMPANY_STATUS, PLAN, PLAN_COLOR, companyName, lbl, type AdminCompany, type AdminOverview, type CompanyStatus, type Lead } from '@/lib/adminTypes';

const STATUS_BOX: Record<CompanyStatus, string> = {
  PENDING: 'border-warning/40 bg-warning-50', TRIAL: 'border-info/30 bg-info-50', ACTIVE: 'border-success/30 bg-success-50',
  SUSPENDED: 'border-danger/30 bg-danger-50', EXPIRED: 'border-line bg-sand-200/60',
};
const STATUS_KEY: Record<CompanyStatus, keyof AdminOverview['companies']> = { PENDING: 'pending', TRIAL: 'trial', ACTIVE: 'active', SUSPENDED: 'suspended', EXPIRED: 'expired' };

export default function AdminOverviewPage() {
  const { t, lang } = useLang();
  const cd = useChartDir();
  const ov = useFetch(() => api.get<AdminOverview>('/admin/overview'), []);
  const pending = useFetch(() => api.get<Paginated<AdminCompany>>('/admin/companies', { status: 'PENDING', sort: 'createdAt', pageSize: 8 }), []);
  const leads = useFetch(() => api.get<Paginated<Lead>>('/admin/leads', { status: 'NEW', pageSize: 4 }), []);
  const [activate, setActivate] = useState<AdminCompany | null>(null);
  const [extend, setExtend] = useState<AdminCompany | null>(null);
  const reloadAll = () => { void ov.reload(); void pending.reload(); };
  const d = ov.data;

  return (
    <div>
      <PageHeader title={t('نظرة عامة على المنصة', 'Platform overview')} subtitle={t('صحة الاشتراكات والإيرادات وما يحتاج إجراءك اليوم', 'Subscriptions, revenue and what needs your action today')} />
      <Async loading={ov.loading} error={ov.error} onRetry={ov.reload} hasData={!!d}>
        {d && (
          <div className="space-y-6">
            {/* Needs action */}
            <Card className="overflow-hidden border-warning/40">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-warning-50/60 px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <BellRing className="h-5 w-5 text-warning" />
                  <h2 className="text-base font-bold text-ink">{t('تحتاج إجراء', 'Needs action')}</h2>
                  <span className="num rounded-full bg-warning px-2 text-xs font-bold text-[#0C1F24]">{d.companies.pending + d.expiringSoon.length + d.newLeads}</span>
                </div>
                <p className="text-xs text-ink-muted">{t('موافقات معلّقة، اشتراكات توشك على الانتهاء، وعملاء جدد', 'Pending approvals, expiring subscriptions and new leads')}</p>
              </div>
              <div className="grid divide-y divide-line lg:grid-cols-[1.4fr_1fr_0.8fr] lg:divide-y-0 lg:[&>*+*]:border-s lg:[&>*+*]:border-line">
                {/* Pending approvals */}
                <section className="p-5">
                  <SectionHead icon={<Hourglass className="h-4 w-4" />} title={t('بانتظار الموافقة', 'Pending approval')} count={d.companies.pending} href="/admin/companies?status=PENDING" />
                  {!pending.data && pending.loading && <div className="flex justify-center py-6"><Spinner /></div>}
                  {!pending.data && pending.error && <ErrorState message={pending.error} onRetry={pending.reload} />}
                    {pending.data && (pending.data.data.length ? (
                      <ul className="space-y-2">
                        {pending.data.data.map((c) => (
                          <li key={c.id} className="flex items-center gap-3 rounded-xl border border-line bg-white p-3">
                            <div className="min-w-0 flex-1">
                              <Link href={`/admin/companies/${c.id}`} className="block truncate text-sm font-semibold text-ink hover:text-primary-500">{companyName(c, lang)}</Link>
                              <p className="truncate text-xs text-ink-soft">
                                {c.ownerName || '—'} · {label(SECTOR, c.sector, lang)} · {timeAgo(c.createdAt, lang)}
                              </p>
                            </div>
                            <Button size="sm" onClick={() => setActivate(c)}><CheckCircle2 className="h-4 w-4" />{t('تفعيل', 'Activate')}</Button>
                          </li>
                        ))}
                      </ul>
                    ) : <AllClear text={t('لا توجد طلبات معلّقة', 'No pending requests')} />)}
                </section>
                {/* Expiring soon */}
                <section className="p-5">
                  <SectionHead icon={<CalendarClock className="h-4 w-4" />} title={t('تنتهي خلال 14 يوماً', 'Ending within 14 days')} count={d.expiringSoon.length} />
                  {d.expiringSoon.length ? (
                    <ul className="divide-y divide-line/70">
                      {d.expiringSoon.slice(0, 6).map((c) => (
                        <li key={c.id} className="flex items-center gap-2 py-2.5">
                          <div className="min-w-0 flex-1">
                            <Link href={`/admin/companies/${c.id}`} className="block truncate text-sm font-medium text-ink hover:text-primary-500">{companyName(c, lang)}</Link>
                            <div className="mt-0.5 flex items-center gap-2"><CompanyStatusChip status={c.status} /><DaysLeft days={c.daysLeft} /></div>
                          </div>
                          <Button size="sm" variant="secondary" onClick={() => setExtend(c)}>{t('تمديد', 'Extend')}</Button>
                        </li>
                      ))}
                    </ul>
                  ) : <AllClear text={t('لا اشتراكات توشك على الانتهاء', 'Nothing expiring soon')} />}
                </section>
                {/* New leads */}
                <section className="p-5">
                  <SectionHead icon={<UserPlus className="h-4 w-4" />} title={t('عملاء محتملون جدد', 'New leads')} count={d.newLeads} href="/admin/leads" />
                  {leads.data?.data.length ? (
                    <ul className="space-y-2">
                      {leads.data.data.map((l) => (
                        <li key={l.id} className="rounded-xl bg-sand/70 px-3 py-2">
                          <p className="truncate text-sm font-medium text-ink">{l.company || l.name}</p>
                          <p className="truncate text-xs text-ink-soft">{l.name}{l.employeesCount ? ` · ${t(`${l.employeesCount} موظف`, `${l.employeesCount} employees`)}` : ''} · {timeAgo(l.createdAt, lang)}</p>
                        </li>
                      ))}
                    </ul>
                  ) : <AllClear text={t('لا عملاء جدد', 'No new leads')} />}
                </section>
              </div>
            </Card>

            {/* KPIs */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
              <StatCard className="col-span-2 xl:col-span-1" label={t('الإيراد الشهري المتكرر (MRR)', 'MRR')} value={money(d.mrr, { decimals: 0 })} hint={t(`سنوي (ARR): ${money(d.arr, { decimals: 0 })}`, `ARR: ${money(d.arr, { decimals: 0 })}`)} icon={<Wallet className="h-5 w-5" />} tone="accent" />
              <StatCard label={t('المنشآت', 'Companies')} value={num(d.companies.total)} hint={t(`${d.companies.active} نشطة · ${d.companies.trial} تجريبية`, `${d.companies.active} active · ${d.companies.trial} trial`)} icon={<Building2 className="h-5 w-5" />} />
              <StatCard label={t('الموظفون على المنصة', 'Employees on platform')} value={num(d.employees)} icon={<Users className="h-5 w-5" />} tone="info" />
              <StatCard label={t('المستخدمون', 'Users')} value={num(d.users)} icon={<TrendingUp className="h-5 w-5" />} tone="success" />
            </div>

            {/* Status strip */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {COMPANY_STATUSES.map((s) => (
                <Link key={s} href={`/admin/companies?status=${s}`} className={clsx('rounded-xl border px-4 py-3 transition-shadow hover:shadow-soft', STATUS_BOX[s])}>
                  <CompanyStatusChip status={s} className="bg-white/70" />
                  <p className="num mt-2 text-2xl font-bold text-ink">{num(d.companies[STATUS_KEY[s]])}</p>
                  <p className="sr-only">{lbl(COMPANY_STATUS, s, lang)}</p>
                </Link>
              ))}
            </div>

            {/* Charts */}
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader title={t('التسجيلات الجديدة', 'New signups')} subtitle={t('آخر 12 شهراً', 'Last 12 months')} />
                <CardBody>
                  <div dir="ltr" className="h-60">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={d.signupsByMonth} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                        <CartesianGrid stroke={CHART.grid} vertical={false} />
                        <XAxis dataKey="period" reversed={cd.reversed} {...axisProps} minTickGap={4} tickFormatter={(p: string) => period(p, lang).split(' ')[0].slice(0, lang === 'ar' ? 6 : 3)} />
                        <YAxis orientation={cd.yOrientation} {...axisProps} width={28} allowDecimals={false} />
                        <Tooltip cursor={{ fill: '#E8EEEB80' }} content={<ChartTooltip labelFormatter={(l) => period(l, lang)} />} />
                        <Bar dataKey="count" name={t('منشآت جديدة', 'New companies')} fill={CHART.teal} radius={[6, 6, 0, 0]} maxBarSize={26} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardBody>
              </Card>
              <Card>
                <CardHeader title={t('الإيراد حسب الباقة', 'MRR by plan')} subtitle={t('المنشآت النشطة فقط', 'Active companies only')} />
                <CardBody>
                  <MrrByPlan rows={d.mrrByPlan} total={d.mrr} />
                </CardBody>
              </Card>
            </div>

            {/* Recent signups */}
            <Card>
              <CardHeader title={t('أحدث المنشآت المسجلة', 'Recent signups')} action={<ButtonLink href="/admin/companies" size="sm" variant="ghost">{t('كل المنشآت', 'All companies')}<ArrowLeft className="h-4 w-4 ltr:rotate-180" /></ButtonLink>} />
              {d.recentSignups.length ? (
                <ul className="divide-y divide-line/70">
                  {d.recentSignups.map((c) => (
                    <li key={c.id}>
                      <Link href={`/admin/companies/${c.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-primary-50/40">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink">{companyName(c, lang)}</span>
                          <span className="block truncate text-xs text-ink-soft">{c.ownerName} · {c.city || label(SECTOR, c.sector, lang)}</span>
                        </span>
                        <span className="hidden sm:inline-flex"><PlanBadge plan={c.plan} /></span>
                        <CompanyStatusChip status={c.status} />
                        <span className="hidden w-24 text-end text-xs text-ink-soft sm:block">{timeAgo(c.createdAt, lang)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState />}
            </Card>
          </div>
        )}
      </Async>
      <ActivateModal company={activate} open={!!activate} onClose={() => setActivate(null)} onDone={reloadAll} />
      <ExtendModal company={extend} open={!!extend} onClose={() => setExtend(null)} onDone={reloadAll} />
    </div>
  );
}

function SectionHead({ icon, title, count, href }: { icon: React.ReactNode; title: string; count: number; href?: string }) {
  const { t } = useLang();
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
        <span className="text-ink-soft">{icon}</span>{title}
        <span className="num rounded-full bg-sand-200 px-2 text-xs text-ink-muted">{count}</span>
      </h3>
      {href && <Link href={href} className="whitespace-nowrap text-xs font-medium text-primary-500 hover:underline">{t('عرض الكل', 'View all')}</Link>}
    </div>
  );
}

function AllClear({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-success-50 px-3 py-3 text-sm text-success">
      <CheckCircle2 className="h-4 w-4" />{text}
    </div>
  );
}

function MrrByPlan({ rows, total }: { rows: AdminOverview['mrrByPlan']; total: number }) {
  const { t, lang } = useLang();
  if (!rows.length) return <EmptyState title={t('لا توجد إيرادات بعد', 'No revenue yet')} />;
  const max = Math.max(1, ...rows.map((r) => r.mrr));
  return (
    <div className="space-y-4">
      {rows.map((r) => (
        <div key={r.plan}>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2 font-medium text-ink">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: PLAN_COLOR[r.plan] ?? CHART.teal }} />
              {lbl(PLAN, r.plan, lang)}
            </span>
            <span className="num text-ink">{money(r.mrr, { decimals: 0 })}</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-sand-200">
            <div className="h-full rounded-full" style={{ width: `${Math.max(2, (r.mrr / max) * 100)}%`, background: PLAN_COLOR[r.plan] ?? CHART.teal }} />
          </div>
          <p className="mt-1 text-[11px] text-ink-soft">
            {t(`${r.companies} منشأة`, `${r.companies} companies`)} · {total ? `${((r.mrr / total) * 100).toFixed(0)}%` : '0%'}
          </p>
        </div>
      ))}
      <div className="flex items-center justify-between border-t border-line pt-3 text-sm">
        <span className="text-ink-muted">{t('الإجمالي', 'Total')}</span>
        <span className="num font-bold text-ink">{money(total, { decimals: 0 })} <span className="text-xs font-normal text-ink-soft">/ {t('شهر', 'mo')}</span></span>
      </div>
    </div>
  );
}
