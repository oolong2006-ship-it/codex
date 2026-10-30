import { serverApi } from '../../../lib/server-api';
import { currentMonth, formatDateTime } from '../../../lib/format';
import { PERIOD_STATUS_LABELS, labelOf } from '../../../lib/labels';
import { Empty, FlashFromQuery, Pill, Table } from '../../../components/ui';
import { lockPeriodAction, reopenPeriodAction } from './actions';

export const dynamic = 'force-dynamic';

interface Period {
  id: string;
  period_start: string;
  period_end: string;
  status: string;
  locked_at: string | null;
  reopened_at: string | null;
  reopen_reason: string | null;
}

interface Me {
  permissions: string[];
}

export default async function PeriodsPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const params = await searchParams;
  const [periods, me] = await Promise.all([serverApi<Period[]>('/v1/attendance/periods'), serverApi<Me>('/v1/me')]);
  const canLock = me.permissions.includes('payroll.periods.lock');
  const canReopen = me.permissions.includes('payroll.periods.reopen');

  return (
    <>
      <h1>فترات الحضور</h1>
      <FlashFromQuery error={params.error} ok={params.ok} />
      <p className="muted">القفل يمنع اعتماد أي استثناء يقع داخل الشهر. إعادة الفتح بصلاحية خاصة وسبب مكتوب.</p>

      {canLock ? (
        <form action={lockPeriodAction} className="row">
          <label className="field">
            <span>الشهر</span>
            <input type="month" name="month" required defaultValue={currentMonth()} dir="ltr" />
          </label>
          <button type="submit">قفل الشهر</button>
        </form>
      ) : null}

      <h2>الفترات</h2>
      <Table headers={['من', 'إلى', 'الحالة', 'قُفلت', 'آخر إعادة فتح', 'إجراء']}>
        {periods.length ? (
          periods.map((p) => (
            <tr key={p.id}>
              <td>{p.period_start}</td>
              <td>{p.period_end}</td>
              <td>
                <Pill value={p.status} label={labelOf(PERIOD_STATUS_LABELS, p.status)} />
              </td>
              <td>{formatDateTime(p.locked_at)}</td>
              <td>
                {p.reopened_at ? `${formatDateTime(p.reopened_at)} — ${p.reopen_reason ?? ''}` : '—'}
              </td>
              <td>
                {canReopen && p.status === 'LOCKED' ? (
                  <form action={reopenPeriodAction} className="inline">
                    <input type="hidden" name="month" value={p.period_start.slice(0, 7)} />
                    <input name="reason" required minLength={3} maxLength={500} placeholder="سبب إعادة الفتح" />
                    <button type="submit" className="secondary">إعادة الفتح</button>
                  </form>
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
            </tr>
          ))
        ) : (
          <Empty colSpan={6} />
        )}
      </Table>
    </>
  );
}
