'use client';
import Link from 'next/link';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowLeft, CalendarCheck, Clock, FileWarning, Inbox, UserCheck, Users, Wallet, Activity, Flag } from 'lucide-react';
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, StatCard, ButtonLink } from '@/components/ui';
import { Async, Avatar, BAND_COLOR, Gauge, StatusBadge } from '@/components/app/primitives';
import { CHART, ChartTooltip, Legend, axisProps, compact, useChartDir, activityText } from '@/components/app/charts';
import { timeAgo } from '@/components/app/AppShell';
import { can, ADMIN, ADMIN_BM, ADMIN_PAYROLL } from '@/components/app/utils';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFetch } from '@/lib/useFetch';
import { useLang } from '@/lib/i18n';
import { date, money, num, pct, period } from '@/lib/format';
import { DOC_TYPE, EXPIRY_STATUS, NITAQAT_BAND, label } from '@/lib/labels';
import type { DashboardData } from '@/lib/types';

export default function DashboardPage() {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const { data, loading, error, reload } = useFetch(() => api.get<DashboardData>('/dashboard'), []);
  const cd = useChartDir();
  const hour = new Date().getHours();
  const greet = hour < 12 ? t('صباح الخير', 'Good morning') : t('مساء الخير', 'Good evening');
  const firstName = user?.name.split(' ')[0] ?? '';

  return (
    <>
      <PageHeader title={`${greet}، ${firstName}`} subtitle={t('نظرة سريعة على منشأتك اليوم', 'A quick look at your company today')}
        actions={can(user, ADMIN) ? <ButtonLink href="/app/employees?new=1" variant="accent">{t('إضافة موظف', 'Add employee')}</ButtonLink> : undefined} />
      <Async loading={loading} error={error} onRetry={reload} hasData={!!data}>
        {data && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label={t('إجمالي الموظفين', 'Headcount')} value={num(data.headcount)} icon={<Users className="h-5 w-5" />}
                hint={`${num(data.saudis)} ${t('سعودي', 'Saudi')} · ${num(data.nonSaudis)} ${t('غير سعودي', 'non-Saudi')}`} />
              <StatCard label={t('الحاضرون اليوم', 'Present today')} value={num(data.presentToday)} tone="success" icon={<UserCheck className="h-5 w-5" />}
                hint={`${num(data.lateToday)} ${t('متأخر', 'late')} · ${num(data.absentToday)} ${t('غائب', 'absent')} · ${num(data.onLeaveToday)} ${t('إجازة', 'on leave')}`} />
              <StatCard label={t('طلبات بانتظار الاعتماد', 'Pending approvals')} value={num(data.pendingLeaves + data.pendingRequests)} tone="accent" icon={<Inbox className="h-5 w-5" />}
                hint={`${num(data.pendingLeaves)} ${t('إجازة', 'leaves')} · ${num(data.pendingRequests)} ${t('طلب', 'requests')}`} />
              <StatCard label={t('تكلفة الرواتب الشهرية', 'Monthly payroll cost')} value={money(data.monthlyPayrollCost, { decimals: 0 })} tone="info" icon={<Wallet className="h-5 w-5" />}
                hint={t('الإجمالي + حصة المنشأة في التأمينات', 'Gross + employer GOSI')} />
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <Card className="xl:col-span-2">
                <CardHeader title={t('الحضور خلال 14 يوماً', 'Attendance — last 14 days')}
                  action={<Legend items={[{ label: t('حاضر', 'Present'), color: CHART.teal }, { label: t('متأخر', 'Late'), color: CHART.accent }, { label: t('غائب', 'Absent'), color: CHART.danger }]} />} />
                <CardBody>
                  {data.attendanceTrend.length ? (
                    <div dir="ltr" className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data.attendanceTrend} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                          <defs>
                            <linearGradient id="gPresent" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={CHART.teal} stopOpacity={0.35} /><stop offset="100%" stopColor={CHART.teal} stopOpacity={0} /></linearGradient>
                          </defs>
                          <CartesianGrid stroke={CHART.grid} vertical={false} />
                          <XAxis dataKey="date" reversed={cd.reversed} {...axisProps} tickFormatter={(d: string) => d.slice(8, 10) + '/' + d.slice(5, 7)} />
                          <YAxis orientation={cd.yOrientation} {...axisProps} width={32} allowDecimals={false} />
                          <Tooltip content={<ChartTooltip labelFormatter={(l) => date(l, lang)} />} />
                          <Area type="monotone" dataKey="present" name={t('حاضر', 'Present')} stroke={CHART.teal} strokeWidth={2} fill="url(#gPresent)" />
                          <Area type="monotone" dataKey="late" name={t('متأخر', 'Late')} stroke={CHART.accent} strokeWidth={2} fill="transparent" />
                          <Area type="monotone" dataKey="absent" name={t('غائب', 'Absent')} stroke={CHART.danger} strokeWidth={2} fill="transparent" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  ) : <EmptyState />}
                </CardBody>
              </Card>

              <Card>
                <CardHeader title={t('نسبة السعودة', 'Saudization')} subtitle={t('نطاقات — مستوى المنشأة', 'Nitaqat — company level')}
                  action={<Flag className="h-5 w-5 text-accent" />} />
                <CardBody className="flex flex-col items-center gap-3">
                  <Gauge value={data.saudizationRate} color={BAND_COLOR[data.nitaqatBand]} label={`${num(data.saudis)} / ${num(data.headcount)}`} />
                  <span className="rounded-full px-3 py-1 text-sm font-semibold text-white" style={{ background: BAND_COLOR[data.nitaqatBand] }}>
                    {label(NITAQAT_BAND, data.nitaqatBand, lang)}
                  </span>
                  {can(user, ADMIN) && <Link href="/app/saudization" className="text-sm font-medium text-primary-500 hover:underline">{t('محاكاة أثر التوظيف', 'Simulate hiring impact')}</Link>}
                </CardBody>
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <Card>
                <CardHeader title={t('اتجاه الرواتب', 'Payroll trend')} subtitle={t('آخر 6 مسيرات', 'Last 6 runs')}
                  action={<Legend items={[{ label: t('الإجمالي', 'Gross'), color: CHART.primary }, { label: t('الصافي', 'Net'), color: CHART.accent }]} />} />
                <CardBody>
                  {data.payrollTrend.length ? (
                    <div dir="ltr" className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.payrollTrend} margin={{ top: 5, right: 5, left: 5, bottom: 0 }} barGap={4}>
                          <CartesianGrid stroke={CHART.grid} vertical={false} />
                          <XAxis dataKey="period" reversed={cd.reversed} {...axisProps} tickFormatter={(p: string) => period(p, lang)} />
                          <YAxis orientation={cd.yOrientation} {...axisProps} width={44} tickFormatter={compact} />
                          <Tooltip cursor={{ fill: '#F1E9DB80' }} content={<ChartTooltip labelFormatter={(l) => period(l, lang)} valueFormatter={(v) => money(v, { decimals: 0 })} />} />
                          <Bar dataKey="gross" name={t('الإجمالي', 'Gross')} fill={CHART.primary} radius={[6, 6, 0, 0]} maxBarSize={28} />
                          <Bar dataKey="net" name={t('الصافي', 'Net')} fill={CHART.accent} radius={[6, 6, 0, 0]} maxBarSize={28} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : <EmptyState title={t('لا توجد مسيرات بعد', 'No payroll runs yet')} />}
                </CardBody>
              </Card>

              <Card>
                <CardHeader title={t('الموظفون حسب الفرع', 'Headcount by branch')}
                  action={<Legend items={[{ label: t('سعودي', 'Saudi'), color: CHART.teal }, { label: t('غير سعودي', 'Non-Saudi'), color: '#E6DAC5' }]} />} />
                <CardBody className="space-y-4">
                  {!data.headcountByBranch.length && <EmptyState />}
                  {data.headcountByBranch.map((b) => {
                    const max = Math.max(...data.headcountByBranch.map((x) => x.count), 1);
                    const rate = b.count ? (b.saudis / b.count) * 100 : 0;
                    return (
                      <div key={b.branchId}>
                        <div className="mb-1.5 flex items-center justify-between text-sm">
                          <span className="font-medium text-ink">{b.branchName}</span>
                          <span className="num text-ink-muted">{num(b.count)} · <span className="text-primary-500">{pct(rate)}</span></span>
                        </div>
                        <div className="flex h-3 overflow-hidden rounded-full bg-sand-200" style={{ width: `${Math.max(8, (b.count / max) * 100)}%` }}>
                          <div className="h-full bg-primary-500" style={{ width: `${rate}%` }} />
                          <div className="h-full flex-1 bg-sand-300" />
                        </div>
                      </div>
                    );
                  })}
                </CardBody>
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <Card>
                <CardHeader title={t('بانتظار اعتمادك', 'Awaiting your approval')} action={<Clock className="h-5 w-5 text-accent" />} />
                <CardBody className="space-y-3">
                  <PendingRow href={can(user, ADMIN_BM) ? '/app/leaves' : undefined} icon={<CalendarCheck className="h-5 w-5" />} label={t('طلبات إجازة', 'Leave requests')} count={data.pendingLeaves} />
                  <PendingRow href={can(user, ADMIN_BM) ? '/app/requests' : undefined} icon={<Inbox className="h-5 w-5" />} label={t('طلبات الموظفين', 'Employee requests')} count={data.pendingRequests} />
                  {can(user, ADMIN_PAYROLL) && <PendingRow href="/app/payroll" icon={<Wallet className="h-5 w-5" />} label={t('مسيرات الرواتب', 'Payroll runs')} />}
                </CardBody>
              </Card>

              <Card>
                <CardHeader title={t('مستندات تنتهي قريباً', 'Expiring documents')} action={<FileWarning className="h-5 w-5 text-danger" />} />
                <div className="max-h-80 divide-y divide-line overflow-y-auto">
                  {!data.expiringDocuments.length && <EmptyState title={t('لا مستندات منتهية', 'All documents valid')} />}
                  {data.expiringDocuments.slice(0, 8).map((d, i) => (
                    <Link key={`${d.employeeId}-${d.type}-${i}`} href={`/app/employees/${d.employeeId}?tab=documents`} className="flex items-center gap-3 px-5 py-3 hover:bg-sand/60">
                      <Avatar name={d.employeeName} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{d.employeeName}</p>
                        <p className="text-xs text-ink-soft">{label(DOC_TYPE, d.type, lang)} · {date(d.expiryDate, lang)}</p>
                      </div>
                      <StatusBadge map={EXPIRY_STATUS} value={d.status} />
                    </Link>
                  ))}
                </div>
                {data.expiringDocuments.length > 0 && can(user, ADMIN) && (
                  <Link href="/app/documents" className="block border-t border-line px-5 py-3 text-center text-sm font-medium text-primary-500 hover:bg-sand/60">{t('عرض الكل', 'View all')}</Link>
                )}
              </Card>

              <Card>
                <CardHeader title={t('آخر النشاطات', 'Recent activity')} action={<Activity className="h-5 w-5 text-info" />} />
                <ul className="max-h-80 overflow-y-auto px-5 py-3">
                  {!data.recentActivity.length && <EmptyState />}
                  {data.recentActivity.slice(0, 10).map((a) => (
                    <li key={a.id} className="relative border-s-2 border-line pb-4 ps-4 last:pb-1">
                      <span className="absolute -start-[5px] top-1.5 h-2 w-2 rounded-full bg-accent" />
                      <p className="text-sm text-ink"><span className="font-medium">{a.userName || t('النظام', 'System')}</span> — {activityText(a.action, a.entity, lang)}</p>
                      <p className="text-xs text-ink-soft">{timeAgo(a.createdAt, lang)}</p>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>

            {data.headcountByDepartment.length > 0 && (
              <Card>
                <CardHeader title={t('الموظفون حسب القسم', 'Headcount by department')} />
                <CardBody className="flex flex-wrap gap-2">
                  {data.headcountByDepartment.map((d) => (
                    <Badge key={d.departmentId} tone="primary" className="!px-3 !py-1.5 !text-sm">{d.name} <span className="num font-bold">{num(d.count)}</span></Badge>
                  ))}
                </CardBody>
              </Card>
            )}
          </div>
        )}
      </Async>
    </>
  );
}

function PendingRow({ href, icon, label: lbl, count }: { href?: string; icon: React.ReactNode; label: string; count?: number }) {
  const inner = (
    <>
      <span className="rounded-xl bg-accent-100 p-2 text-accent-600">{icon}</span>
      <span className="flex-1 text-sm font-medium text-ink">{lbl}</span>
      {count !== undefined && <span className="num rounded-full bg-primary px-2.5 py-0.5 text-sm font-bold text-white">{num(count)}</span>}
      {href && <ArrowLeft className="h-4 w-4 text-ink-soft ltr:rotate-180" />}
    </>
  );
  return href
    ? <Link href={href} className="flex items-center gap-3 rounded-xl border border-line p-3 transition-colors hover:border-primary-500 hover:bg-primary-50">{inner}</Link>
    : <div className="flex items-center gap-3 rounded-xl border border-line p-3">{inner}</div>;
}
