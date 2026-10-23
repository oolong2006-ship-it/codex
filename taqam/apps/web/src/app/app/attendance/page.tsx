'use client';
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Plus } from 'lucide-react';
import { Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Table, Textarea, type Column } from '@/components/ui';
import { Async, Avatar, Chips, FilterBar, SearchInput, StatusBadge } from '@/components/app/primitives';
import { SubNav, ATTENDANCE_NAV } from '@/components/app/SubNav';
import { useBranches, useEmployeeOptions } from '@/components/app/hooks';
import { addDays, hhmmOf, toIsoDateTime, useAction } from '@/components/app/utils';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFetch } from '@/lib/useFetch';
import { useLang } from '@/lib/i18n';
import { date, minutesToHours, num, time, todayISO } from '@/lib/format';
import { ATTENDANCE_STATUS, label } from '@/lib/labels';
import type { AttendanceRow } from '@/lib/types';

const STATUSES = ['PRESENT', 'LATE', 'ABSENT', 'ON_LEAVE', 'INCOMPLETE', 'OFF'] as const;

export default function AttendancePage() {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const [day, setDay] = useState(todayISO());
  const [branchId, setBranchId] = useState('');
  const [status, setStatus] = useState<string>('ALL');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<AttendanceRow | 'new' | null>(null);
  const { options: branchOpts } = useBranches();
  const { data, loading, error, reload } = useFetch(() => api.get<AttendanceRow[]>('/attendance', { date: day, branchId }), [day, branchId]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    (data ?? []).forEach((r) => { c[r.status] = (c[r.status] ?? 0) + 1; });
    return c;
  }, [data]);
  const rows = (data ?? []).filter((r) => (status === 'ALL' || r.status === status) && (!q || r.employeeName.toLowerCase().includes(q.toLowerCase())));
  const isBM = user?.role === 'BRANCH_MANAGER';

  const columns: Column<AttendanceRow>[] = [
    { key: 'emp', header: t('الموظف', 'Employee'), render: (r) => (
      <div className="flex items-center gap-2.5"><Avatar name={r.employeeName} size="sm" /><div><p className="font-medium text-ink">{r.employeeName}</p>{!isBM && <p className="text-xs text-ink-soft">{r.branchName ?? ''}</p>}</div></div>
    ) },
    { key: 'shift', header: t('الوردية', 'Shift'), render: (r) => <span className="text-ink-muted">{r.shiftName || '—'}</span> },
    { key: 'in', header: t('الدخول', 'In'), render: (r) => <span className="num">{time(r.checkIn)}</span> },
    { key: 'out', header: t('الخروج', 'Out'), render: (r) => <span className="num">{time(r.checkOut)}</span> },
    { key: 'worked', header: t('ساعات العمل', 'Worked'), render: (r) => <span className="num">{r.workedMinutes ? minutesToHours(r.workedMinutes) : '—'}</span> },
    { key: 'late', header: t('التأخير', 'Late'), render: (r) => r.lateMinutes ? <span className="num text-[#9a7400]">{num(r.lateMinutes)} {t('د', 'm')}</span> : <span className="text-ink-soft">—</span> },
    { key: 'ot', header: t('إضافي', 'OT'), render: (r) => r.overtimeMinutes ? <span className="num text-info">{minutesToHours(r.overtimeMinutes)}</span> : <span className="text-ink-soft">—</span> },
    { key: 'status', header: t('الحالة', 'Status'), render: (r) => <StatusBadge map={ATTENDANCE_STATUS} value={r.status} /> },
    { key: 'act', header: '', className: 'text-end', render: (r) => (
      <button onClick={() => setEdit(r)} className="rounded-lg p-1.5 text-ink-soft hover:bg-sand hover:text-primary" aria-label="edit" title={t('تعديل يدوي', 'Manual edit')}><Pencil className="h-4 w-4" /></button>
    ) },
  ];

  return (
    <>
      <PageHeader title={t('الحضور اليومي', 'Daily attendance')} subtitle={date(day, lang)}
        actions={<Button onClick={() => setEdit('new')}><Plus className="h-4 w-4" />{t('إدخال يدوي', 'Manual entry')}</Button>} />
      <SubNav items={ATTENDANCE_NAV} />
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setStatus(status === s ? 'ALL' : s)}
            className={`rounded-2xl border bg-white p-4 text-start shadow-soft transition-colors ${status === s ? 'border-primary ring-2 ring-primary-100' : 'border-line hover:border-primary-500'}`}>
            <p className="text-xs text-ink-muted">{label(ATTENDANCE_STATUS, s, lang)}</p>
            <p className="num mt-1 text-2xl font-bold text-ink">{num(counts[s] ?? 0)}</p>
          </button>
        ))}
      </div>
      <Card>
        <FilterBar>
          <div className="flex items-center gap-1">
            <Button variant="secondary" size="sm" className="!h-10 !px-2.5" onClick={() => setDay(addDays(day, -1))} aria-label="prev"><ChevronRight className="h-4 w-4 ltr:rotate-180" /></Button>
            <Input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} className="w-40" />
            <Button variant="secondary" size="sm" className="!h-10 !px-2.5" onClick={() => setDay(addDays(day, 1))} aria-label="next"><ChevronLeft className="h-4 w-4 ltr:rotate-180" /></Button>
            {day !== todayISO() && <Button variant="ghost" size="sm" onClick={() => setDay(todayISO())}>{t('اليوم', 'Today')}</Button>}
          </div>
          {!isBM && <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} options={branchOpts} placeholder={t('كل الفروع', 'All branches')} className="sm:w-48" />}
          <SearchInput value={q} onChange={setQ} placeholder={t('بحث بالاسم', 'Search name')} className="sm:w-56" />
        </FilterBar>
        <div className="border-b border-line px-4 py-3">
          <Chips value={status} onChange={setStatus} options={[{ value: 'ALL', label: t('الكل', 'All'), count: data?.length ?? 0 }, ...STATUSES.map((s) => ({ value: s, label: label(ATTENDANCE_STATUS, s, lang), count: counts[s] ?? 0 }))]} />
        </div>
        <Async loading={loading} error={error} onRetry={reload} hasData={!!data}>
          <div className={loading ? 'opacity-60' : ''}>
            <Table columns={columns} rows={rows} rowKey={(r) => r.employeeId} empty={<EmptyState title={t('لا توجد سجلات', 'No records')} />} />
          </div>
        </Async>
      </Card>
      {edit && <ManualModal row={edit === 'new' ? null : edit} day={day} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </>
  );
}

