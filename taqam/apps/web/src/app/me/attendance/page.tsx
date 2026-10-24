'use client';
import clsx from 'clsx';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { History } from 'lucide-react';
import { api } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { useLang } from '@/lib/i18n';
import { currentPeriod, minutesToHours, time as fmtTime, todayISO } from '@/lib/format';
import { ATTENDANCE_STATUS, label } from '@/lib/labels';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { ListSkeleton, MonthPicker, PageTitle, Segmented, Skeleton } from '@/components/ess/primitives';
import { asArray, type AttendanceRecord } from '@/components/ess/types';

// status → [dot/bg colour, soft bg, text]
const STATUS_STYLE: Record<string, { dot: string; soft: string; text: string }> = {
  PRESENT: { dot: 'bg-success', soft: 'bg-success-50', text: 'text-success' },
  LATE: { dot: 'bg-warning', soft: 'bg-warning-50', text: 'text-warning' },
  ABSENT: { dot: 'bg-danger', soft: 'bg-danger-50', text: 'text-danger' },
  ON_LEAVE: { dot: 'bg-info', soft: 'bg-info-50', text: 'text-info' },
  INCOMPLETE: { dot: 'bg-accent', soft: 'bg-accent-50', text: 'text-accent-600' },
  OFF: { dot: 'bg-sand-300', soft: 'bg-sand', text: 'text-ink-soft' },
  HOLIDAY: { dot: 'bg-primary-500', soft: 'bg-primary-50', text: 'text-primary' },
};
const styleOf = (s: string) => STATUS_STYLE[s] ?? STATUS_STYLE.OFF;
const WEEK_AR = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
const WEEK_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function MyAttendancePage() {
  const { t, lang } = useLang();
  const [month, setMonth] = useState(currentPeriod());
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [selected, setSelected] = useState<string | null>(null);
  const { data, loading, error, reload } = useFetch(() => api.get<unknown>('/me/attendance', { month }), [month]);

  const records = useMemo(() => asArray<AttendanceRecord>(data).slice().sort((a, b) => a.date.localeCompare(b.date)), [data]);
  const byDate = useMemo(() => new Map(records.map((r) => [r.date.slice(0, 10), r])), [records]);
  const summary = useMemo(() => {
    let present = 0, late = 0, absent = 0, leave = 0, ot = 0, worked = 0, lateMin = 0;
    for (const r of records) {
      if (r.status === 'PRESENT') present++;
      if (r.status === 'LATE') { late++; present++; }
      if (r.status === 'ABSENT') absent++;
      if (r.status === 'ON_LEAVE') leave++;
      ot += r.overtimeMinutes || 0; worked += r.workedMinutes || 0; lateMin += r.lateMinutes || 0;
    }
    return { present, late, absent, leave, ot, worked, lateMin };
  }, [records]);

  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const today = todayISO();
  const sel = selected ? byDate.get(selected) : null;

  const chips = [
    { label: t('حضور', 'Present'), value: summary.present, cls: 'bg-success-50 text-success' },
    { label: t('تأخير', 'Late'), value: summary.late, cls: 'bg-warning-50 text-warning' },
    { label: t('غياب', 'Absent'), value: summary.absent, cls: 'bg-danger-50 text-danger' },
    { label: t('إضافي (س)', 'Overtime (h)'), value: minutesToHours(summary.ot), cls: 'bg-info-50 text-info' },
  ];

  return (
    <div className="space-y-5">
      <PageTitle title={t('سجل الحضور', 'Attendance')} subtitle={t(`${minutesToHours(summary.worked)} ساعة عمل هذا الشهر`, `${minutesToHours(summary.worked)} hours worked this month`)}
        action={<Link href="/me/requests?new=ATTENDANCE_CORRECTION" className="flex h-11 items-center gap-1.5 rounded-2xl border border-line bg-white px-3 text-sm font-medium text-primary shadow-soft"><History className="h-4 w-4" />{t('تصحيح', 'Correct')}</Link>} />

      <MonthPicker value={month} onChange={(p) => { setMonth(p); setSelected(null); }} max={currentPeriod()} />

      <div className="grid grid-cols-4 gap-2">
        {chips.map((c) => (
          <div key={c.label} className={clsx('rounded-2xl px-2 py-3 text-center', c.cls)}>
            {loading && !data ? <Skeleton className="mx-auto h-6 w-8 bg-white/60" /> : <p className="num text-xl font-bold">{c.value}</p>}
            <p className="mt-0.5 text-[11px] font-medium opacity-90">{c.label}</p>
          </div>
        ))}
      </div>
      {summary.lateMin > 0 && <p className="-mt-2 px-1 text-xs text-ink-muted">{t(`إجمالي دقائق التأخير: ${summary.lateMin} دقيقة`, `Total late: ${summary.lateMin} min`)}</p>}

      <Segmented value={view} onChange={setView} options={[{ value: 'calendar', label: t('تقويم', 'Calendar') }, { value: 'list', label: t('قائمة', 'List') }]} />

      {error && !data ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <ListSkeleton rows={5} /> : view === 'calendar' ? (
        <div className="space-y-3">
          <div className="rounded-3xl border border-line bg-white p-3 shadow-soft">
            <div className="grid grid-cols-7 gap-1 pb-2 text-center text-[11px] font-medium text-ink-soft">
              {(lang === 'ar' ? WEEK_AR : WEEK_EN).map((d) => <span key={d}>{d}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstDow }).map((_, i) => <span key={`b${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const d = `${month}-${String(i + 1).padStart(2, '0')}`;
                const r = byDate.get(d);
                const st = r ? styleOf(r.status) : null;
                const isToday = d === today;
                return (
                  <button key={d} onClick={() => setSelected(d === selected ? null : d)} disabled={d > today}
                    className={clsx('flex aspect-square flex-col items-center justify-center gap-1 rounded-xl text-sm transition',
                      st ? st.soft : 'bg-transparent', d === selected && 'ring-2 ring-primary', isToday && 'font-bold', d > today && 'opacity-35')}>
                    <span className={clsx('num', isToday ? 'text-primary' : 'text-ink')}>{i + 1}</span>
                    <span className={clsx('h-1.5 w-1.5 rounded-full', st ? st.dot : 'bg-transparent')} />
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 border-t border-line pt-3 text-[11px] text-ink-muted">
              {['PRESENT', 'LATE', 'ABSENT', 'ON_LEAVE', 'INCOMPLETE'].map((s) => (
                <span key={s} className="flex items-center gap-1"><span className={clsx('h-2 w-2 rounded-full', styleOf(s).dot)} />{label(ATTENDANCE_STATUS, s, lang)}</span>
              ))}
            </div>
          </div>
          {selected && (sel ? <DayRow r={sel} /> : (
            <div className="rounded-3xl border border-dashed border-line bg-white/60 p-4 text-center text-sm text-ink-muted">{t('لا يوجد سجل لهذا اليوم', 'No record for this day')}</div>
          ))}
        </div>
      ) : records.length === 0 ? (
        <div className="rounded-3xl border border-line bg-white"><EmptyState title={t('لا توجد سجلات لهذا الشهر', 'No records this month')} /></div>
      ) : (
        <ul className="space-y-2.5">{records.slice().reverse().map((r) => <li key={r.date}><DayRow r={r} /></li>)}</ul>
      )}
    </div>
  );
}

function DayRow({ r }: { r: AttendanceRecord }) {
  const { t, lang } = useLang();
  const st = styleOf(r.status);
  const d = new Date(`${r.date.slice(0, 10)}T00:00:00`);
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3 shadow-soft">
      <div className={clsx('flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl', st.soft)}>
        <span className={clsx('num text-lg font-bold leading-none', st.text)}>{d.getDate()}</span>
        <span className="mt-0.5 text-[10px] text-ink-muted">{d.toLocaleDateString(lang === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB', { weekday: 'short' })}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className={clsx('text-sm font-semibold', st.text)}>{label(ATTENDANCE_STATUS, r.status, lang)}</span>
          {r.workedMinutes > 0 && <span className="num text-xs text-ink-muted">{minutesToHours(r.workedMinutes)} {t('س', 'h')}</span>}
        </div>
        <p className="num mt-1 text-[13px] text-ink-muted" dir="ltr" style={{ textAlign: lang === 'ar' ? 'right' : 'left' }}>
          {fmtTime(r.checkIn)} → {fmtTime(r.checkOut)}
        </p>
        <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
          {r.lateMinutes > 0 && <span className="rounded-full bg-warning-50 px-2 py-0.5 text-warning">{t(`تأخير ${r.lateMinutes} د`, `Late ${r.lateMinutes}m`)}</span>}
          {r.overtimeMinutes > 0 && <span className="rounded-full bg-info-50 px-2 py-0.5 text-info">{t(`إضافي ${minutesToHours(r.overtimeMinutes)}`, `OT ${minutesToHours(r.overtimeMinutes)}`)}</span>}
        </div>
      </div>
    </div>
  );
}
