'use client';
import clsx from 'clsx';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight, Ban, Building2, CalendarPlus, CheckCircle2, LogIn, Mail, MoreHorizontal, Pencil, Phone, RotateCcw, Trash2, KeyRound, AlertOctagon, Save,
} from 'lucide-react';
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Table, Tabs, Textarea, type Column } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { Async, Avatar, ConfirmModal, KV } from '@/components/app/primitives';
import { errMsg } from '@/components/app/utils';
import { ActivateModal, DeleteCompanyModal, EditSubscriptionModal, ExtendModal, ResetPasswordModal, SuspendModal } from '@/components/admin/CompanyModals';
import { CompanyStatusChip, DaysLeft, PlanBadge, SeatBar, timeAgo } from '@/components/admin/primitives';
import { impersonateCompany } from '@/components/admin/ImpersonationBanner';
import { refreshAdminCounts } from '@/components/admin/AdminShell';
import { Timeline } from '@/components/admin/Timeline';
import { api } from '@/lib/api';
import { useLang } from '@/lib/i18n';
import { useFetch } from '@/lib/useFetch';
import { date, money, num, period } from '@/lib/format';
import { label, ROLE, SECTOR } from '@/lib/labels';
import { BILLING_CYCLE, COMPANY_STATUS, PLAN, companyName, lbl, type AdminCompanyDetail, type AdminCompanyUser } from '@/lib/adminTypes';

type Tab = 'overview' | 'subscription' | 'users' | 'log' | 'notes';
type ModalKey = 'activate' | 'suspend' | 'edit' | 'extend' | 'delete' | 'impersonate' | 'reactivate' | null;

