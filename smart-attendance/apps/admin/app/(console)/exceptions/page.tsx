import { serverApi } from '../../../lib/server-api';
import { formatDateTime } from '../../../lib/format';
import { EXCEPTION_KIND_LABELS, EXCEPTION_STATUS_LABELS, PUNCH_TYPE_LABELS, labelOf } from '../../../lib/labels';
import { Empty, FlashFromQuery, Pill, Table } from '../../../components/ui';
import { decideExceptionAction } from './actions';

export const dynamic = 'force-dynamic';

interface Exception {
  id: string;
  employee_number: string;
  full_name: string;
  kind: string;
  event_id: string | null;
  punch_type: string | null;
  punch_at: string | null;
  reason: string;
  status: string;
  created_at: string;
  decision_note: string | null;
}

interface Me {
  permissions: string[];
}

const STATUSES = ['OPEN', 'APPROVED', 'REJECTED'];

export default async function ExceptionsPage({ searchParams }: { searchParams: Promise<{ status?: string; error?: string; ok?: string }> }) {
  const params = await searchParams;
  const status = STATUSES.includes(params.status ?? '') ? (params.status as string) : 'OPEN';
  const [items, me] = await Promise.all([
    serverApi<Exception[]>('/v1/attendance/exceptions', { query: { status } }),
    serverApi<Me>('/v1/me'),
  ]);
  const canDecide = me.permissions.includes('attendance.exceptions.decide');

  return (
    <>
      <h1>الاستثناءات</h1>
      <FlashFromQuery error={params.error} ok={params.ok} />
      <nav className="row" aria-label="فلتر الحالة">
        {STATUSES.map((s) => (
          <a key={s} href={`/exceptions?status=${s}`} className={s === status ? 'pill ok' : 'pill'}>
            {EXCEPTION_STATUS_LABELS[s]}
          </a>
        ))}
      </nav>
      <h2>{EXCEPTION_STATUS_LABELS[status]}</h2>
      <Table headers={['الموظف', 'النوع', 'الحدث', 'السبب', 'الحالة', 'تاريخ الطلب', 'إجراء']}>
        {items.length ? (
          items.map((x) => (
            <tr key={x.id}>
              <td>
                {x.employee_number} — {x.full_name}
              </td>
              <td>{labelOf(EXCEPTION_KIND_LABELS, x.kind)}</td>
              <td>
                {x.kind === 'MISSING_PUNCH'
                  ? `${labelOf(PUNCH_TYPE_LABELS, x.punch_type)} — ${formatDateTime(x.punch_at)}`
                  : x.event_id?.slice(0, 8)}
              </td>
              <td>{x.reason}</td>
              <td>
                <Pill value={x.status} label={labelOf(EXCEPTION_STATUS_LABELS, x.status)} />
                {x.decision_note ? <div className="muted">{x.decision_note}</div> : null}
              </td>
              <td>{formatDateTime(x.created_at)}</td>
              <td>
                {canDecide && x.status === 'OPEN' ? (
                  <form action={decideExceptionAction} className="inline">
                    <input type="hidden" name="id" value={x.id} />
                    <input type="hidden" name="status" value={status} />
                    <input name="note" placeholder="ملاحظة (اختياري)" maxLength={500} />
                    <button type="submit" name="decision" value="approve">اعتماد</button>
                    <button type="submit" name="decision" value="reject" className="danger">رفض</button>
                  </form>
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
            </tr>
          ))
        ) : (
          <Empty colSpan={7} />
        )}
      </Table>
    </>
  );
}