function ManualModal({ row, day, onClose, onSaved }: { row: AttendanceRow | null; day: string; onClose: () => void; onSaved: () => void }) {
  const { t } = useLang();
  const { busy, run } = useAction();
  const { options } = useEmployeeOptions();
  const [f, setF] = useState({ employeeId: row?.employeeId ?? '', date: day, checkIn: hhmmOf(row?.checkIn), checkOut: hhmmOf(row?.checkOut), note: '' });
  const save = async () => {
    if (!f.employeeId || !f.checkIn) return;
    const body = { employeeId: f.employeeId, date: f.date, checkIn: toIsoDateTime(f.date, f.checkIn), checkOut: f.checkOut ? toIsoDateTime(f.date, f.checkOut) : null, note: f.note || undefined };
    const ok = await run('save', () => (row?.recordId ? api.patch(`/attendance/${row.recordId}`, body) : api.post('/attendance/manual', body)), t('تم حفظ سجل الحضور', 'Attendance saved'));
    if (ok) onSaved();
  };
  return (
    <Modal open onClose={onClose} size="sm" title={row ? `${t('تعديل حضور', 'Edit attendance')} — ${row.employeeName}` : t('إدخال حضور يدوي', 'Manual attendance entry')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('إلغاء', 'Cancel')}</Button><Button onClick={save} loading={busy === 'save'} disabled={!f.employeeId || !f.checkIn}>{t('حفظ', 'Save')}</Button></>}>
      <div className="space-y-4">
        {!row && <Field label={t('الموظف', 'Employee')} required><Select value={f.employeeId} onChange={(e) => setF({ ...f, employeeId: e.target.value })} options={options} placeholder={t('اختر موظفاً', 'Select employee')} /></Field>}
        <Field label={t('التاريخ', 'Date')} required><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} disabled={!!row} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('وقت الدخول', 'Check-in')} required><Input type="time" value={f.checkIn} onChange={(e) => setF({ ...f, checkIn: e.target.value })} /></Field>
          <Field label={t('وقت الخروج', 'Check-out')}><Input type="time" value={f.checkOut} onChange={(e) => setF({ ...f, checkOut: e.target.value })} /></Field>
        </div>
        <Field label={t('سبب التعديل', 'Reason / note')}><Textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder={t('مثال: عطل في جهاز الجوال', 'e.g. phone issue')} /></Field>
      </div>
    </Modal>
  );
}
