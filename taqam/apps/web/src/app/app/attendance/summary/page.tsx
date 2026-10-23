'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Card, EmptyState, Input, PageHeader, Select, StatCard, Table, type Column } from '@/components/ui';
import { Async, FilterBar, SearchInput } from '@/components/app/primitives';
import { SubNav, ATTENDANCE_NAV } from '@/components/app/SubNav';
import { useBranches } from '@/components/app/hooks';
import { addDays } from '@/components/app/utils';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFetch } from '@/lib/useFetch';
import { useLang } from '@/lib/i18n';
import { minutesToHours, num, todayISO } from '@/lib/format';
import type { AttendanceSummaryRow } from '@/lib/types';

type SortKey = 'employeeName' | 'presentDays' | 'lateDays' | 'absentDays' | 'lateMinutes' | 'overtimeMinutes' | 'workedHours';

export default function AttendanceSummaryPage() {
  const { t } = useLang();
  const { user } = useAuth();
  const [from, setFrom] = useState(todayISO().slice(0, 8) + '01');
  const [to, setTo] = useState(todayISO());
  const [branchId, setBranchId] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: 'absentDays', dir: -1 });
  const { options: branchOpts } = useBranches();
  const { data, loading, error, reload } = useFetch(() => api.get<AttendanceSummaryRow[]>('/attendance/summary', { from, to, branchId }), [from, to, branchId]);

  const rows = useMemo(() => {
    const r = (data ?? []).filter((x) => !q || x.employeeName.toLowerCase().includes(q.toLowerCase()));
    return [...r].sort((a, b) => {
      const av = a[sort.k]; const bv = b[sort.k];
      return (typeof av === 'string' ? av.localeCompare(String(bv)) : Number(av) - Number(bv)) * sort.dir;
    });
  }, [data, q, sort]);
  const tot = useMemo(() => (data ?? []).reduce((a, r) => ({
    present: a.present + r.presentDays, late: a.late + r.lateDays, absent: a.absent + r.absentDays, ot: a.ot + r.overtimeMinutes, hours: a.hours + r.workedHours,
  }), { present: 0, late: 0, absent: 0, ot: 0, hours: 0 }), [data]);

  const h = (k: SortKey, l: string) => (
    <button className="inline-flex items-center gap-1 hover:text-primary" onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : -1 }))}>
      {l}{sort.k === k && <span className="text-[10px]">{sort.dir === 1 ? '▲' : '▼'}</span>}
    </button>
  );
  const columns: Column<AttendanceSummaryRow>[] = [
    { key: 'name', header: h('employeeName', t('الموظف', 'Employee')), render: (r) => <Link href={`/app/employees/${r.employeeId}?tab=attendance`} className="font-medium text-ink hover:text-primary-500">{r.employeeName}</Link> },
    { key: 'p', header: h('presentDays', t('حضور', 'Present')), render: (r) => <span className="num text-success">{num(r.presentDays)}</span> },
    { key: 'l', header: h('lateDays', t('تأخير', 'Late')), render: (r) => <span className="num text-[#9a7400]">{num(r.lateDays)}</span> },
    { key: 'a', header: h('absentDays', t('غياب', 'Absent')), render: (r) => <span className={`num ${r.absentDays ? 'font-semibold text-danger' : ''}`}>{num(r.absentDays)}</span> },
    { key: 'lm', header: h('lateMinutes', t('دقائق التأخير', 'Late min')), render: (r) => <span className="num">{num(r.lateMinutes)}</span> },
    { key: 'ot', header: h('overtimeMinutes', t('الإضافي', 'Overtime')), render: (r) => <span className="num text-info">{minutesToHours(r.overtimeMinutes)}</span> },
    { key: 'wh', header: h('workedHours', t('ساعات العمل', 'Hours')), render: (r) => <span className="num">{num(r.workedHours, 1)}</span> },
  ];

  return (
    <>
      <PageHeader title={t('ملخص الحضور', 'Attendance summary')} subtitle={t('إحصاءات الحضور لكل موظف خلال فترة', 'Per-employee attendance over a period')} />
      <SubNav items={ATTENDANCE_NAV} />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label={t('أيام الحضور', 'Present days')} value={num(tot.present)} tone="success" />
        <StatCard label={t('أيام التأخير', 'Late days')} value={num(tot.late)} tone="accent" />
        <StatCard label={t('أيام الغياب', 'Absent days')} value={num(tot.absent)} tone="danger" />
        <StatCard label={t('ساعات إضافية', 'Overtime')} value={minutesToHours(tot.ot)} tone="info" />
        <StatCard label={t('ساعات العمل', 'Worked hours')} value={num(tot.hours)} className="col-span-2 lg:col-span-1" />
      </div>
      <Card>
        <FilterBar>
          <div className="flex items-center gap-2">
            <Input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} className="w-40" />
            <span className="text-ink-soft">—</span>
            <Input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} className="w-40" />
          </div>
          <Select value="" onChange={(e) => { const d = Number(e.target.value); if (d) { setTo(todayISO()); setFrom(addDays(todayISO(), -d + 1)); } }} className="sm:w-36"
            options={[{ value: '7', label: t('آخر 7 أيام', 'Last 7 days') }, { value: '30', label: t('آخر 30 يوماً', 'Last 30 days') }, { value: '90', label: t('آخر 90 يوماً', 'Last 90 days') }]} placeholder={t('فترة سريعة', 'Quick range')} />
          {user?.role !== 'BRANCH_MANAGER' && <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} options={branchOpts} placeholder={t('كل الفروع', 'All branches')} className="sm:w-44" />}
          <SearchInput value={q} onChange={setQ} placeholder={t('بحث', 'Search')} className="sm:w-52" />
        </FilterBar>
        <Async loading={loading} error={error} onRetry={reload} hasData={!!data}>
          <Table columns={columns} rows={rows} rowKey={(r) => r.employeeId} empty={<EmptyState />} />
        </Async>
      </Card>
    </>
  );
}
