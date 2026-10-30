import { serverApi } from '../../../lib/server-api';
import { currentMonth, formatDateTime, formatMinutes, today } from '../../../lib/format';
import { SESSION_STATUS_LABELS, labelOf } from '../../../lib/labels';
import { Empty, Pill, Table } from '../../../components/ui';

export const dynamic = 'force-dynamic';

interface Session {
  id: string;
  employee_number: string;
  full_name: string;
  business_date: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
}

export default async function SessionsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; month?: string }> }) {
  const params = await searchParams;
  const day = today();
  const from = params.from || day;
  const to = params.to || day;
  const month = params.month || currentMonth();
  const sessions = await serverApi<Session[]>('/v1/attendance/sessions', { query: { from, to } });

  return (
    <>
      <h1>الجلسات والكشوف</h1>
      <form className="row" method="get">
        <label className="field">
          <span>من</span>
          <input type="date" name="from" defaultValue={from} />
        </label>
        <label className="field">
          <span>إلى</span>
          <input type="date" name="to" defaultValue={to} />
        </label>
        <button type="submit">عرض</button>
      </form>

      <h2>الجلسات</h2>
      <Table headers={['الموظف', 'التاريخ التشغيلي', 'الحالة', 'بداية', 'نهاية', 'المدة']}>
        {sessions.length ? (
          sessions.map((s) => (
            <tr key={s.id}>
              <td>
                {s.employee_number} — {s.full_name}
              </td>
              <td>{s.business_date}</td>
              <td>
                <Pill value={s.status} label={labelOf(SESSION_STATUS_LABELS, s.status)} />
              </td>
              <td>{formatDateTime(s.started_at)}</td>
              <td>{formatDateTime(s.ended_at)}</td>
              <td>{formatMinutes(s.duration_minutes)}</td>
            </tr>
          ))
        ) : (
          <Empty colSpan={6} />
        )}
      </Table>

      <h2>كشف الحضور الشهري</h2>
      <form className="row" method="get" action="/api/export">
        <input type="hidden" name="kind" value="attendance" />
        <label className="field">
          <span>الشهر</span>
          <input name="month" defaultValue={month} pattern="\d{4}-(0[1-9]|1[0-2])" required dir="ltr" />
        </label>
        <button type="submit">تنزيل CSV</button>
      </form>
    </>
  );
}
