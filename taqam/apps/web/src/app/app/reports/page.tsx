'use client';
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download } from 'lucide-react';
import { Button, Card, CardBody, CardHeader, EmptyState, Input, PageHeader, Table, useToast, type Column } from '@/components/ui';
import { Async } from '@/components/app/primitives';
import { nationalityLabel } from '@/components/app/EmployeeForm';
import { CHART, SERIES, ChartTooltip, Legend, axisProps, compact, useChartDir } from '@/components/app/charts';
import { addDays, addMonths, errMsg } from '@/components/app/utils';
import { api } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { useLang } from '@/lib/i18n';
import { currentPeriod, minutesToHours, money, num, period, todayISO } from '@/lib/format';
import type { AttendanceReportRow, HeadcountReport, PayrollCostRow } from '@/lib/types';

function ExportBtn({ name, query, label: l }: { name: string; query?: Record<string, string>; label?: string }) {
  const { t } = useLang();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await api.download(`/reports/${name}/export`, `${name}-${todayISO()}.csv`, query); toast(t('تم تنزيل الملف', 'File downloaded')); }
    catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };
  return <Button size="sm" variant="secondary" onClick={go} loading={busy}><Download className="h-4 w-4" />{l ?? 'CSV'}</Button>;
}

export default function ReportsPage() {
  const { t, lang } = useLang();
  const cd = useChartDir();
  const [from, setFrom] = useState(addMonths(currentPeriod(), -11));
  const [to, setTo] = useState(currentPeriod());
  const [aFrom, setAFrom] = useState(addDays(todayISO(), -29));
  const [aTo, setATo] = useState(todayISO());
  const hc = useFetch(() => api.get<HeadcountReport>('/reports/headcount'), []);
  const pc = useFetch(() => api.get<PayrollCostRow[]>('/reports/payroll-cost', { from, to }), [from, to]);
  const at = useFetch(() => api.get<AttendanceReportRow[]>('/reports/attendance', { from: aFrom, to: aTo }), [aFrom, aTo]);

  const flow = useMemo(() => {
    if (!hc.data) return [];
    const m = new Map<string, { period: string; joiners: number; leavers: number }>();
    hc.data.joinersByMonth.forEach((j) => m.set(j.period, { period: j.period, joiners: j.count, leavers: 0 }));
    hc.data.leaversByMonth.forEach((l) => m.set(l.period, { ...(m.get(l.period) ?? { period: l.period, joiners: 0 }), leavers: l.count }));
    return [...m.values()].sort((a, b) => a.period.localeCompare(b.period));
  }, [hc.data]);
  const nat = useMemo(() => {
    const d = [...(hc.data?.byNationality ?? [])].sort((a, b) => b.count - a.count);
    const top = d.slice(0, 6); const rest = d.slice(6).reduce((a, x) => a + x.count, 0);
    return [...top.map((x) => ({ name: nationalityLabel(x.nationality, lang), value: x.count })), ...(rest ? [{ name: t('أخرى', 'Other'), value: rest }] : [])];
  }, [hc.data, lang, t]);
  const gender = (hc.data?.byGender ?? []).map((g) => ({ name: g.gender === 'FEMALE' ? t('إناث', 'Female') : t('ذكور', 'Male'), value: g.count }));
  const pcTotal = (pc.data ?? []).reduce((a, r) => a + r.employerCost, 0);

  const atCols: Column<AttendanceReportRow>[] = [
    { key: 'b', header: t('الفرع', 'Branch'), render: (r) => <span className="font-medium">{r.branchName}</span> },
    { key: 'p', header: t('حضور', 'Present'), render: (r) => <span className="num">{num(r.presentDays)}</span> },
    { key: 'l', header: t('تأخير', 'Late'), render: (r) => <span className="num">{num(r.lateDays)}</span> },
    { key: 'a', header: t('غياب', 'Absent'), render: (r) => <span className="num text-danger">{num(r.absentDays)}</span> },
    { key: 'lm', header: t('دقائق التأخير', 'Late min'), render: (r) => <span className="num">{num(r.lateMinutes)}</span> },
    { key: 'ot', header: t('الإضافي', 'OT'), render: (r) => <span className="num">{minutesToHours(r.overtimeMinutes)}</span> },
    { key: 'h', header: t('ساعات', 'Hours'), render: (r) => <span className="num">{num(r.workedHours)}</span> },
  ];

  return (
    <>
      <PageHeader title={t('التقارير', 'Reports')} subtitle={t('تحليلات القوى العاملة والرواتب والحضور', 'Workforce, payroll and attendance analytics')}
        actions={<ExportBtn name="employees" label={t('تصدير الموظفين', 'Export employees')} />} />
      <div className="space-y-6">
        <Async loading={hc.loading} error={hc.error} onRetry={hc.reload} hasData={!!hc.data}>
          {hc.data && (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <Card className="xl:col-span-2">
                <CardHeader title={t('الموظفون حسب الفرع', 'Headcount by branch')} action={<ExportBtn name="headcount" />} />
                <CardBody>
                  <div dir="ltr" className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={hc.data.byBranch} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                        <CartesianGrid stroke={CHART.grid} vertical={false} />
                        <XAxis dataKey="branchName" reversed={cd.reversed} {...axisProps} interval={0} />
                        <YAxis orientation={cd.yOrientation} {...axisProps} width={32} allowDecimals={false} />
                        <Tooltip cursor={{ fill: '#E8EEEB80' }} content={<ChartTooltip />} />
                        <Bar dataKey="count" name={t('الموظفون', 'Employees')} fill={CHART.primary} radius={[6, 6, 0, 0]} maxBarSize={48} />
                        {hc.data.byBranch.some((b) => b.saudis !== undefined) && <Bar dataKey="saudis" name={t('السعوديون', 'Saudis')} fill={CHART.accent} radius={[6, 6, 0, 0]} maxBarSize={48} />}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardBody>
              </Card>
              <Card>
                <CardHeader title={t('حسب الجنسية', 'By nationality')} />
                <CardBody>
                  <Donut data={nat} />
                </CardBody>
              </Card>
              <Card>
                <CardHeader title={t('حسب الجنس', 'By gender')} />
                <CardBody><Donut data={gender} colors={[CHART.teal, CHART.accent]} /></CardBody>
              </Card>
              <Card>
                <CardHeader title={t('حسب القسم', 'By department')} />
                <CardBody className="space-y-3">
                  {!hc.data.byDepartment.length && <EmptyState />}
                  {hc.data.byDepartment.map((d, i) => {
                    const max = Math.max(...hc.data!.byDepartment.map((x) => x.count), 1);
                    return (
                      <div key={d.name}>
                        <div className="mb-1 flex justify-between text-sm"><span className="text-ink">{d.name}</span><span className="num text-ink-muted">{num(d.count)}</span></div>
                        <div className="h-2 rounded-full bg-sand-200"><div className="h-full rounded-full" style={{ width: `${(d.count / max) * 100}%`, background: SERIES[i % SERIES.length] }} /></div>
                      </div>
                    );
                  })}
                </CardBody>
              </Card>
              <Card>
                <CardHeader title={t('المنضمون والمغادرون', 'Joiners & leavers')} action={<Legend items={[{ label: t('منضمون', 'Joiners'), color: CHART.success }, { label: t('مغادرون', 'Leavers'), color: CHART.danger }]} />} />
                <CardBody>
                  {flow.length ? (
                    <div dir="ltr" className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={flow} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                          <CartesianGrid stroke={CHART.grid} vertical={false} />
                          <XAxis dataKey="period" reversed={cd.reversed} {...axisProps} tickFormatter={(p: string) => period(p, lang).split(' ')[0]} />
                          <YAxis orientation={cd.yOrientation} {...axisProps} width={24} allowDecimals={false} />
                          <Tooltip content={<ChartTooltip labelFormatter={(l) => period(l, lang)} />} />
                          <Line type="monotone" dataKey="joiners" name={t('منضمون', 'Joiners')} stroke={CHART.success} strokeWidth={2} dot={{ r: 3 }} />
                          <Line type="monotone" dataKey="leavers" name={t('مغادرون', 'Leavers')} stroke={CHART.danger} strokeWidth={2} dot={{ r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : <EmptyState />}
                </CardBody>
              </Card>
            </div>
          )}
        </Async>

        <Card>
          <CardHeader title={t('تكلفة الرواتب', 'Payroll cost')} subtitle={`${t('إجمالي تكلفة المنشأة للفترة', 'Total employer cost')}: ${money(pcTotal, { decimals: 0 })}`}
            action={<div className="flex flex-wrap items-center gap-2">
              <Input type="month" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} className="!h-8 w-36 text-xs" />
              <span className="text-ink-soft">—</span>
              <Input type="month" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} className="!h-8 w-36 text-xs" />
              <ExportBtn name="payroll-cost" query={{ from, to }} />
            </div>} />
          <CardBody>
            <Async loading={pc.loading} error={pc.error} onRetry={pc.reload} hasData={!!pc.data}>
              {pc.data?.length ? (
                <>
                  <div className="mb-3"><Legend items={[{ label: t('صافي الرواتب', 'Net'), color: CHART.primary }, { label: t('استقطاعات', 'Deductions'), color: CHART.tealLight }, { label: t('تأمينات المنشأة', 'Employer GOSI'), color: CHART.accent }]} /></div>
                  <div dir="ltr" className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={pc.data.map((r) => ({ ...r, deductions: Math.max(0, r.gross - r.net) }))} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                        <CartesianGrid stroke={CHART.grid} vertical={false} />
                        <XAxis dataKey="period" reversed={cd.reversed} {...axisProps} tickFormatter={(p: string) => period(p, lang)} />
                        <YAxis orientation={cd.yOrientation} {...axisProps} width={48} tickFormatter={compact} />
                        <Tooltip cursor={{ fill: '#E8EEEB80' }} content={<ChartTooltip labelFormatter={(l) => period(l, lang)} valueFormatter={(v) => money(v, { decimals: 0 })} />} />
                        <Bar dataKey="net" stackId="a" name={t('صافي الرواتب', 'Net')} fill={CHART.primary} maxBarSize={44} />
                        <Bar dataKey="deductions" stackId="a" name={t('استقطاعات', 'Deductions')} fill={CHART.tealLight} maxBarSize={44} />
                        <Bar dataKey="gosiEmployer" stackId="a" name={t('تأمينات المنشأة', 'Employer GOSI')} fill={CHART.accent} radius={[6, 6, 0, 0]} maxBarSize={44} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </>
              ) : <EmptyState title={t('لا توجد مسيرات في هذه الفترة', 'No payroll in this range')} />}
            </Async>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t('الحضور حسب الفرع', 'Attendance by branch')}
            action={<div className="flex flex-wrap items-center gap-2">
              <Input type="date" value={aFrom} onChange={(e) => e.target.value && setAFrom(e.target.value)} className="!h-8 w-36 text-xs" />
              <span className="text-ink-soft">—</span>
              <Input type="date" value={aTo} onChange={(e) => e.target.value && setATo(e.target.value)} className="!h-8 w-36 text-xs" />
              <ExportBtn name="attendance" query={{ from: aFrom, to: aTo }} />
            </div>} />
          <Async loading={at.loading} error={at.error} onRetry={at.reload} hasData={!!at.data}>
            {at.data && at.data.length > 0 && (
              <CardBody className="border-b border-line">
                <div dir="ltr" className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={at.data} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                      <CartesianGrid stroke={CHART.grid} vertical={false} />
                      <XAxis dataKey="branchName" reversed={cd.reversed} {...axisProps} interval={0} />
                      <YAxis orientation={cd.yOrientation} {...axisProps} width={36} />
                      <Tooltip cursor={{ fill: '#E8EEEB80' }} content={<ChartTooltip />} />
                      <Bar dataKey="presentDays" name={t('حضور', 'Present')} fill={CHART.teal} radius={[4, 4, 0, 0]} maxBarSize={28} />
                      <Bar dataKey="lateDays" name={t('تأخير', 'Late')} fill={CHART.accent} radius={[4, 4, 0, 0]} maxBarSize={28} />
                      <Bar dataKey="absentDays" name={t('غياب', 'Absent')} fill={CHART.danger} radius={[4, 4, 0, 0]} maxBarSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardBody>
            )}
            <Table columns={atCols} rows={at.data ?? []} rowKey={(r) => r.branchId ?? r.branchName} empty={<EmptyState />} />
          </Async>
        </Card>
      </div>
    </>
  );
}

function Donut({ data, colors = SERIES }: { data: { name: string; value: number }[]; colors?: string[] }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  if (!total) return <EmptyState />;
  return (
    <div>
      <div className="relative h-48" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="90%" paddingAngle={2} stroke="none">
              {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="num text-2xl font-bold text-ink">{num(total)}</span></div>
      </div>
      <ul className="mt-3 space-y-1.5">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: colors[i % colors.length] }} />
            <span className="flex-1 text-ink-muted">{d.name}</span>
            <span className="num font-medium">{num(d.value)}</span>
            <span className="num w-12 text-end text-xs text-ink-soft">{((d.value / total) * 100).toFixed(0)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
