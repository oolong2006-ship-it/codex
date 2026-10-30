import { serverApi } from '../../../lib/server-api';
import { formatDateTime } from '../../../lib/format';
import { CHANGE_REASON_LABELS, labelOf } from '../../../lib/labels';
import { Empty, FlashFromQuery, Pill, Table } from '../../../components/ui';
import { bindingAction, decideChangeAction } from './actions';

export const dynamic = 'force-dynamic';

interface ChangeRequest {
  id: string;
  employee_number: string;
  full_name: string;
  reason: string;
  note: string | null;
  status: string;
  created_at: string;
}

interface Binding {
  id: string;
  employee_number: string;
  platform: string;
  model: string | null;
  status: string;
  activated_at: string | null;
}

interface Me {
  permissions: string[];
}

const STATUSES = ['OPEN', 'APPROVED', 'REJECTED', 'EXPIRED'];

export default async function DevicesPage({ searchParams }: { searchParams: Promise<{ status?: string; error?: string; ok?: string }> }) {
  const params = await searchParams;
  const status = STATUSES.includes(params.status ?? '') ? (params.status as string) : 'OPEN';
  const me = await serverApi<Me>('/v1/me');
  const canDecide = me.permissions.includes('devices.change.decide');
  const canBind = me.permissions.includes('devices.binding.suspend');
  // قراءة طلبات التغيير تتطلب صلاحية البت فيها؛ مدير الفرع يرى الارتباطات فقط.
  const [requests, bindings] = await Promise.all([
    canDecide ? serverApi<ChangeRequest[]>('/v1/devices/change-requests', { query: { status } }) : Promise.resolve([] as ChangeRequest[]),
    serverApi<Binding[]>('/v1/devices/bindings'),
  ]);

  return (
    <>
      <h1>الأجهزة</h1>
      <FlashFromQuery error={params.error} ok={params.ok} />

      <nav className="row" aria-label="فلتر الحالة">
        {STATUSES.map((s) => (
          <a key={s} href={`/devices?status=${s}`} className={s === status ? 'pill ok' : 'pill'}>
            {s}
          </a>
        ))}
      </nav>
      {canDecide ? (
        <>
      <h2>طلبات تغيير الجهاز</h2>
      <Table headers={['الموظف', 'السبب', 'ملاحظة', 'الحالة', 'تاريخ الطلب', 'إجراء']}>
        {requests.length ? (
          requests.map((r) => (
            <tr key={r.id}>
              <td>
                {r.employee_number} — {r.full_name}
              </td>
              <td>{labelOf(CHANGE_REASON_LABELS, r.reason)}</td>
              <td>{r.note ?? '—'}</td>
              <td>
                <Pill value={r.status} label={r.status} />
              </td>
              <td>{formatDateTime(r.created_at)}</td>
              <td>
                {canDecide && r.status === 'OPEN' ? (
                  <form action={decideChangeAction} className="inline">
                    <input type="hidden" name="id" value={r.id} />
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
          <Empty colSpan={6} />
        )}
      </Table>
        </>
      ) : null}

      <h2>الارتباطات</h2>
      <Table headers={['الموظف', 'المنصة', 'الجهاز', 'الحالة', 'منذ', 'إجراء']}>
        {bindings.length ? (
          bindings.map((b) => (
            <tr key={b.id}>
              <td>{b.employee_number}</td>
              <td>{b.platform}</td>
              <td>{b.model ?? '—'}</td>
              <td>
                <Pill value={b.status} label={b.status} />
              </td>
              <td>{formatDateTime(b.activated_at)}</td>
              <td>
                {canBind && b.status === 'ACTIVE' ? (
                  <form action={bindingAction} className="inline">
                    <input type="hidden" name="id" value={b.id} />
                    <button type="submit" name="action" value="suspend" className="danger">إيقاف (سرقة/فقد)</button>
                  </form>
                ) : canBind && b.status === 'SUSPENDED' ? (
                  <form action={bindingAction} className="inline">
                    <input type="hidden" name="id" value={b.id} />
                    <button type="submit" name="action" value="reactivate">إعادة التفعيل</button>
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
