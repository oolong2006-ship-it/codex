'use client';
import { useMemo, useState } from 'react';
import { AlertTriangle, Calculator, FilePlus2, Trash2, UserX } from 'lucide-react';
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, Modal, Select, StatCard, Table, Textarea, type Column } from '@/components/ui';
import { api, type Paginated } from '@/lib/api';
import { useFetch } from '@/lib/useFetch';
import { useLang } from '@/lib/i18n';
import { date, minutesToHours, money, num, period, todayISO, currentPeriod } from '@/lib/format';
import { DOC_TYPE, EXPIRY_STATUS, REQUEST_STATUS, TERMINATION_REASON, label } from '@/lib/labels';
import type {
  AttendanceSummaryRow, DocumentType, EmployeeDetail, EmployeeDocument, EosbResult, ExpiryStatus, LeaveBalance, LeaveRequest,
  Payslip, PayrollRun, PayrollRunDetail, TerminationReason,
} from '@/lib/types';
import { Async, ConfirmModal, KV, StatusBadge } from './primitives';
import { PayslipModal } from './PayslipModal';
import { useAction } from './utils';

/** Client-side expiry status (mirrors core.expiryStatus) when the API omits it. */
export function expiryOf(d?: string | null): ExpiryStatus {
  if (!d) return 'NONE';
  const days = Math.floor((new Date(`${d.slice(0, 10)}T00:00:00`).getTime() - new Date(`${todayISO()}T00:00:00`).getTime()) / 86400000);
  if (days < 0) return 'EXPIRED';
  if (days <= 30) return 'CRITICAL';
  if (days <= 90) return 'WARNING';
  return 'OK';
}

// ---------------- Documents ----------------
export function DocumentsTab({ employee, canEdit, onChange }: { employee: EmployeeDetail; canEdit: boolean; onChange: () => void }) {
  const { t, lang } = useLang();
  const { busy, run } = useAction();
  const [adding, setAdding] = useState(false);
  const [del, setDel] = useState<EmployeeDocument | null>(null);
  const [f, setF] = useState({ type: 'IQAMA', number: '', issueDate: '', expiryDate: '', note: '' });
  const docs = employee.documents ?? [];
  const save = async () => {
    const ok = await run('add', () => api.post(`/employees/${employee.id}/documents`, {
      type: f.type as DocumentType, number: f.number || undefined, issueDate: f.issueDate || undefined, expiryDate: f.expiryDate || undefined, note: f.note || undefined,
    }), t('تمت إضافة المستند', 'Document added'));
    if (ok) { setAdding(false); setF({ type: 'IQAMA', number: '', issueDate: '', expiryDate: '', note: '' }); onChange(); }
  };
  const remove = async () => {
    if (!del) return;
    const ok = await run('del', () => api.del(`/employees/${employee.id}/documents/${del.id}`), t('تم حذف المستند', 'Document deleted'));
    if (ok) { setDel(null); onChange(); }
  };
  const columns: Column<EmployeeDocument>[] = [
    { key: 'type', header: t('النوع', 'Type'), render: (d) => <span className="font-medium">{label(DOC_TYPE, d.type, lang)}</span> },
    { key: 'num', header: t('الرقم', 'Number'), render: (d) => <span className="num text-ink-muted">{d.number || '—'}</span> },
    { key: 'issue', header: t('الإصدار', 'Issued'), render: (d) => date(d.issueDate, lang) },
    { key: 'exp', header: t('الانتهاء', 'Expiry'), render: (d) => date(d.expiryDate, lang) },
    { key: 'status', header: t('الحالة', 'Status'), render: (d) => <StatusBadge map={EXPIRY_STATUS} value={d.status ?? expiryOf(d.expiryDate)} /> },
    { key: 'note', header: t('ملاحظة', 'Note'), render: (d) => <span className="text-ink-muted">{d.note || '—'}</span> },
    ...(canEdit ? [{ key: 'act', header: '', className: 'text-end', render: (d: EmployeeDocument) => (
      <button onClick={(e) => { e.stopPropagation(); setDel(d); }} className="rounded-lg p-1.5 text-ink-soft hover:bg-danger-50 hover:text-danger" aria-label="delete"><Trash2 className="h-4 w-4" /></button>
    ) }] : []),
  ];
  return (
    <Card>
      <CardHeader title={t('المستندات', 'Documents')} subtitle={t('الإقامة والجواز والعقد مع تنبيهات الانتهاء', 'Iqama, passport, contract with expiry alerts')}
        action={canEdit && <Button size="sm" onClick={() => setAdding(true)}><FilePlus2 className="h-4 w-4" />{t('إضافة مستند', 'Add document')}</Button>} />
      <Table columns={columns} rows={docs} rowKey={(d) => d.id} empty={<EmptyState title={t('لا توجد مستندات', 'No documents')} />} />
      <Modal open={adding} onClose={() => setAdding(false)} title={t('إضافة مستند', 'Add document')}
        footer={<><Button variant="secondary" onClick={() => setAdding(false)}>{t('إلغاء', 'Cancel')}</Button><Button onClick={save} loading={busy === 'add'}>{t('حفظ', 'Save')}</Button></>}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('النوع', 'Type')} required>
            <Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} options={Object.entries(DOC_TYPE).map(([v, l]) => ({ value: v, label: lang === 'ar' ? l[0] : l[1] }))} />
          </Field>
          <Field label={t('رقم المستند', 'Number')}><Input dir="ltr" value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} /></Field>
          <Field label={t('تاريخ الإصدار', 'Issue date')}><Input type="date" value={f.issueDate} onChange={(e) => setF({ ...f, issueDate: e.target.value })} /></Field>
          <Field label={t('تاريخ الانتهاء', 'Expiry date')}><Input type="date" value={f.expiryDate} onChange={(e) => setF({ ...f, expiryDate: e.target.value })} /></Field>
          <Field label={t('ملاحظة', 'Note')} className="sm:col-span-2"><Textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        </div>
      </Modal>
      <ConfirmModal open={!!del} onClose={() => setDel(null)} onConfirm={remove} danger loading={busy === 'del'}
        title={t('حذف المستند', 'Delete document')} message={t('هل أنت متأكد من حذف هذا المستند؟ لا يمكن التراجع.', 'Delete this document? This cannot be undone.')} confirmLabel={t('حذف', 'Delete')} />
    </Card>
  );
}

