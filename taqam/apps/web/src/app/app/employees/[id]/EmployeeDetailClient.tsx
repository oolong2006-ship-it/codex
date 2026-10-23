'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowRight, Building2, Calendar, Mail, Pencil, Phone, BadgeCheck } from 'lucide-react';
import { Badge, Button, Card, CardBody, CardHeader, Tabs } from '@/components/ui';
import { Async, Avatar, KV, StatusBadge } from '@/components/app/primitives';
import { EmployeeFormModal, nationalityLabel } from '@/components/app/EmployeeForm';
import { AttendanceTab, DocumentsTab, EosbTab, LeavesTab, PayslipsTab, expiryOf } from '@/components/app/EmployeeTabs';
import { can, ADMIN, ADMIN_PAYROLL, employeeName } from '@/components/app/utils';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFetch } from '@/lib/useFetch';
import { useLang } from '@/lib/i18n';
import { date, money, num } from '@/lib/format';
import { EMPLOYEE_STATUS, EXPIRY_STATUS, ROLE, TERMINATION_REASON, label } from '@/lib/labels';
import type { EmployeeDetail } from '@/lib/types';

type Tab = 'overview' | 'job' | 'documents' | 'leaves' | 'attendance' | 'payslips' | 'eosb';

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = useLang();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const [editing, setEditing] = useState<false | 'personal' | 'job' | 'salary'>(false);
  const { data: e, loading, error, reload, setData } = useFetch(() => api.get<EmployeeDetail>(`/employees/${id}`), [id]);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('tab') as Tab | null;
    if (q) setTab(q);
  }, []);

  const admin = can(user, ADMIN);
  const finance = can(user, ADMIN_PAYROLL);
  const tabs: { value: Tab; label: string; count?: number }[] = [
    { value: 'overview', label: t('نظرة عامة', 'Overview') },
    { value: 'job', label: t('الوظيفة والراتب', 'Job & salary') },
    { value: 'documents', label: t('المستندات', 'Documents'), count: e?.documents?.length },
    { value: 'leaves', label: t('الإجازات', 'Leave') },
    { value: 'attendance', label: t('الحضور', 'Attendance') },
    ...(finance ? [{ value: 'payslips' as Tab, label: t('قسائم الرواتب', 'Payslips') }, { value: 'eosb' as Tab, label: t('نهاية الخدمة', 'End of service') }] : []),
  ];
  const wage = e ? e.basicSalary + e.housingAllowance + e.transportAllowance + e.otherAllowances : 0;

  return (
    <>
      <Link href="/app/employees" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-primary">
        <ArrowRight className="h-4 w-4 ltr:rotate-180" />{t('الموظفون', 'Employees')}
      </Link>
      <Async loading={loading} error={error} onRetry={reload} hasData={!!e}>
        {e && (
          <>
            <Card className="mb-6 overflow-hidden">
              <div className="taqam-pattern h-20 bg-primary" />
              <div className="flex flex-col gap-4 px-5 pb-5 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <Avatar name={employeeName(e, lang)} color={e.avatarColor} size="xl" className="-mt-8 ring-4 ring-white" />
                  <div className="sm:pt-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-xl font-bold text-ink">{employeeName(e, lang)}</h1>
                      <StatusBadge map={EMPLOYEE_STATUS} value={e.status} />
                      {e.isSaudi && <Badge tone="primary">{t('سعودي', 'Saudi')}</Badge>}
                    </div>
                    <p className="text-sm text-ink-muted">{e.jobTitle} · <span className="num">{e.employeeNumber}</span></p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
                      {e.branch && <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{e.branch.nameAr}</span>}
                      <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{date(e.hireDate, lang)}</span>
                      {e.phone && <a href={`tel:${e.phone}`} className="inline-flex items-center gap-1 hover:text-primary" dir="ltr"><Phone className="h-3.5 w-3.5" />{e.phone}</a>}
                      {e.email && <a href={`mailto:${e.email}`} className="inline-flex items-center gap-1 hover:text-primary" dir="ltr"><Mail className="h-3.5 w-3.5" />{e.email}</a>}
                    </div>
                  </div>
                </div>
                {admin && e.status !== 'TERMINATED' && (
                  <Button variant="secondary" onClick={() => setEditing('personal')}><Pencil className="h-4 w-4" />{t('تعديل', 'Edit')}</Button>
                )}
              </div>
            </Card>

            <Tabs tabs={tabs} value={tab} onChange={setTab} className="mb-6" />

            {tab === 'overview' && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                  <CardHeader title={t('البيانات الشخصية', 'Personal information')}
                    action={admin && <Button size="sm" variant="ghost" onClick={() => setEditing('personal')}><Pencil className="h-3.5 w-3.5" /></Button>} />
                  <CardBody>
                    <KV cols={3} items={[
                      { label: t('الاسم (إنجليزي)', 'Name (English)'), value: <span dir="ltr">{e.fullNameEn || '—'}</span> },
                      { label: t('الجنسية', 'Nationality'), value: nationalityLabel(e.nationality, lang) },
                      { label: t('الجنس', 'Gender'), value: e.gender === 'FEMALE' ? t('أنثى', 'Female') : t('ذكر', 'Male') },
                      { label: t('تاريخ الميلاد', 'Birth date'), value: date(e.birthDate, lang) },
                      { label: e.isSaudi ? t('الهوية الوطنية', 'National ID') : t('رقم الإقامة', 'Iqama'), value: <span className="num">{e.nationalId}</span> },
                      { label: t('انتهاء الهوية', 'ID expiry'), value: <span className="inline-flex items-center gap-2">{date(e.idExpiry, lang)} {e.idExpiry && <ExpBadge d={e.idExpiry} />}</span> },
                      { label: t('رقم الجواز', 'Passport'), value: <span className="num">{e.passportNumber || '—'}</span> },
                      { label: t('انتهاء الجواز', 'Passport expiry'), value: <span className="inline-flex items-center gap-2">{date(e.passportExpiry, lang)} {e.passportExpiry && <ExpBadge d={e.passportExpiry} />}</span> },
                      { label: t('الحالة الاجتماعية', 'Marital status'), value: e.maritalStatus || '—' },
                    ]} />
                  </CardBody>
                </Card>
                <div className="space-y-6">
                  <Card>
                    <CardHeader title={t('ملخص', 'Summary')} />
                    <CardBody className="space-y-3 text-sm">
                      <Row label={t('القسم', 'Department')} value={e.department?.name} />
                      <Row label={t('المدير المباشر', 'Manager')} value={e.manager ? <Link className="text-primary-500 hover:underline" href={`/app/employees/${e.manager.id}`}>{e.manager.name}</Link> : null} />
                      {finance && <Row label={t('الأجر الشهري', 'Monthly wage')} value={<span className="num font-semibold">{money(wage)}</span>} />}
                      {e.leaveBalance && <Row label={t('رصيد الإجازة السنوية', 'Annual leave balance')} value={<span className="num">{num(e.leaveBalance.balance, 1)} {t('يوم', 'days')}</span>} />}
                      {e.status === 'TERMINATED' && <Row label={t('سبب الإنهاء', 'Termination')} value={label(TERMINATION_REASON, e.terminationReason, lang)} />}
                    </CardBody>
                  </Card>
                  <Card>
                    <CardHeader title={t('حساب التطبيق', 'App account')} />
                    <CardBody className="text-sm">
                      {e.user ? (
                        <div className="flex items-center gap-3">
                          <BadgeCheck className="h-5 w-5 text-success" />
                          <div><p className="font-medium" dir="ltr">{e.user.email}</p><p className="text-xs text-ink-soft">{label(ROLE, e.user.role, lang)}</p></div>
                        </div>
                      ) : <p className="text-ink-muted">{t('لا يملك حساب دخول للخدمة الذاتية.', 'No self-service login.')}{admin && <> <Link href="/app/settings?tab=users" className="text-primary-500 hover:underline">{t('إنشاء حساب', 'Create one')}</Link></>}</p>}
                    </CardBody>
                  </Card>
                </div>
              </div>
            )}

            {tab === 'job' && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Card>
                  <CardHeader title={t('بيانات الوظيفة', 'Job details')} action={admin && <Button size="sm" variant="ghost" onClick={() => setEditing('job')}><Pencil className="h-3.5 w-3.5" /></Button>} />
                  <CardBody>
                    <KV items={[
                      { label: t('المسمى الوظيفي', 'Job title'), value: e.jobTitle },
                      { label: t('الفرع', 'Branch'), value: e.branch?.nameAr },
                      { label: t('القسم', 'Department'), value: e.department?.name },
                      { label: t('المدير المباشر', 'Manager'), value: e.manager?.name },
                      { label: t('تاريخ المباشرة', 'Hire date'), value: date(e.hireDate, lang) },
                      { label: t('نهاية التجربة', 'Probation end'), value: date(e.probationEndDate, lang) },
                      { label: t('نوع العقد', 'Contract'), value: e.contractType === 'FIXED' ? t('محدد المدة', 'Fixed term') : t('غير محدد المدة', 'Unlimited') },
                      { label: t('نهاية العقد', 'Contract end'), value: date(e.contractEndDate, lang) },
                      { label: t('ساعات العمل اليومية', 'Hours/day'), value: <span className="num">{e.hoursPerDay}</span> },
                    ]} />
                  </CardBody>
                </Card>
                {finance ? (
                  <Card>
                    <CardHeader title={t('الراتب والبدلات', 'Salary & allowances')} action={admin && <Button size="sm" variant="ghost" onClick={() => setEditing('salary')}><Pencil className="h-3.5 w-3.5" /></Button>} />
                    <CardBody className="space-y-2">
                      {[
                        [t('الراتب الأساسي', 'Basic'), e.basicSalary], [t('بدل السكن', 'Housing'), e.housingAllowance],
                        [t('بدل النقل', 'Transport'), e.transportAllowance], [t('بدلات أخرى', 'Other'), e.otherAllowances],
                      ].map(([l, v]) => (
                        <div key={String(l)} className="flex items-center justify-between rounded-xl bg-sand/70 px-4 py-2.5 text-sm">
                          <span className="text-ink-muted">{l}</span><span className="num font-medium">{money(Number(v))}</span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between rounded-xl bg-primary px-4 py-3 text-white">
                        <span>{t('الإجمالي', 'Total')}</span><span className="num text-lg font-bold">{money(wage)}</span>
                      </div>
                      <div className="pt-3"><KV items={[
                        { label: 'IBAN', value: <span className="num" dir="ltr">{e.iban || '—'}</span> },
                        { label: t('رمز البنك', 'Bank code'), value: <span className="num">{e.bankCode || '—'}</span> },
                        { label: t('التأمينات الاجتماعية', 'GOSI'), value: e.gosiRegistered ? <Badge tone="success">{t('مسجل', 'Registered')}</Badge> : <Badge tone="warning">{t('غير مسجل', 'Not registered')}</Badge> },
                      ]} /></div>
                    </CardBody>
                  </Card>
                ) : null}
              </div>
            )}

            {tab === 'documents' && <DocumentsTab employee={e} canEdit={admin} onChange={reload} />}
            {tab === 'leaves' && <LeavesTab employee={e} />}
            {tab === 'attendance' && <AttendanceTab employee={e} />}
            {tab === 'payslips' && finance && <PayslipsTab employee={e} />}
            {tab === 'eosb' && finance && <EosbTab employee={e} canTerminate={admin} onTerminated={reload} />}

            {editing && (
              <EmployeeFormModal open employee={e} initialSection={editing} onClose={() => setEditing(false)}
                onSaved={(u) => { setEditing(false); setData({ ...e, ...u }); void reload(); }} />
            )}
          </>
        )}
      </Async>
    </>
  );
}

function Row({ label: l, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3"><span className="text-ink-muted">{l}</span><span className="text-end text-ink">{value ?? '—'}</span></div>;
}
function ExpBadge({ d }: { d: string }) {
  const s = expiryOf(d);
  return s === 'OK' ? null : <StatusBadge map={EXPIRY_STATUS} value={s} />;
}
