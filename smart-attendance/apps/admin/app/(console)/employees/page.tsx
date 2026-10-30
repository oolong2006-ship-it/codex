import { serverApi } from '../../../lib/server-api';
import { Empty, Pill, Table } from '../../../components/ui';

export const dynamic = 'force-dynamic';

interface Employee {
  id: string;
  employee_number: string;
  full_name: string;
  branch_id: string | null;
  status: string;
}

interface Branch {
  id: string;
  name: string;
  code: string | null;
}

export default async function EmployeesPage() {
  const [employees, branches] = await Promise.all([serverApi<Employee[]>('/v1/employees'), serverApi<Branch[]>('/v1/branches')]);
  const branchName = new Map(branches.map((b) => [b.id, b.code ? `${b.name} (${b.code})` : b.name]));

  return (
    <>
      <h1>الموظفون</h1>
      <Table headers={['الرقم الوظيفي', 'الاسم', 'الفرع', 'الحالة']}>
        {employees.length ? (
          employees.map((e) => (
            <tr key={e.id}>
              <td>{e.employee_number}</td>
              <td>{e.full_name}</td>
              <td>{e.branch_id ? branchName.get(e.branch_id) ?? '—' : '—'}</td>
              <td>
                <Pill value={e.status} label={e.status === 'ACTIVE' ? 'نشط' : 'غير نشط'} />
              </td>
            </tr>
          ))
        ) : (
          <Empty colSpan={4} />
        )}
      </Table>
    </>
  );
}
