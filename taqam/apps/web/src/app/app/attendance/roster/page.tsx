'use client';
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, Save, Undo2 } from 'lucide-react';
import { Button, Card, EmptyState, Input, PageHeader, Select, useToast } from '@/components/ui';
import { Async, Avatar } from '@/components/app/primitives';
import { SubNav, ATTENDANCE_NAV } from '@/components/app/SubNav';
import { useBranches, useShifts } from '@/components/app/hooks';
import { addDays, weekStartOf, DAY_NAMES, useAction, errMsg } from '@/components/app/utils';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFetch } from '@/lib/useFetch';
import { useLang } from '@/lib/i18n';
import { date, todayISO } from '@/lib/format';
import type { RosterData } from '@/lib/types';

const key = (employeeId: string, day: string) => `${employeeId}|${day}`;

export default function RosterPage() {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const toast = useToast();
  const { branches, options: branchOpts } = useBranches();
  const [branchId, setBranchId] = useState('');
  const [weekStart, setWeekStart] = useState(weekStartOf(todayISO()));
  const [changes, setChanges] = useState<Record<string, string | null>>({});
  const { busy, run } = useAction();

  useEffect(() => {
    if (branchId || !branches.length) return;
    const own = user?.branchId && branches.find((b) => b.id === user.branchId);
    setBranchId(own ? own.id : branches[0].id);
  }, [branches, branchId, user]);

  const { shifts } = useShifts(branchId || undefined);
  const roster = useFetch(() => (branchId ? api.get<RosterData>('/roster', { branchId, weekStart }) : Promise.resolve(null)), [branchId, weekStart]);
  useEffect(() => { setChanges({}); }, [branchId, weekStart]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const base = useMemo(() => {
    const m: Record<string, string> = {};
    roster.data?.assignments.forEach((a) => { m[key(a.employeeId, a.date.slice(0, 10))] = a.shiftId; });
    return m;
  }, [roster.data]);
  const valueAt = (emp: string, day: string) => (key(emp, day) in changes ? changes[key(emp, day)] : base[key(emp, day)] ?? null);
  const setCell = (emp: string, day: string, shiftId: string | null) => {
    setChanges((c) => {
      const k = key(emp, day); const n = { ...c };
      if ((base[k] ?? null) === shiftId) delete n[k]; else n[k] = shiftId;
      return n;
    });
  };
  const shiftById = useMemo(() => Object.fromEntries(shifts.map((s) => [s.id, s])), [shifts]);
  const dirty = Object.keys(changes).length;

  const save = async () => {
    const assignments = Object.entries(changes).map(([k, shiftId]) => { const [employeeId, d] = k.split('|'); return { employeeId, shiftId, date: d }; });
    if (await run('save', () => api.put('/roster', { assignments }), t('تم حفظ جدول الورديات', 'Roster saved'))) { setChanges({}); roster.reload(); }
  };

  const copyPrev = async () => {
    try {
      const prev = await api.get<RosterData>('/roster', { branchId, weekStart: addDays(weekStart, -7) });
      const next: Record<string, string | null> = {};
      (roster.data?.employees ?? []).forEach((e) => days.forEach((d) => {
        const p = prev.assignments.find((a) => a.employeeId === e.id && a.date.slice(0, 10) === addDays(d, -7));
        const v = p?.shiftId ?? null;
        if ((base[key(e.id, d)] ?? null) !== v) next[key(e.id, d)] = v;
      }));
      setChanges(next);
      toast(t('تم نسخ الأسبوع السابق — راجع ثم احفظ', 'Copied previous week — review then save'), 'info');
    } catch (e) { toast(errMsg(e), 'error'); }
  };

  /** Apply a shift to its configured days for one employee. */
  const fillRow = (emp: string, shiftId: string) => {
    const s = shiftById[shiftId];
    days.forEach((d) => {
      const dow = new Date(`${d}T00:00:00`).getDay();
      setCell(emp, d, s && s.days.includes(dow) ? shiftId : null);
    });
  };

  return (
    <>
      <PageHeader title={t('جدول الورديات', 'Weekly roster')} subtitle={`${date(days[0], lang)} — ${date(days[6], lang)}`}
        actions={<>
          <Button variant="secondary" onClick={copyPrev} disabled={!branchId}><Copy className="h-4 w-4" />{t('نسخ الأسبوع السابق', 'Copy last week')}</Button>
          {dirty > 0 && <Button variant="ghost" onClick={() => setChanges({})}><Undo2 className="h-4 w-4" />{t('تراجع', 'Discard')}</Button>}
          <Button onClick={save} loading={busy === 'save'} disabled={!dirty}><Save className="h-4 w-4" />{t('حفظ', 'Save')}{dirty > 0 && <span className="num rounded-full bg-accent px-1.5 text-xs text-night">{dirty}</span>}</Button>
        </>} />
      <SubNav items={ATTENDANCE_NAV} />
      <Card>
        <div className="flex flex-col gap-2 border-b border-line p-4 sm:flex-row sm:items-center">
          <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} options={branchOpts} className="sm:w-56" />
          <div className="flex items-center gap-1">
            <Button variant="secondary" size="sm" className="!h-10 !px-2.5" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="prev"><ChevronRight className="h-4 w-4 ltr:rotate-180" /></Button>
            <Input type="date" value={weekStart} onChange={(e) => e.target.value && setWeekStart(weekStartOf(e.target.value))} className="w-40" />
            <Button variant="secondary" size="sm" className="!h-10 !px-2.5" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="next"><ChevronLeft className="h-4 w-4 ltr:rotate-180" /></Button>
          </div>
          <div className="flex flex-wrap gap-2 sm:ms-auto">
            {shifts.map((s) => (
              <span key={s.id} className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs text-ink-muted">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />{s.name} <span className="num" dir="ltr">{s.startTime}–{s.endTime}</span>
              </span>
            ))}
          </div>
        </div>
        <Async loading={roster.loading} error={roster.error} onRetry={roster.reload} hasData={!!roster.data}>
          {!roster.data?.employees.length ? <EmptyState title={t('لا يوجد موظفون في هذا الفرع', 'No employees in this branch')} /> : !shifts.length ? (
            <EmptyState title={t('لا توجد ورديات لهذا الفرع', 'No shifts for this branch')} description={t('أنشئ وردية أولاً من صفحة الورديات', 'Create a shift first from the Shifts page')} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-line bg-sand/60">
                    <th className="sticky start-0 z-10 bg-sand px-4 py-3 text-start font-medium text-ink-muted">{t('الموظف', 'Employee')}</th>
                    {days.map((d, i) => (
                      <th key={d} className={`px-2 py-3 text-center font-medium ${d === todayISO() ? 'text-primary' : 'text-ink-muted'}`}>
                        <div>{DAY_NAMES[i][lang === 'ar' ? 0 : 1]}</div><div className="num text-xs font-normal text-ink-soft">{d.slice(8, 10)}/{d.slice(5, 7)}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {roster.data.employees.map((e) => (
                    <tr key={e.id} className="border-b border-line/70 last:border-0">
                      <td className="sticky start-0 z-10 bg-white px-4 py-2">
                        <div className="flex items-center gap-2">
                          <Avatar name={e.name} size="sm" />
                          <span className="max-w-[140px] truncate font-medium text-ink">{e.name}</span>
                          <select className="ms-auto h-7 w-7 cursor-pointer appearance-none rounded-md border border-line bg-white text-center text-xs text-ink-soft hover:border-primary-500" value=""
                            title={t('تعبئة الأسبوع بوردية', 'Fill week with shift')} onChange={(ev) => ev.target.value && fillRow(e.id, ev.target.value)}>
                            <option value="">⋯</option>
                            {shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        </div>
                      </td>
                      {days.map((d) => {
                        const v = valueAt(e.id, d);
                        const s = v ? shiftById[v] : null;
                        const changed = key(e.id, d) in changes;
                        return (
                          <td key={d} className="px-1 py-1.5">
                            <select value={v ?? ''} onChange={(ev) => setCell(e.id, d, ev.target.value || null)}
                              className={`h-9 w-full cursor-pointer rounded-lg border px-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary-100 ${changed ? 'ring-2 ring-accent' : ''}`}
                              style={s ? { background: `${s.color}22`, borderColor: `${s.color}88`, color: '#172C46' } : { background: '#F6F8FB', borderColor: '#DDE3EC', color: '#5B6B80' }}>
                              <option value="">{t('راحة', 'Off')}</option>
                              {shifts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                            </select>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Async>
      </Card>
    </>
  );
}