// ---------------- Leaves ----------------
export function LeavesTab({ employee }: { employee: EmployeeDetail }) {
  const { t, lang } = useLang();
  const balances = useFetch(() => api.get<LeaveBalance[]>('/leaves/balances', { employeeId: employee.id }), [employee.id]);
  const history = useFetch(() => api.get<Paginated<LeaveRequest>>('/leaves', { employeeId: employee.id, pageSize: 50 }), [employee.id]);
  const lb = employee.leaveBalance;
  const columns: Column<LeaveRequest>[] = [
    { key: 'type', header: t('النوع', 'Type'), render: (l) => lang === 'ar' ? l.leaveType?.nameAr : l.leaveType?.nameEn || l.leaveType?.nameAr },
    { key: 'from', header: t('من', 'From'), render: (l) => date(l.startDate, lang) },
    { key: 'to', header: t('إلى', 'To'), render: (l) => date(l.endDate, lang) },
    { key: 'days', header: t('الأيام', 'Days'), render: (l) => <span className="num">{num(l.days)}</span> },
    { key: 'status', header: t('الحالة', 'Status'), render: (l) => <StatusBadge map={REQUEST_STATUS} value={l.status} /> },
    { key: 'by', header: t('المعتمد', 'Decided by'), render: (l) => <span className="text-ink-muted">{l.approverName || '—'}</span> },
  ];
  return (
    <div className="space-y-6">
      {lb && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label={t('الاستحقاق السنوي', 'Annual entitlement')} value={`${num(lb.entitlementPerYear)} ${t('يوم', 'd')}`} />
          <StatCard label={t('المستحق حتى الآن', 'Accrued')} value={num(lb.accrued, 1)} tone="info" />
          <StatCard label={t('المستخدم', 'Taken')} value={num(lb.taken, 1)} tone="accent" />
          <StatCard label={t('الرصيد المتاح', 'Balance')} value={num(lb.balance, 1)} tone="success" />
        </div>
      )}
      <Card>
        <CardHeader title={t('أرصدة الإجازات حسب النوع', 'Balances by type')} />
        <Async loading={balances.loading} error={balances.error} onRetry={balances.reload} hasData={!!balances.data}>
          <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {(balances.data ?? []).map((b) => (
              <div key={b.leaveTypeId} className="rounded-xl border border-line p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-ink">{lang === 'ar' ? b.nameAr : b.nameEn || b.nameAr}</p>
                  <Badge tone="neutral">{b.code}</Badge>
                </div>
                <div className="mt-3 flex items-end justify-between">
                  <p className="num text-2xl font-bold text-primary">{b.balance === null ? '∞' : num(b.balance, 1)}</p>
                  <p className="num text-xs text-ink-soft">{t('مستخدم', 'taken')} {num(b.taken)} / {b.entitlement === null ? '—' : num(b.entitlement)}</p>
                </div>
                {b.entitlement ? (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sand-200">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (b.taken / b.entitlement) * 100)}%` }} />
                  </div>
                ) : null}
              </div>
            ))}
            {balances.data && !balances.data.length && <EmptyState />}
          </div>
        </Async>
      </Card>
      <Card>
        <CardHeader title={t('سجل الإجازات', 'Leave history')} />
        <Async loading={history.loading} error={history.error} onRetry={history.reload} hasData={!!history.data}>
          <Table columns={columns} rows={history.data?.data ?? []} rowKey={(l) => l.id} empty={<EmptyState title={t('لا توجد إجازات', 'No leave requests')} />} />
        </Async>
      </Card>
    </div>
  );
}