export default function CompanyDetailClient() {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = useLang();
  const router = useRouter();
  const toast = useToast();
  const { data: c, loading, error, reload } = useFetch(() => api.get<AdminCompanyDetail>(`/admin/companies/${id}`), [id]);
  const [tab, setTab] = useState<Tab>('overview');
  const [modal, setModal] = useState<ModalKey>(null);
  const [resetUser, setResetUser] = useState<AdminCompanyUser | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('tab') as Tab | null;
    if (q && ['overview', 'subscription', 'users', 'log', 'notes'].includes(q)) setTab(q);
  }, []);
  const close = () => setModal(null);
  const done = () => { void reload(); };

  const reactivate = async () => {
    if (!c) return;
    setBusy(true);
    try { await api.post(`/admin/companies/${c.id}/reactivate`, {}); toast(t('تمت إعادة تفعيل المنشأة', 'Company reactivated')); refreshAdminCounts(); close(); done(); }
    catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };
  const impersonate = async () => {
    if (!c) return;
    setBusy(true);
    try { await impersonateCompany(c.id); }
    catch (e) { toast(errMsg(e), 'error'); setBusy(false); }
  };

  return (
    <div>
      <Link href="/admin/companies" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-primary">
        <ArrowRight className="h-4 w-4 ltr:rotate-180" />{t('المنشآت', 'Companies')}
      </Link>
      <Async loading={loading} error={error} onRetry={reload} hasData={!!c}>
        {c && (
          <>
            {/* Header */}
            <Card className="mb-4 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 items-start gap-4">
                  <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary sm:flex"><Building2 className="h-7 w-7" /></div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-2xl font-bold text-ink">{companyName(c, lang)}</h1>
                      <CompanyStatusChip status={c.status} />
                      <PlanBadge plan={c.plan} />
                    </div>
                    {c.nameEn && lang === 'ar' && <p className="mt-0.5 text-sm text-ink-soft" dir="ltr">{c.nameEn}</p>}
                    <p className="mt-1 text-sm text-ink-muted">
                      {[label(SECTOR, c.sector, lang), c.city, c.crNumber && `${t('س.ت', 'CR')} ${c.crNumber}`].filter(Boolean).join(' · ')}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-soft">{t('سُجلت', 'Registered')} {date(c.createdAt, lang)} · {t('آخر نشاط', 'Last activity')} {timeAgo(c.lastActivityAt, lang)}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {c.status === 'PENDING' && <Button onClick={() => setModal('activate')}><CheckCircle2 className="h-4 w-4" />{t('تفعيل', 'Activate')}</Button>}
                  {c.status === 'SUSPENDED' && <Button onClick={() => setModal('reactivate')}><RotateCcw className="h-4 w-4" />{t('إعادة تفعيل', 'Reactivate')}</Button>}
                  {c.status === 'EXPIRED' && <Button onClick={() => setModal('extend')}><CalendarPlus className="h-4 w-4" />{t('تجديد / تمديد', 'Renew / extend')}</Button>}
                  {(c.status === 'TRIAL' || c.status === 'ACTIVE') && (
                    <Button variant="secondary" className="!text-danger hover:!border-danger hover:!bg-danger-50" onClick={() => setModal('suspend')}><Ban className="h-4 w-4" />{t('إيقاف', 'Suspend')}</Button>
                  )}
                  <Button variant="secondary" onClick={() => setModal('impersonate')}><LogIn className="h-4 w-4 rtl:rotate-180" />{t('الدخول كمالك المنشأة', 'Log in as owner')}</Button>
                  <MoreMenu items={[
                    { label: t('تعديل الاشتراك', 'Edit subscription'), icon: Pencil, onClick: () => setModal('edit') },
                    ...(c.status !== 'PENDING' ? [{ label: t('تمديد', 'Extend'), icon: CalendarPlus, onClick: () => setModal('extend') }] : []),
                    ...(c.status === 'EXPIRED' || c.status === 'TRIAL' ? [{ label: t('تفعيل اشتراك مدفوع', 'Activate paid plan'), icon: CheckCircle2, onClick: () => setModal('activate') }] : []),
                    ...(c.status === 'EXPIRED' ? [{ label: t('إيقاف', 'Suspend'), icon: Ban, onClick: () => setModal('suspend') }] : []),
                    { label: t('حذف المنشأة', 'Delete company'), icon: Trash2, onClick: () => setModal('delete'), danger: true },
                  ]} />
                </div>
              </div>
              {c.status === 'SUSPENDED' && (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-danger/20 bg-danger-50 px-3 py-2.5 text-sm text-danger">
                  <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0" />
                  <span><b>{t('موقوفة', 'Suspended')}</b>{c.suspendedAt && ` · ${date(c.suspendedAt, lang)}`} — {c.suspensionReason || t('بدون سبب', 'No reason given')}</span>
                </div>
              )}
              {c.status === 'PENDING' && (
                <div className="mt-4 rounded-xl border border-warning/40 bg-warning-50 px-3 py-2.5 text-sm text-warning">
                  {t('هذه المنشأة بانتظار موافقتك — لا يمكن لمستخدميها الدخول حتى التفعيل.', 'This company awaits your approval — its users cannot sign in until activated.')}
                </div>
              )}
            </Card>

            <Tabs<Tab> value={tab} onChange={setTab} className="mb-4" tabs={[
              { value: 'overview', label: t('نظرة عامة', 'Overview') },
              { value: 'subscription', label: t('الاشتراك', 'Subscription') },
              { value: 'users', label: t('المستخدمون', 'Users'), count: c.users.length },
              { value: 'log', label: t('السجل', 'Log'), count: c.events.length },
              { value: 'notes', label: t('ملاحظات داخلية', 'Internal notes') },
            ]} />

            {tab === 'overview' && <OverviewTab c={c} />}
            {tab === 'subscription' && <SubscriptionTab c={c} onEdit={() => setModal('edit')} onExtend={() => setModal('extend')} />}
            {tab === 'users' && <UsersTab users={c.users} onReset={setResetUser} />}
            {tab === 'log' && <Card><CardBody><Timeline events={c.events} /></CardBody></Card>}
            {tab === 'notes' && <NotesTab c={c} onSaved={done} />}
          </>
        )}
      </Async>

      {c && (
        <>
          <ActivateModal company={c} open={modal === 'activate'} onClose={close} onDone={done} />
          <SuspendModal company={c} open={modal === 'suspend'} onClose={close} onDone={done} />
          <EditSubscriptionModal company={c} open={modal === 'edit'} onClose={close} onDone={done} />
          <ExtendModal company={c} open={modal === 'extend'} onClose={close} onDone={done} />
          <DeleteCompanyModal company={c} open={modal === 'delete'} onClose={close} onDone={() => router.replace('/admin/companies')} />
          <ResetPasswordModal companyId={c.id} user={resetUser} onClose={() => setResetUser(null)} />
          <ConfirmModal open={modal === 'reactivate'} onClose={close} onConfirm={reactivate} loading={busy}
            title={t('إعادة تفعيل المنشأة', 'Reactivate company')} confirmLabel={t('إعادة تفعيل', 'Reactivate')}
            message={t('ستعود المنشأة إلى «نشط» (أو «تجريبي» إذا لم تنتهِ فترتها التجريبية) ويتمكن مستخدموها من الدخول.', 'The company returns to Active (or Trial if its trial has not ended) and its users can sign in again.')} />
          <ConfirmModal open={modal === 'impersonate'} onClose={close} onConfirm={impersonate} loading={busy}
            title={t('الدخول كمالك المنشأة', 'Log in as company owner')} confirmLabel={t('متابعة', 'Continue')}
            message={<>
              <p>{t(`ستتصفح لوحة «${companyName(c, lang)}» بصلاحيات المالك (${c.ownerName ?? ''}) لمدة ساعة.`, `You will browse “${companyName(c, lang)}” as its owner (${c.ownerName ?? ''}) for one hour.`)}</p>
              <p className="mt-2 text-xs text-ink-soft">{t('يُسجَّل هذا الدخول في سجل المنشأة. يمكنك العودة إلى بوابة المنصة من الشريط العلوي.', 'This is recorded in the company log. Use the top banner to return to the platform portal.')}</p>
            </>} />
        </>
      )}
    </div>
  );
}

