import { serverApi } from '../../../../lib/server-api';
import { DAY_LABELS, labelOf } from '../../../../lib/labels';
import { FlashFromQuery, Table, Empty } from '../../../../components/ui';
import { today } from '../../../../lib/format';
import { assignShiftAction, createTemplateAction } from './actions';

export const dynamic = 'force-dynamic';

interface Template {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  days: number[];
  status: string;
}

interface Employee {
  id: string;
  employee_number: string;
  full_name: string;
}

export default async function ShiftManagePage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const params = await searchParams;
  const me = await serverApi<{ permissions: string[] }>('/v1/me');
  if (!me.permissions.includes('shifts.manage')) {
    return (
      <>
        <h1>إدارة الورديات</h1>
        <p className="muted">هذه الصفحة لمدير الموارد البشرية والإدارة فقط.</p>
      </>
    );
  }
  const [templates, employees] = await Promise.all([
    serverApi<Template[]>('/v1/shift-templates'),
    serverApi<Employee[]>('/v1/employees'),
  ]);
  const active = templates.filter((t) => t.status === 'ACTIVE');

  return (
    <>
      <h1>إدارة الورديات</h1>
      <FlashFromQuery error={params.error} ok={params.ok} />

      <h2>القوالب</h2>
      <Table headers={['الاسم', 'من', 'إلى', 'الأيام']}>
        {templates.length ? (
          templates.map((t) => (
            <tr key={t.id}>
              <td>{t.name}</td>
              <td dir="ltr">{t.start_time}</td>
              <td dir="ltr">{t.end_time}</td>
              <td>{t.days.map((d) => labelOf(DAY_LABELS, String(d))).join('، ')}</td>
            </tr>
          ))
        ) : (
          <Empty colSpan={4} />
        )}
      </Table>

      <h2>قالب جديد</h2>
      <form action={createTemplateAction} className="row">
        <label className="field">
          <span>الاسم</span>
          <input name="name" required maxLength={100} />
        </label>
        <label className="field">
          <span>بداية الوردية</span>
          <input type="time" name="start_time" required defaultValue="08:00" dir="ltr" />
        </label>
        <label className="field">
          <span>نهاية الوردية (أقدم = اليوم التالي)</span>
          <input type="time" name="end_time" required defaultValue="16:00" dir="ltr" />
        </label>
        <fieldset className="row" style={{ border: 0, padding: 0 }}>
          <legend className="muted">الأيام</legend>
          {Object.entries(DAY_LABELS).map(([value, label]) => (
            <label key={value} className="row" style={{ gap: '0.25rem' }}>
              <input type="checkbox" name="day" value={value} defaultChecked={Number(value) <= 5} />
              {label}
            </label>
          ))}
        </fieldset>
        <button type="submit">حفظ القالب</button>
      </form>

      <h2>تعيين وردية لموظف</h2>
      {active.length && employees.length ? (
        <form action={assignShiftAction} className="row">
          <label className="field">
            <span>الموظف</span>
            <select name="employee_id" required>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.employee_number} — {e.full_name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>القالب</span>
            <select name="shift_template_id" required>
              {active.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>من تاريخ</span>
            <input type="date" name="valid_from" required defaultValue={today()} />
          </label>
          <label className="field">
            <span>إلى تاريخ (اختياري)</span>
            <input type="date" name="valid_to" />
          </label>
          <button type="submit">تعيين</button>
        </form>
      ) : (
        <p className="muted">أنشئ قالبًا نشطًا ووجود موظفين لتعيين الوردية.</p>
      )}
    </>
  );
}