// ---------------- Attendance ----------------
export function AttendanceTab({ employee }: { employee: EmployeeDetail }) {
  const { t, lang } = useLang();
  const [month, setMonth] = useState(currentPeriod());
  const from = `${month}-01`;
  const last = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const to = `${month}-${String(last).padStart(2, '0')}`;
  const { data, loading, error, reload } = useFetch(() => api.get<AttendanceSummaryRow[]>('/attendance/summary', { from, to, employeeId: employee.id }), [month, employee.id]);
  const row = data?.find((r) => r.employeeId === employee.id) ?? data?.[0];
  return (
    <Card>
      <CardHeader title={t('ملخص الحضور الشهري', 'Monthly attendance')} subtitle={period(month, lang)}
        action={<Input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="w-44" />} />
      <CardBody>
        <Async loading={loading} error={error} onRetry={reload} hasData={!!data}>
          {row ? (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              <StatCard label={t('أيام الحضور', 'Present days')} value={num(row.presentDays)} tone="success" />
              <StatCard label={t('أيام التأخير', 'Late days')} value={num(row.lateDays)} tone="accent" />
              <StatCard label={t('أيام الغياب', 'Absent days')} value={num(row.absentDays)} tone="danger" />
              <StatCard label={t('دقائق التأخير', 'Late minutes')} value={minutesToHours(row.lateMinutes)} hint={t('ساعة:دقيقة', 'h:mm')} />
              <StatCard label={t('العمل الإضافي', 'Overtime')} value={minutesToHours(row.overtimeMinutes)} tone="info" hint={t('ساعة:دقيقة', 'h:mm')} />
              <StatCard label={t('ساعات العمل', 'Worked hours')} value={num(row.workedHours, 1)} />
            </div>
          ) : <EmptyState title={t('لا توجد سجلات حضور لهذا الشهر', 'No attendance this month')} />}
        </Async>
      </CardBody>
    </Card>
  );
}