function MoreMenu({ items }: { items: { label: string; icon: React.ComponentType<{ className?: string }>; onClick: () => void; danger?: boolean }[] }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div ref={ref} className="relative">
      <Button variant="secondary" onClick={() => setOpen((o) => !o)} aria-label={t('المزيد', 'More')}><MoreHorizontal className="h-4 w-4" /></Button>
      {open && (
        <div className="absolute start-0 top-12 z-20 w-56 lg:start-auto lg:end-0 overflow-hidden rounded-2xl border border-line bg-white py-1 shadow-lift">
          {items.map((i) => (
            <button key={i.label} onClick={() => { setOpen(false); i.onClick(); }}
              className={clsx('flex w-full items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-sand', i.danger ? 'border-t border-line text-danger' : 'text-ink')}>
              <i.icon className={clsx('h-4 w-4', i.danger ? 'text-danger' : 'text-ink-soft')} />{i.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function UsageStat({ label: l, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-sand/50 p-3">
      <p className="text-xs text-ink-soft">{l}</p>
      <p className="num mt-1 text-xl font-bold text-ink">{value}</p>
    </div>
  );
}

function OverviewTab({ c }: { c: AdminCompanyDetail }) {
  const { t, lang } = useLang();
  const u = c.usage;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title={t('الاستخدام', 'Usage')} subtitle={t('نشاط المنشأة على المنصة', 'How the company uses Taqam')} />
        <CardBody>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <UsageStat label={t('الموظفون', 'Employees')} value={num(u.employees)} />
            <UsageStat label={t('النشطون', 'Active')} value={num(u.activeEmployees)} />
            <UsageStat label={t('الفروع', 'Branches')} value={num(u.branches)} />
            <UsageStat label={t('المستخدمون', 'Users')} value={num(u.users)} />
            <UsageStat label={t('مسيرات الرواتب', 'Payroll runs')} value={num(u.payrollRuns)} />
            <UsageStat label={t('آخر مسير', 'Last payroll')} value={<span className="text-base">{period(u.lastPayrollPeriod, lang)}</span>} />
            <UsageStat label={t('طلبات إجازة (30 يوماً)', 'Leave requests (30d)')} value={num(u.leaveRequests30d)} />
            <UsageStat label={t('تسجيلات حضور (30 يوماً)', 'Check-ins (30d)')} value={num(u.checkIns30d)} />
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={t('المالك', 'Owner')} />
        <CardBody>
          {c.owner ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Avatar name={c.owner.name} />
                <div className="min-w-0"><p className="truncate font-semibold text-ink">{c.owner.name}</p><p className="text-xs text-ink-soft">{t('مالك المنشأة', 'Company owner')}</p></div>
              </div>
              <a href={`mailto:${c.owner.email}`} className="flex items-center gap-2 text-sm text-primary-500 hover:underline" dir="ltr"><Mail className="h-4 w-4 shrink-0" /><span className="truncate">{c.owner.email}</span></a>
              {(c.owner.phone || c.ownerPhone) && <a href={`tel:${c.owner.phone || c.ownerPhone}`} className="flex items-center gap-2 text-sm text-primary-500 hover:underline" dir="ltr"><Phone className="h-4 w-4 shrink-0" />{c.owner.phone || c.ownerPhone}</a>}
            </div>
          ) : <p className="text-sm text-ink-muted">{t('لا يوجد مالك مسجل', 'No owner on file')}</p>}
        </CardBody>
      </Card>
      <Card className="lg:col-span-3">
        <CardHeader title={t('بيانات المنشأة', 'Company details')} />
        <CardBody>
          <KV cols={3} items={[
            { label: t('الاسم بالعربية', 'Arabic name'), value: c.nameAr },
            { label: t('الاسم بالإنجليزية', 'English name'), value: c.nameEn || '—' },
            { label: t('القطاع', 'Sector'), value: label(SECTOR, c.sector, lang) },
            { label: t('المدينة', 'City'), value: c.city || '—' },
            { label: t('السجل التجاري', 'CR number'), value: <span className="num">{c.crNumber || '—'}</span> },
            { label: t('الحالة', 'Status'), value: lbl(COMPANY_STATUS, c.status, lang) },
            { label: t('تاريخ التسجيل', 'Registered'), value: date(c.createdAt, lang) },
            { label: t('تاريخ التفعيل', 'Activated'), value: date(c.activatedAt, lang) },
            { label: t('آخر نشاط', 'Last activity'), value: timeAgo(c.lastActivityAt, lang) },
          ]} />
        </CardBody>
      </Card>
    </div>
  );
}

function SubscriptionTab({ c, onEdit, onExtend }: { c: AdminCompanyDetail; onEdit: () => void; onExtend: () => void }) {
  const { t, lang } = useLang();
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title={t('تفاصيل الاشتراك', 'Subscription details')}
          action={<div className="flex gap-2">
            {c.status !== 'PENDING' && <Button size="sm" variant="secondary" onClick={onExtend}><CalendarPlus className="h-4 w-4" />{t('تمديد', 'Extend')}</Button>}
            <Button size="sm" onClick={onEdit}><Pencil className="h-4 w-4" />{t('تعديل', 'Edit')}</Button>
          </div>} />
        <CardBody>
          <KV cols={3} items={[
            { label: t('الباقة', 'Plan'), value: lbl(PLAN, c.plan, lang) },
            { label: t('دورة الفوترة', 'Billing cycle'), value: lbl(BILLING_CYCLE, c.billingCycle, lang) },
            { label: t('السعر الفعلي للموظف', 'Effective price / employee'), value: c.effectivePrice != null ? money(c.effectivePrice) : t('حسب الاتفاق', 'Negotiated') },
            { label: t('سعر خاص', 'Price override'), value: c.pricePerEmployee != null ? money(c.pricePerEmployee) : t('سعر القائمة', 'List price') },
            { label: t('نهاية الفترة التجريبية', 'Trial ends'), value: date(c.trialEndsAt, lang) },
            { label: t('نهاية الاشتراك', 'Subscription ends'), value: c.subscriptionEndsAt ? date(c.subscriptionEndsAt, lang) : t('مفتوح', 'Open-ended') },
            { label: t('الأيام المتبقية', 'Days left'), value: <DaysLeft days={c.daysLeft} /> },
            { label: t('تاريخ التفعيل', 'Activated'), value: date(c.activatedAt, lang) },
            { label: t('الحالة', 'Status'), value: <CompanyStatusChip status={c.status} /> },
          ]} />
        </CardBody>
      </Card>
      <div className="space-y-4">
        <Card className="p-5">
          <p className="text-sm text-ink-muted">{t('الإيراد الشهري (MRR)', 'MRR')}</p>
          <p className="num mt-1 text-2xl font-bold text-ink">{money(c.mrr, { decimals: 0 })}</p>
          <p className="mt-1 text-xs text-ink-soft">
            {c.status === 'ACTIVE'
              ? t(`${c.activeEmployees} موظف نشط × ${c.effectivePrice ?? '—'} ر.س${c.billingCycle === 'ANNUAL' ? ' (خصم سنوي)' : ''}`, `${c.activeEmployees} active × SAR ${c.effectivePrice ?? '—'}${c.billingCycle === 'ANNUAL' ? ' (annual discount)' : ''}`)
              : t('يُحتسب للمنشآت النشطة فقط', 'Counted for active companies only')}
          </p>
        </Card>
        <Card className="p-5">
          <p className="mb-2 text-sm text-ink-muted">{t('المقاعد المستخدمة', 'Seats used')}</p>
          <SeatBar used={c.activeEmployees} max={c.maxEmployees} />
          {c.maxEmployees != null && c.activeEmployees >= c.maxEmployees && (
            <Badge tone="danger" className="mt-3">{t('وصلت للحد الأقصى', 'Seat limit reached')}</Badge>
          )}
        </Card>
      </div>
    </div>
  );
}

function UsersTab({ users, onReset }: { users: AdminCompanyUser[]; onReset: (u: AdminCompanyUser) => void }) {
  const { t, lang } = useLang();
  const cols: Column<AdminCompanyUser>[] = [
    { key: 'name', header: t('المستخدم', 'User'), render: (u) => (
      <div className="flex items-center gap-2.5"><Avatar name={u.name} size="sm" /><div className="min-w-0"><p className="font-medium text-ink">{u.name}</p><p className="text-xs text-ink-soft" dir="ltr">{u.email}</p></div></div>
    ) },
    { key: 'role', header: t('الدور', 'Role'), render: (u) => label(ROLE, u.role, lang) },
    { key: 'active', header: t('الحالة', 'Status'), render: (u) => <Badge tone={u.isActive ? 'success' : 'neutral'}>{u.isActive ? t('مفعّل', 'Active') : t('معطّل', 'Disabled')}</Badge> },
    { key: 'login', header: t('آخر دخول', 'Last login'), render: (u) => <span className="text-xs text-ink-muted">{u.lastLoginAt ? timeAgo(u.lastLoginAt, lang) : t('لم يسجل دخولاً', 'Never')}</span> },
    { key: 'act', header: '', render: (u) => <Button size="sm" variant="ghost" onClick={() => onReset(u)}><KeyRound className="h-4 w-4" />{t('إعادة تعيين كلمة المرور', 'Reset password')}</Button> },
  ];
  return <Card><Table columns={cols} rows={users} rowKey={(u) => u.id} empty={<EmptyState title={t('لا يوجد مستخدمون', 'No users')} />} /></Card>;
}

function NotesTab({ c, onSaved }: { c: AdminCompanyDetail; onSaved: () => void }) {
  const { t } = useLang();
  const toast = useToast();
  const [notes, setNotes] = useState(c.adminNotes ?? '');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setNotes(c.adminNotes ?? ''); }, [c.adminNotes]);
  const dirty = notes !== (c.adminNotes ?? '');
  const save = async () => {
    setBusy(true);
    try { await api.patch(`/admin/companies/${c.id}`, { adminNotes: notes }); toast(t('تم حفظ الملاحظات', 'Notes saved')); onSaved(); }
    catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };
  return (
    <Card>
      <CardHeader title={t('ملاحظات داخلية', 'Internal notes')} subtitle={t('لا تظهر للمنشأة أبداً', 'Never shown to the company')} />
      <CardBody>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[180px]" placeholder={t('مثال: تواصلنا مع المالك بخصوص الترقية لباقة المؤسسات…', 'e.g. Spoke with the owner about upgrading to Enterprise…')} />
        <div className="mt-3 flex justify-end">
          <Button onClick={save} loading={busy} disabled={!dirty}><Save className="h-4 w-4" />{t('حفظ', 'Save')}</Button>
        </div>
      </CardBody>
    </Card>
  );
}
