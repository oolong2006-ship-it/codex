import { serverApi } from '../../lib/server-api';
import { formatDateTime } from '../../lib/format';
import { Card, Empty, Table } from '../../components/ui';

export const dynamic = 'force-dynamic';

interface Roster {
  present: { employee_id: string; employee_number: string; full_name: string; started_at: string }[];
  pending_review_last_24h: number;
}

export default async function DashboardPage() {
  const roster = await serverApi<Roster>('/v1/attendance/roster');
  return (
    <>
      <h1>الحضور اللحظي</h1>
      <div className="cards">
        <Card label="حاضرون الآن" value={roster.present.length} />
        <Card label="بصمات بانتظار المراجعة (آخر 24 ساعة)" value={roster.pending_review_last_24h} />
      </div>
      <h2>الحاضرون الآن</h2>
      <Table headers={['الرقم الوظيفي', 'الاسم', 'منذ']}>
        {roster.present.length ? (
          roster.present.map((row) => (
            <tr key={row.employee_id}>
              <td>{row.employee_number}</td>
              <td>{row.full_name}</td>
              <td>{formatDateTime(row.started_at)}</td>
            </tr>
          ))
        ) : (
          <Empty colSpan={3} />
        )}
      </Table>
    </>
  );
}