// ---------------- Payslips ----------------
export function PayslipsTab({ employee }: { employee: EmployeeDetail }) {
  const { t, lang } = useLang();
  const [open, setOpen] = useState<Payslip | null>(null);
  const { data, loading, error, reload } = useFetch(async () => {
    const runs = (await api.get<PayrollRun[]>('/payroll/runs')).filter((r) => r.status !== 'DRAFT')
      .sort((a, b) => b.period.localeCompare(a.period)).slice(0, 12);
    const details = await Promise.all(runs.map((r) => api.get<PayrollRunDetail>(`/payroll/runs/${r.id}`).catch(() => null)));
    return details.flatMap((d) => {
      const p = d?.payslips.find((s) => s.employeeId === employee.id);
      return p && d ? [{ ...p, runStatus: d.status }] : [];
    });
  }, [employee.id]);
  const columns: Column<Payslip & { runStatus: string }>[] = [
    { key: 'period', header: t('الفترة', 'Period'), render: (p) => <span className="font-medium">{period(p.period, lang)}</span> },
    { key: 'days', header: t('الأيام', 'Days'), render: (p) => <span className="num">{p.payableDays}</span> },
    { key: 'gross', header: t('الإجمالي', 'Gross'), render: (p) => <span className="num">{money(p.gross)}</span> },
    { key: 'ded', header: t('الاستقطاعات', 'Deductions'), render: (p) => <span className="num text-danger">{money(p.totalDeductions)}</span> },
    { key: 'net', header: t('الصافي', 'Net'), render: (p) => <span className="num font-semibold text-primary">{money(p.net)}</span> },
    { key: 'status', header: t('حالة المسير', 'Run status'), render: (p) => <StatusBadge map={{ CALCULATED: ['محسوب', 'Calculated'], APPROVED: ['معتمد', 'Approved'], PAID: ['مدفوع', 'Paid'] }} value={p.runStatus} /> },
  ];
  return (
    <Card>
      <CardHeader title={t('قسائم الرواتب', 'Payslips')} subtitle={t('آخر 12 مسيراً', 'Last 12 runs')} />
      <Async loading={loading} error={error} onRetry={reload} hasData={!!data}>
        <Table columns={columns} rows={data ?? []} rowKey={(p) => p.id} onRowClick={setOpen} empty={<EmptyState title={t('لا توجد قسائم بعد', 'No payslips yet')} />} />
      </Async>
      <PayslipModal payslip={open} onClose={() => setOpen(null)} />
    </Card>
  );
}

