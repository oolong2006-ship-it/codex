'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BadgeCheck, Download, UserPlus } from 'lucide-react';
import { Badge, Button, Card, PageHeader, Pagination, Select, Table, EmptyState, type Column } from '@/components/ui';
import { Async, Avatar, FilterBar, SearchInput, StatusBadge } from '@/components/app/primitives';
import { EmployeeFormModal, nationalityLabel } from '@/components/app/EmployeeForm';
import { useBranches, useDepartments } from '@/components/app/hooks';
import { can, ADMIN, ADMIN_PAYROLL, employeeName, errMsg, useAction } from '@/components/app/utils';
import { api, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFetch } from '@/lib/useFetch';
import { useLang } from '@/lib/i18n';
import { date, money } from '@/lib/format';
import { EMPLOYEE_STATUS } from '@/lib/labels';
import { useToast } from '@/components/ui';
import type { Employee } from '@/lib/types';

const PAGE_SIZE = 20;

export default function EmployeesPage() {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [branchId, setBranchId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [nationality, setNationality] = useState('');
  const [qiwa, setQiwa] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { busy, run } = useAction();
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const { options: branchOpts } = useBranches();
  const { options: deptOpts } = useDepartments();

  useEffect(() => { const h = setTimeout(() => { setQ(search); setPage(1); }, 300); return () => clearTimeout(h); }, [search]);
  useEffect(() => { if (new URLSearchParams(window.location.search).get('new') === '1' && can(user, ADMIN)) setAdding(true); }, [user]);

  const { data, loading, error, reload } = useFetch(
    () => api.get<Paginated<Employee>>('/employees', { page, pageSize: PAGE_SIZE, search: q, branchId, departmentId, status, nationality, qiwaDocumented: qiwa }),
    [page, q, branchId, departmentId, status, nationality, qiwa],
  );
  // a selection only makes sense for the rows on screen
  useEffect(() => { setSelected(new Set()); }, [page, q, branchId, departmentId, status, nationality, qiwa]);
  const admin = can(user, ADMIN);
  const undocumented = (e: Employee) => e.isSaudi && !e.qiwaDocumented;
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const confirmDocumented = async () => {
    const employeeIds = [...selected];
    const ok = await run('qiwa', () => api.post('/employees/qiwa-documented', { employeeIds, documented: true }), t('تم تأكيد توثيق العقود في قوى', 'Qiwa documentation confirmed'));
    if (ok) { setSelected(new Set()); reload(); }
  };

  const columns: Column<Employee>[] = [
    ...(admin ? [{ key: 'select', header: <span className="sr-only">{t('تحديد', 'Select')}</span>, className: 'w-10', render: (e: Employee) => undocumented(e) ? (
      <input type="checkbox" className="h-4 w-4 accent-primary-500" checked={selected.has(e.id)} onClick={(ev) => ev.stopPropagation()} onChange={() => toggle(e.id)}
        aria-label={t('تحديد لتأكيد توثيق العقد في قوى', 'Select to confirm Qiwa documentation')} />
    ) : null }] : []),
    { key: 'name', header: t('الموظف', 'Employee'), render: (e) => (
      <div className="flex items-center gap-3">
        <Avatar name={employeeName(e, lang)} color={e.avatarColor} />
        <div className="min-w-0">
          <p className="font-medium text-ink">{employeeName(e, lang)}</p>
          <p className="text-xs text-ink-soft">{e.jobTitle}</p>
        </div>
      </div>
    ) },
    { key: 'num', header: t('الرقم الوظيفي', 'No.'), render: (e) => <span className="num text-ink-muted">{e.employeeNumber}</span> },
    { key: 'branch', header: t('الفرع', 'Branch'), render: (e) => e.branch?.nameAr ?? '—' },
    { key: 'dept', header: t('القسم', 'Department'), render: (e) => e.department?.name ?? '—' },
    { key: 'nat', header: t('الجنسية', 'Nationality'), render: (e) => e.isSaudi ? (
      <span className="inline-flex items-center gap-1.5"><Badge tone="primary">{nationalityLabel('SA', lang)}</Badge>{undocumented(e) && <Badge tone="warning">{t('غير موثق في قوى', 'Not in Qiwa')}</Badge>}</span>
    ) : <span className="text-ink-muted">{nationalityLabel(e.nationality, lang)}</span> },
    { key: 'hire', header: t('المباشرة', 'Hired'), render: (e) => <span className="text-ink-muted">{date(e.hireDate, lang)}</span> },
    ...(can(user, ADMIN_PAYROLL) ? [{ key: 'wage', header: t('الأجر الشهري', 'Monthly wage'), render: (e: Employee) => <span className="num">{money(e.basicSalary + e.housingAllowance + e.transportAllowance + e.otherAllowances, { decimals: 0 })}</span> }] : []),
    { key: 'status', header: t('الحالة', 'Status'), render: (e) => <StatusBadge map={EMPLOYEE_STATUS} value={e.status} /> },
  ];

  const exportCsv = async () => {
    try { await api.download('/reports/employees/export', `employees-${new Date().toISOString().slice(0, 10)}.csv`); }
    catch (e) { toast(errMsg(e), 'error'); }
  };

  return (
    <>
      <PageHeader title={t('الموظفون', 'Employees')} subtitle={t('ملفات الموظفين في جميع الفروع', 'Employee records across all branches')}
        actions={<>
          {admin && selected.size > 0 && (
            <Button variant="accent" onClick={confirmDocumented} loading={busy === 'qiwa'}><BadgeCheck className="h-4 w-4" />{t('تأكيد التوثيق في قوى', 'Confirm Qiwa documentation')} <span className="num">({selected.size})</span></Button>
          )}
          {can(user, ADMIN_PAYROLL) && <Button variant="secondary" onClick={exportCsv}><Download className="h-4 w-4" />{t('تصدير', 'Export')}</Button>}
          {can(user, ADMIN) && <Button onClick={() => setAdding(true)}><UserPlus className="h-4 w-4" />{t('إضافة موظف', 'Add employee')}</Button>}
        </>} />
      <Card>
        <FilterBar>
          <SearchInput value={search} onChange={setSearch} placeholder={t('بحث بالاسم أو الرقم أو الهوية', 'Search name, number or ID')} className="sm:w-72" />
          <Select value={branchId} onChange={(e) => { setBranchId(e.target.value); setPage(1); }} options={branchOpts} placeholder={t('كل الفروع', 'All branches')} className="sm:w-44" />
          <Select value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setPage(1); }} options={deptOpts} placeholder={t('كل الأقسام', 'All departments')} className="sm:w-44" />
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} placeholder={t('كل الحالات', 'All statuses')} className="sm:w-40"
            options={Object.entries(EMPLOYEE_STATUS).map(([v, l]) => ({ value: v, label: lang === 'ar' ? l[0] : l[1] }))} />
          <Select value={nationality} onChange={(e) => { setNationality(e.target.value); setPage(1); }} placeholder={t('كل الجنسيات', 'All nationalities')} className="sm:w-40"
            options={[{ value: 'SA', label: t('سعودي', 'Saudi') }, { value: 'NON_SA', label: t('غير سعودي', 'Non-Saudi') }]} />
          <Select value={qiwa} onChange={(e) => { setQiwa(e.target.value); setPage(1); }} placeholder={t('توثيق قوى (الكل)', 'Qiwa (all)')} className="sm:w-48"
            options={[{ value: 'false', label: t('سعوديون غير موثقين في قوى', 'Saudis not in Qiwa') }, { value: 'true', label: t('سعوديون موثقون في قوى', 'Saudis documented in Qiwa') }]} />
        </FilterBar>
        <Async loading={loading} error={error} onRetry={reload} hasData={!!data}>
          <div className={loading ? 'opacity-60 transition-opacity' : ''}>
            <Table columns={columns} rows={data?.data ?? []} rowKey={(e) => e.id} onRowClick={(e) => router.push(`/app/employees/${e.id}`)}
              empty={<EmptyState title={t('لا يوجد موظفون مطابقون', 'No matching employees')} description={t('جرّب تغيير عوامل التصفية', 'Try changing the filters')} />} />
            {data && <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />}
          </div>
        </Async>
      </Card>
      {adding && (
        <EmployeeFormModal open onClose={() => setAdding(false)} onSaved={(e) => { setAdding(false); router.push(`/app/employees/${e.id}`); }} />
      )}
    </>
  );
}
