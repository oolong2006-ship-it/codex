'use client';
import { useLang } from '@/lib/i18n';
import { num } from '@/lib/format';

export const CHART = {
  primary: '#0F3D3E',
  teal: '#1F7A7C',
  tealLight: '#7FB7B5',
  accent: '#F2A541',
  success: '#2E8B57',
  warning: '#E0A800',
  danger: '#C8553D',
  info: '#3B7EA1',
  grid: '#EFE8DC',
  axis: '#8A9893',
};
export const SERIES = [CHART.primary, CHART.accent, CHART.teal, CHART.info, CHART.success, CHART.danger, '#6B5B95', CHART.tealLight];

export const axisProps = { tick: { fill: CHART.axis, fontSize: 11 }, tickLine: false, axisLine: { stroke: CHART.grid } } as const;

/** Compact number formatter for axes: 12500 -> 12.5K */
export function compact(n: number) {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (a >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

interface TipProps {
  active?: boolean;
  payload?: { name?: string; value?: number | string; color?: string; dataKey?: string | number }[];
  label?: string | number;
  labelFormatter?: (l: string) => string;
  valueFormatter?: (v: number) => string;
}
/** Branded tooltip; direction follows the UI language. */
export function ChartTooltip({ active, payload, label, labelFormatter, valueFormatter }: TipProps) {
  const { dir } = useLang();
  if (!active || !payload?.length) return null;
  return (
    <div dir={dir} className="rounded-xl border border-line bg-white px-3 py-2 text-xs shadow-lift">
      {label !== undefined && <div className="mb-1 font-semibold text-ink">{labelFormatter ? labelFormatter(String(label)) : label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-ink-muted">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span>{p.name}</span>
          <span className="num ms-auto font-medium text-ink">{valueFormatter ? valueFormatter(Number(p.value)) : num(Number(p.value))}</span>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />{i.label}</span>
      ))}
    </div>
  );
}

/** Recharts renders LTR SVG; in Arabic we flip the category axis and put the value axis on the right. */
export function useChartDir() {
  const { lang } = useLang();
  const rtl = lang === 'ar';
  return { reversed: rtl, yOrientation: (rtl ? 'right' : 'left') as 'right' | 'left' };
}

const ACTION_AR: Record<string, string> = { CREATE: 'إضافة', UPDATE: 'تعديل', DELETE: 'حذف', APPROVE: 'اعتماد', REJECT: 'رفض', LOGIN: 'تسجيل دخول', TERMINATE: 'إنهاء خدمة', CALCULATE: 'احتساب', MARK_PAID: 'تسجيل دفع', CANCEL: 'إلغاء', REGISTER: 'تسجيل' };
const ENTITY_AR: Record<string, string> = { Employee: 'موظف', Branch: 'فرع', Department: 'قسم', LeaveRequest: 'طلب إجازة', EmployeeRequest: 'طلب', PayrollRun: 'مسير رواتب', Loan: 'سلفة', Shift: 'وردية', Attendance: 'حضور', Document: 'مستند', User: 'مستخدم', Company: 'المنشأة', Announcement: 'إعلان', Job: 'وظيفة', Candidate: 'مرشح', Holiday: 'عطلة', LeaveType: 'نوع إجازة', PerformanceCycle: 'دورة تقييم', PerformanceReview: 'تقييم', Adjustment: 'تسوية', Roster: 'جدول الورديات' };
/** Human text for an audit action like "CREATE"/"employee.create" + entity "Employee". */
export function activityText(action: string, entity: string, lang: 'ar' | 'en') {
  const a = (action.split(/[.:_]/).length > 1 && !ACTION_AR[action] ? action.split(/[.:]/).pop()! : action).toUpperCase();
  const ent = entity ? entity.charAt(0).toUpperCase() + entity.slice(1) : '';
  if (lang === 'en') return `${a.charAt(0)}${a.slice(1).toLowerCase().replace(/_/g, ' ')} ${ent.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()}`;
  return `${ACTION_AR[a] ?? action} ${ENTITY_AR[ent] ?? entity}`;
}
