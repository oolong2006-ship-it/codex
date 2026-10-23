'use client';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Plus, Wallet, Users, TrendingUp, CalendarClock } from 'lucide-react';
import { Button, Card, EmptyState, Field, Input, Modal, PageHeader, StatCard, Table, type Column } from '@/components/ui';
import { Async, StatusBadge } from '@/components/app/primitives';
import { SubNav, PAYROLL_NAV } from '@/components/app/SubNav';
import { useAction } from '@/components/app/utils';
import { api } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { useLang } from '@/lib/i18n';
import { currentPeriod, date, money, num, period } from '@/lib/format';
import { PAYROLL_STATUS } from '@/lib/labels';
import type { PayrollRun } from '@/lib/types';

export default function PayrollRunsPage() {
  const { t, lang } = useLang();
  const router = useRouter();
  const { data, loading, error, reload } = useFetch(() => api.get<PayrollRun[]>('/payroll/runs'), []);
  const [creating, setCreating] = useState(false);
  const runs = useMemo(() => [...(data ?? [])].sort((a, b) => b.period.localeCompare(a.period)), [data]);
  const last = runs.find((r) => r.status === 'APPROVED' || r.status === 'PAID');
  const open = runs.filter((r) => r.status === 'DRAFT' || r.status === 'CALCULATED').length;

  const columns: Column<PayrollRun>[] = [
    { key: 'period', header: t('الفترة', 'Period'), render: (r) => <span className="font-semibold text-ink">{period(r.period, lang)}</span> },
    { key: 'status', header: t('الحالة', 'Status'), render: (r) => <StatusBadge map={PAYROLL_STATUS} value={r.status} /> },
    { key: 'count', header: t('الموظفون', 'Employees'), render: (r) => <span className="num">{num(r.employeesCount)}</span> },
    { key: 'gross', header: t('الإجمالي', 'Gross'), render: (r) => <span className="num">{money(r.totalGross, { decimals: 0 })}</span> },
    { key: 'ded', header: t('الاستقطاعات', 'Deductions'), render: (r) => <span className="num text-danger">{money(r.totalDeductions, { decimals: 0 })}</span> },
    { key: 'net', header: t('الصافي', 'Net'), render: (r) => <span className="num font-semibold text-primary">{money(r.totalNet, { decimals: 0 })}</span> },
    { key: 'cost', header: t('تكلفة المنشأة', 'Employer cost'), render: (r) => <span className="num text-ink-muted">{money(r.totalEmployerCost, { decimals: 0 })}</span> },
    { key: 'date', header: t('آخر تحديث', 'Updated'), render: (r) => <span className="text-ink-muted">{date(r.paidAt || r.approvedAt || r.createdAt, lang)}</span> },
  ];

  return (
    <>
      <PageHeader title={t('مسيرات الرواتب', 'Payroll runs')} subtitle={t('احتساب واعتماد الرواتب الشهرية وملف حماية الأجور', 'Calculate & approve monthly payroll and the WPS file')}
        actions={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" />{t('مسير جديد', 'New run')}</Button>} />
      <SubNav items={PAYROLL_NAV} />
      <Async loading={loading} error={error} onRetry={reload} hasData={!!data}>
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label={t('آخر صافي معتمد', 'Last approved net')} value={last ? money(last.totalNet, { decimals: 0 }) : '—'} hint={last ? period(last.period, lang) : undefined} icon={<Wallet className="h-5 w-5" />} />
          <StatCard label={t('تكلفة المنشأة', 'Employer cost')} value={last ? money(last.totalEmployerCost, { decimals: 0 }) : '—'} hint={t('شاملة التأمينات', 'Incl. GOSI')} tone="info" icon={<TrendingUp className="h-5 w-5" />} />
          <StatCard label={t('موظفون في آخر مسير', 'Employees in last run')} value={last ? num(last.employeesCount) : '—'} tone="success" icon={<Users className="h-5 w-5" />} />
          <StatCard label={t('مسيرات مفتوحة', 'Open runs')} value={num(open)} tone="accent" icon={<CalendarClock className="h-5 w-5" />} />
        </div>
        <Card>
          <Table columns={columns} rows={runs} rowKey={(r) => r.id} onRowClick={(r) => router.push(`/app/payroll/${r.id}`)}
            empty={<EmptyState title={t('لا توجد مسيرات بعد', 'No payroll runs yet')} description={t('أنشئ أول مسير رواتب للشهر الحالي', 'Create your first run for this month')}
              action={<Button size="sm" onClick={() => setCreating(true)}>{t('مسير جديد', 'New run')}</Button>} />} />
        </Card>
      </Async>
      {creating && <CreateRunModal existing={runs.map((r) => r.period)} onClose={() => setCreating(false)} onCreated={(r) => router.push(`/app/payroll/${r.id}`)} />}
    </>
  );
}

function CreateRunModal({ existing, onClose, onCreated }: { existing: string[]; onClose: () => void; onCreated: (r: PayrollRun) => void }) {
  const { t, lang } = useLang();
  const { busy, run } = useAction();
  const [p, setP] = useState(currentPeriod());
  const dup = existing.includes(p);
  const create = async () => {
    let created: PayrollRun | null = null;
    const ok = await run('create', async () => { created = await api.post<PayrollRun>('/payroll/runs', { period: p }); }, t('تم إنشاء المسير', 'Run created'));
    if (ok && created) onCreated(created);
  };
  return (
    <Modal open onClose={onClose} size="sm" title={t('مسير رواتب جديد', 'New payroll run')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('إلغاء', 'Cancel')}</Button><Button onClick={create} loading={busy === 'create'} disabled={!p || dup}>{t('إنشاء', 'Create')}</Button></>}>
      <Field label={t('الفترة (الشهر)', 'Period (month)')} required error={dup ? t('يوجد مسير لهذه الفترة بالفعل', 'A run already exists for this period') : undefined}>
        <Input type="month" value={p} onChange={(e) => setP(e.target.value)} />
      </Field>
      {p && <p className="mt-3 text-sm text-ink-muted">{t('سيتم إنشاء مسودة لشهر', 'A draft will be created for')} <strong className="text-ink">{period(p, lang)}</strong>. {t('بعدها اضغط "احتساب" لاحتساب الرواتب من بيانات الحضور والإجازات والسلف.', 'Then press "Calculate" to compute salaries from attendance, leave and loans.')}</p>}
    </Modal>
  );
}
