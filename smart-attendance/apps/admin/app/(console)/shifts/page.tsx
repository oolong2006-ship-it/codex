import { serverApi } from '../../../lib/server-api';
import { addDaysIso, formatDateTime, today } from '../../../lib/format';
import { OUTCOME_LABELS, labelOf } from '../../../lib/labels';
import { Card, Empty, FlashFromQuery, Pill, Table } from '../../../components/ui';

export const dynamic = 'force-dynamic';

interface Row {
  employee_number: string;
  full_name: string;
  shift: string;
  date: string;
  scheduled_start: string;
  scheduled_end: string;
  outcome: string;
  late_minutes: number;
  early_leave_minutes: number;
  started_at: string | null;
  ended_at: string | null;
}

interface Report {
  timezone: string;
  summary: Record<string, number>;
  rows: Row[];
}

interface Employee {
  id: string;
  employee_number: string;
  full_name: string;
}

export default async function ShiftReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; employee_id?: string; error?: string; ok?: string }>;
}) {
  const params = await searchParams;
  const to = params.to || today();
  const from = params.from || addDaysIso(to, -6);
  const employeeId = params.employee_id || undefined;

  const [report, employees] = await Promise.all([
    serverApi<Report>('/v1/attendance/shift-report', { query: { from, to, employee_id: employeeId } }),
    serverApi<Employee[]>('/v1/employees'),
  ]);
  const exportQuery = new URLSearchParams({ kind: 'shifts', from, to, ...(employeeId ? { employee_id: employeeId } : {}) });
  const outcomes = ['ABSENT', 'LATE', 'EARLY_LEAVE', 'INCOMPLETE', 'PRESENT', 'NOT_DUE'];

  return (
    <>
      <h1>تقرير الورديات</h1>
      <FlashFromQuery error={params.error} ok={params.ok} />
      <form className="row" method="get">
        <label className="field">
          <span>من</span>
          <input type="date" name="from" defaultValue={from} />
        </label>
        <label className="field">
          <span>إلى</span>
          <input type="date" name="to" defaultValue={to} />
        </label>
        <label className="field">
          <span>الموظف</span>
          <select name="employee_id" defaultValue={employeeId ?? ''}>
            <option value="">كل الموظفين</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.employee_number} — {e.full_name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">عرض</button>
        <a className="button secondary" href={`/api/export?${exportQuery.toString()}`}>تنزيل CSV</a>
      </form>

      <div className="cards">
        {outcomes.map((o) => (
          <Card key={o} label={labelOf(OUTCOME_LABELS, o)} value={report.summary[o] ?? 0} />
        ))}
        <Card label="دقائق التأخر" value={report.summary.late_minutes ?? 0} />
        <Card label="دقائق الخروج المبكر" value={report.summary.early_leave_minutes ?? 0} />
      </div>

      <Table headers={['التاريخ', 'الموظف', 'الوردية', 'الحكم', 'تأخر', 'خروج مبكر', 'مجدولة', 'فعلية']}>
        {report.rows.length ? (
          report.rows.map((r, index) => (
            <tr key={`${r.date}-${r.employee_number}-${index}`}>
              <td>{r.date}</td>
              <td>
                {r.employee_number} — {r.full_name}
              </td>
              <td>{r.shift}</td>
              <td>
                <Pill value={r.outcome} label={labelOf(OUTCOME_LABELS, r.outcome)} />
              </td>
              <td>{r.late_minutes ? `${r.late_minutes} د` : '—'}</td>
              <td>{r.early_leave_minutes ? `${r.early_leave_minutes} د` : '—'}</td>
              <td>
                {formatDateTime(r.scheduled_start, report.timezone)} — {formatDateTime(r.scheduled_end, report.timezone)}
              </td>
              <td>
                {r.started_at ? formatDateTime(r.started_at, report.timezone) : '—'}
                {r.ended_at ? ` — ${formatDateTime(r.ended_at, report.timezone)}` : ''}
              </td>
            </tr>
          ))
        ) : (
          <Empty colSpan={8} />
        )}
      </Table>
    </>
  );
}