// ---------------- EOSB / termination ----------------
export function EosbTab({ employee, canTerminate, onTerminated }: { employee: EmployeeDetail; canTerminate: boolean; onTerminated: () => void }) {
  const { t, lang } = useLang();
  const terminated = employee.status === 'TERMINATED';
  const [endDate, setEndDate] = useState(employee.terminationDate?.slice(0, 10) || todayISO());
  const [reason, setReason] = useState<TerminationReason>((employee.terminationReason as TerminationReason) || 'EMPLOYER_TERMINATION');
  const [confirm, setConfirm] = useState(false);
  const [ack, setAck] = useState(false);
  const { busy, run } = useAction();
  const { data, loading, error, reload } = useFetch(() => api.get<EosbResult>(`/employees/${employee.id}/eosb`, { endDate, reason }), [employee.id, endDate, reason]);
  const reasons = useMemo(() => Object.entries(TERMINATION_REASON).map(([v, l]) => ({ value: v, label: lang === 'ar' ? l[0] : l[1] })), [lang]);
  const terminate = async () => {
    const ok = await run('term', () => api.post(`/employees/${employee.id}/terminate`, { terminationDate: endDate, reason }), t('تم إنهاء خدمة الموظف', 'Employee terminated'));
    if (ok) { setConfirm(false); setAck(false); onTerminated(); }
  };
  const wage = employee.basicSalary + employee.housingAllowance + employee.transportAllowance + employee.otherAllowances;
  const factorLabel = (f: number) => (f >= 1 ? t('كاملة', 'Full') : f <= 0 ? t('لا يستحق', 'None') : f < 0.5 ? t('الثلث', 'One third') : t('الثلثان', 'Two thirds'));
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,340px)_1fr]">
      <Card>
        <CardHeader title={t('معطيات الاحتساب', 'Inputs')} action={<Calculator className="h-5 w-5 text-accent" />} />
        <CardBody className="space-y-4">
          {terminated && <div className="rounded-xl bg-danger-50 p-3 text-sm text-danger">{t('انتهت خدمة الموظف بتاريخ', 'Terminated on')} {date(employee.terminationDate, lang)}</div>}
          <Field label={t('تاريخ انتهاء الخدمة', 'End date')}><Input type="date" value={endDate} onChange={(e) => e.target.value && setEndDate(e.target.value)} disabled={terminated} /></Field>
          <Field label={t('سبب انتهاء العلاقة', 'Termination reason')}>
            <Select value={reason} onChange={(e) => setReason(e.target.value as TerminationReason)} options={reasons} disabled={terminated} />
          </Field>
          <KV items={[
            { label: t('تاريخ المباشرة', 'Hire date'), value: date(employee.hireDate, lang) },
            { label: t('آخر أجر شامل', 'Last total wage'), value: <span className="num">{money(wage)}</span> },
          ]} />
          {canTerminate && !terminated && (
            <Button variant="danger" className="w-full" onClick={() => setConfirm(true)}><UserX className="h-4 w-4" />{t('إنهاء الخدمة', 'Terminate employment')}</Button>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={t('مكافأة نهاية الخدمة', 'End-of-service benefit')} subtitle={t('وفق المادتين 84 و85 من نظام العمل', 'Per Articles 84 & 85 of the Labor Law')} />
        <CardBody>
          <Async loading={loading} error={error} onRetry={reload} hasData={!!data}>
            {data && (
              <div className={loading ? 'opacity-60' : ''}>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Mini label={t('مدة الخدمة', 'Service')} value={`${data.service.years}${t('س', 'y')} ${data.service.months}${t('ش', 'm')} ${data.service.days}${t('ي', 'd')}`} />
                  <Mini label={t('المكافأة الكاملة', 'Full award')} value={money(data.fullAward, { decimals: 0 })} />
                  <Mini label={t('نسبة الاستحقاق', 'Factor')} value={factorLabel(data.factor)} />
                  <Mini label={t('تعويض الإجازات', 'Leave encashment')} value={money(data.leaveEncashment, { decimals: 0 })} />
                </div>
                <ul className="mt-5 divide-y divide-line rounded-xl border border-line">
                  {data.breakdown.map((b, i) => (
                    <li key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <span className="text-ink-muted">{lang === 'ar' ? b.labelAr : b.labelEn}</span>
                      <span className="num font-medium">{money(b.amount)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex items-center justify-between rounded-xl bg-primary px-5 py-4 text-white">
                  <span>{t('إجمالي المستحق', 'Total payable')}</span>
                  <span className="num text-2xl font-bold">{money(data.total)}</span>
                </div>
                {data.notesAr?.length > 0 && (
                  <ul className="mt-4 space-y-1 rounded-xl bg-sand p-3 text-xs text-ink-muted">
                    {data.notesAr.map((n, i) => <li key={i}>• {n}</li>)}
                  </ul>
                )}
              </div>
            )}
          </Async>
        </CardBody>
      </Card>
      <ConfirmModal open={confirm} onClose={() => { setConfirm(false); setAck(false); }} onConfirm={() => ack && terminate()} danger loading={busy === 'term'}
        title={t('تأكيد إنهاء الخدمة', 'Confirm termination')} confirmLabel={t('إنهاء الخدمة', 'Terminate')}
        message={<div className="space-y-3">
          <p className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            {t('سيتم تغيير حالة الموظف إلى "منتهية خدمته" وإيقاف دخوله للتطبيق. هذا الإجراء لا يمكن التراجع عنه بسهولة.', 'The employee will be marked as terminated and their app access disabled.')}</p>
          <div className="rounded-xl bg-sand p-3">
            <p>{label(TERMINATION_REASON, reason, lang)} · {date(endDate, lang)}</p>
            {data && <p className="num mt-1 font-semibold text-primary">{t('المستحق', 'Payable')}: {money(data.total)}</p>}
          </div>
          <label className="flex items-center gap-2 text-ink"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="h-4 w-4 accent-[#C2412D]" />{t('أؤكد رغبتي في إنهاء الخدمة', 'I confirm this termination')}</label>
        </div>} />
    </div>
  );
}

function Mini({ label: l, value }: { label: string; value: React.ReactNode }) {
  return <div className="rounded-xl bg-sand p-3"><p className="text-xs text-ink-soft">{l}</p><p className="num mt-1 text-sm font-bold text-ink">{value}</p></div>;
}

