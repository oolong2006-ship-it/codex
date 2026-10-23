'use client';
import { useMemo, useState } from 'react';
import { Ban, Plus } from 'lucide-react';
import { Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, StatCard, Table, Textarea, type Column } from '@/components/ui';
import { Async, Chips, ConfirmModal, StatusBadge } from '@/components/app/primitives';
import { SubNav, PAYROLL_NAV } from '@/components/app/SubNav';
import { useEmployeeOptions } from '@/components/app/hooks';
import { useAction } from '@/components/app/utils';
import { api } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { useLang } from '@/lib/i18n';
import { currentPeriod, money, num, period } from '@/lib/format';
import type { Loan } from '@/lib/types';

const LOAN_STATUS: Record<string, [string, string]> = { ACTIVE: ['نشطة', 'Active'], PAID: ['مسددة', 'Paid'], CANCELLED: ['ملغاة', 'Cancelled'] };

export default function LoansPage() {
  const { t, lang } = useLang();
  const [status, setStatus] = useState('ACTIVE');
  const [adding, setAdding] = useState(false);
  const [cancel, setCancel] = useState<Loan | null>(null);
  const { busy, run } = useAction();
  const { data, loading, error, reload } = useFetch(() => api.get<Loan[] | { data: Loan[] }>('/loans'), []);
  const all = useMemo(() => (Array.isArray(data) ? data : data?.data ?? []), [data]);
  const rows = all.filter((l) => !status || l.status === status);
  const active = all.filter((l) => l.status === 'ACTIVE');

  const doCancel = async () => { if (cancel && await run('cancel', () => api.patch(`/loans/${cancel.id}`, { status: 'CANCELLED' }), t('تم إلغاء السلفة', 'Loan cancelled'))) { setCancel(null); reload(); } };
  const columns: Column<Loan>[] = [
    { key: 'emp', header: t('الموظف', 'Employee'), render: (l) => <div><p className="font-medium text-ink">{l.employee?.name ?? '—'}</p>{l.employee?.employeeNumber && <p className="num text-xs text-ink-soft">{l.employee.employeeNumber}</p>}</div> },
    { key: 'amount', header: t('المبلغ', 'Amount'), render: (l) => <span className="num">{money(l.amount)}</span> },
    { key: 'monthly', header: t('القسط الشهري', 'Monthly'), render: (l) => <span className="num">{money(l.monthlyDeduction)}</span> },
    { key: 'start', header: t('بداية الخصم', 'Starts'), render: (l) => period(l.startPeriod, lang) },
    { key: 'progress', header: t('السداد', 'Repayment'), render: (l) => {
      const paid = Math.max(0, l.amount - l.remaining); const pctv = l.amount ? (paid / l.amount) * 100 : 0;
      return (
        <div className="w-40">
          <div className="mb-1 flex justify-between text-[11px] text-ink-soft"><span className="num">{money(l.remaining, { decimals: 0 })} {t('متبقٍ', 'left')}</span><span className="num">{pctv.toFixed(0)}%</span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-sand-200"><div className="h-full rounded-full bg-primary-500" style={{ width: `${pctv}%` }} /></div>
        </div>
      );
    } },
    { key: 'status', header: t('الحالة', 'Status'), render: (l) => <StatusBadge map={LOAN_STATUS} value={l.status} /> },
    { key: 'act', header: '', className: 'text-end', render: (l) => l.status === 'ACTIVE' ? <Button size="sm" variant="ghost" className="!text-danger" onClick={() => setCancel(l)}><Ban className="h-4 w-4" />{t('إلغاء', 'Cancel')}</Button> : null },
  ];

  return (
    <>
      <PageHeader title={t('السلف', 'Loans')} subtitle={t('سلف الموظفين وأقساطها الشهرية المخصومة من الرواتب', 'Employee loans and monthly payroll deductions')}
        actions={<Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" />{t('سلفة جديدة', 'New loan')}</Button>} />
      <SubNav items={PAYROLL_NAV} />
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t('سلف نشطة', 'Active loans')} value={num(active.length)} tone="accent" />
        <StatCard label={t('إجمالي المتبقي', 'Outstanding')} value={money(active.reduce((a, l) => a + l.remaining, 0), { decimals: 0 })} tone="danger" />
        <StatCard label={t('الأقساط الشهرية', 'Monthly installments')} value={money(active.reduce((a, l) => a + l.monthlyDeduction, 0), { decimals: 0 })} tone="info" />
      </div>
      <Card>
        <div className="border-b border-line p-4">
          <Chips value={status} onChange={setStatus} options={[
            { value: 'ACTIVE', label: t('نشطة', 'Active'), count: active.length },
            { value: 'PAID', label: t('مسددة', 'Paid'), count: all.filter((l) => l.status === 'PAID').length },
            { value: 'CANCELLED', label: t('ملغاة', 'Cancelled'), count: all.filter((l) => l.status === 'CANCELLED').length },
            { value: '', label: t('الكل', 'All'), count: all.length },
          ]} />
        </div>
        <Async loading={loading} error={error} onRetry={reload} hasData={!!data}>
          <Table columns={columns} rows={rows} rowKey={(l) => l.id} empty={<EmptyState title={t('لا توجد سلف', 'No loans')} />} />
        </Async>
      </Card>
      {adding && <LoanModal onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
      <ConfirmModal open={!!cancel} onClose={() => setCancel(null)} onConfirm={doCancel} danger loading={busy === 'cancel'} title={t('إلغاء السلفة', 'Cancel loan')}
        message={t('لن تُخصم أقساط هذه السلفة من الرواتب القادمة.', 'No further installments will be deducted.')} confirmLabel={t('إلغاء السلفة', 'Cancel loan')} />
    </>
  );
}

function LoanModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t, lang } = useLang();
  const { busy, run } = useAction();
  const { options } = useEmployeeOptions();
  const [f, setF] = useState({ employeeId: '', amount: '', monthlyDeduction: '', startPeriod: currentPeriod(), note: '' });
  const months = Number(f.amount) && Number(f.monthlyDeduction) ? Math.ceil(Number(f.amount) / Number(f.monthlyDeduction)) : 0;
  const valid = f.employeeId && Number(f.amount) > 0 && Number(f.monthlyDeduction) > 0 && Number(f.monthlyDeduction) <= Number(f.amount) && f.startPeriod;
  const save = async () => {
    if (valid && await run('save', () => api.post('/loans', { employeeId: f.employeeId, amount: Number(f.amount), monthlyDeduction: Number(f.monthlyDeduction), startPeriod: f.startPeriod, note: f.note || undefined }), t('تم تسجيل السلفة', 'Loan created'))) onSaved();
  };
  return (
    <Modal open onClose={onClose} title={t('سلفة جديدة', 'New loan')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('إلغاء', 'Cancel')}</Button><Button onClick={save} loading={busy === 'save'} disabled={!valid}>{t('حفظ', 'Save')}</Button></>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('الموظف', 'Employee')} required className="sm:col-span-2"><Select value={f.employeeId} onChange={(e) => setF({ ...f, employeeId: e.target.value })} options={options} placeholder={t('اختر موظفاً', 'Select employee')} /></Field>
        <Field label={t('مبلغ السلفة', 'Amount')} required><Input type="number" min={0} dir="ltr" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label={t('القسط الشهري', 'Monthly deduction')} required><Input type="number" min={0} dir="ltr" value={f.monthlyDeduction} onChange={(e) => setF({ ...f, monthlyDeduction: e.target.value })} /></Field>
        <Field label={t('بداية الخصم', 'Start period')} required><Input type="month" value={f.startPeriod} onChange={(e) => setF({ ...f, startPeriod: e.target.value })} /></Field>
        <div className="flex items-end">{months > 0 && <p className="w-full rounded-xl bg-primary-50 px-3 py-2.5 text-sm text-primary">{t('مدة السداد', 'Duration')}: <strong className="num">{months}</strong> {t('شهر', 'months')}</p>}</div>
        <Field label={t('ملاحظة', 'Note')} className="sm:col-span-2"><Textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </div>
      <p className="mt-3 text-xs text-ink-soft">{t('تنبيه: وفق المادة 92 لا يجوز أن تتجاوز الاستقطاعات 50% من الأجر الشهري.', 'Note: per Article 92, deductions may not exceed 50% of the monthly wage.')}</p>
    </Modal>
  );
}
