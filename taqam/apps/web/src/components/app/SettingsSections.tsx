'use client';
import { useEffect, useState } from 'react';
import { Pencil, Plus, Save, Trash2, UserPlus, ChevronDown } from 'lucide-react';
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, Modal, Pagination, Select, Table, type Column } from '@/components/ui';
import { api, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFetch } from '@/lib/useFetch';
import { useLang } from '@/lib/i18n';
import { date, num } from '@/lib/format';
import { ROLE, SECTOR, label } from '@/lib/labels';
import type { AppUser, AuditLog, Company, Holiday, LeaveType } from '@/lib/types';
import { activityText } from './charts';
import { useEmployeeOptions } from './hooks';
import { Async, ConfirmModal, Toggle } from './primitives';
import { DAY_NAMES, useAction } from './utils';

// ---------------- Company ----------------
export function CompanySection() {
  const { t, lang } = useLang();
  const { refresh } = useAuth();
  const { data, loading, error, reload } = useFetch(() => api.get<Company>('/company'), []);
  const [f, setF] = useState<Company | null>(null);
  const { busy, run } = useAction();
  useEffect(() => { if (data) setF(data); }, [data]);
  const s = (k: keyof Company) => (f?.[k] as string | null | undefined) ?? '';
  const set = (k: keyof Company) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => (x ? { ...x, [k]: e.target.value } : x));
  const save = async () => {
    if (!f) return;
    const body = {
      nameAr: f.nameAr, nameEn: f.nameEn || null, crNumber: f.crNumber || null, establishmentId: f.establishmentId || null, gosiNumber: f.gosiNumber || null,
      vatNumber: f.vatNumber || null, sector: f.sector || null, city: f.city || null, iban: f.iban ? f.iban.replace(/\s/g, '').toUpperCase() : null,
      bankCode: f.bankCode || null, weekendDays: f.weekendDays, payrollDay: Number(f.payrollDay) || 27,
    };
    if (await run('save', () => api.patch('/company', body), t('تم حفظ بيانات المنشأة', 'Company saved'))) { reload(); void refresh(); }
  };
  return (
    <Async loading={loading} error={error} onRetry={reload} hasData={!!f}>
      {f && (
        <div className="space-y-6">
          <Card>
            <CardHeader title={t('بيانات المنشأة', 'Company information')} />
            <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label={t('الاسم (عربي)', 'Name (Arabic)')} required><Input value={s('nameAr')} onChange={set('nameAr')} /></Field>
              <Field label={t('الاسم (إنجليزي)', 'Name (English)')}><Input dir="ltr" value={s('nameEn')} onChange={set('nameEn')} /></Field>
              <Field label={t('القطاع', 'Sector')}><Select value={s('sector')} onChange={set('sector')} placeholder="—" options={Object.entries(SECTOR).map(([v, l]) => ({ value: v, label: lang === 'ar' ? l[0] : l[1] }))} /></Field>
              <Field label={t('المدينة', 'City')}><Input value={s('city')} onChange={set('city')} /></Field>
              <Field label={t('السجل التجاري', 'CR number')}><Input dir="ltr" value={s('crNumber')} onChange={set('crNumber')} /></Field>
              <Field label={t('الرقم الضريبي', 'VAT number')}><Input dir="ltr" value={s('vatNumber')} onChange={set('vatNumber')} /></Field>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={t('الرواتب وحماية الأجور', 'Payroll & WPS')} subtitle={t('تُستخدم في ملف مُدد وحساب التأمينات', 'Used in the Mudad file and GOSI')} />
            <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label={t('رقم المنشأة (وزارة الموارد / مُدد)', 'Establishment ID (MOL / Mudad)')}><Input dir="ltr" value={s('establishmentId')} onChange={set('establishmentId')} /></Field>
              <Field label={t('رقم التأمينات (GOSI)', 'GOSI number')}><Input dir="ltr" value={s('gosiNumber')} onChange={set('gosiNumber')} /></Field>
              <Field label={t('يوم صرف الرواتب', 'Payroll day')}><Input type="number" min={1} max={28} dir="ltr" value={String(f.payrollDay ?? '')} onChange={(e) => setF({ ...f, payrollDay: Number(e.target.value) })} /></Field>
              <Field label={t('آيبان المنشأة', 'Company IBAN')} className="lg:col-span-2"><Input dir="ltr" value={s('iban')} onChange={set('iban')} placeholder="SA…" /></Field>
              <Field label={t('رمز البنك', 'Bank code')}><Input dir="ltr" value={s('bankCode')} onChange={set('bankCode')} /></Field>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={t('عطلة نهاية الأسبوع', 'Weekend days')} subtitle={t('تُستثنى من احتساب أيام الإجازات والغياب', 'Excluded from leave and absence counts')} />
            <CardBody className="flex flex-wrap gap-2">
              {DAY_NAMES.map((d, i) => {
                const on = f.weekendDays?.includes(i);
                return (
                  <button key={i} type="button" onClick={() => setF({ ...f, weekendDays: on ? f.weekendDays.filter((x) => x !== i) : [...(f.weekendDays ?? []), i].sort() })}
                    className={`rounded-xl border px-4 py-2 text-sm ${on ? 'border-accent bg-accent-100 font-semibold text-accent-600' : 'border-line bg-white text-ink-muted hover:border-primary-500'}`}>
                    {lang === 'ar' ? d[0] : d[1]}
                  </button>
                );
              })}
            </CardBody>
          </Card>
          <div className="flex justify-end"><Button onClick={save} loading={busy === 'save'}><Save className="h-4 w-4" />{t('حفظ التغييرات', 'Save changes')}</Button></div>
        </div>
      )}
    </Async>
  );
}

// ---------------- Users ----------------
const ROLES = ['OWNER', 'HR_ADMIN', 'PAYROLL', 'BRANCH_MANAGER', 'EMPLOYEE'] as const;
export function UsersSection() {
  const { t, lang } = useLang();
  const { user: me } = useAuth();
  const { data, loading, error, reload } = useFetch(() => api.get<AppUser[] | Paginated<AppUser>>('/users'), []);
  const users = Array.isArray(data) ? data : data?.data ?? [];
  const [edit, setEdit] = useState<AppUser | 'new' | null>(null);
  const [del, setDel] = useState<AppUser | null>(null);
  const { busy, run } = useAction();
  const toggleActive = async (u: AppUser) => { if (await run(`act-${u.id}`, () => api.patch(`/users/${u.id}`, { isActive: !u.isActive }), u.isActive ? t('تم تعطيل المستخدم', 'User disabled') : t('تم تفعيل المستخدم', 'User enabled'))) reload(); };
  const remove = async () => { if (del && await run('del', () => api.del(`/users/${del.id}`), t('تم حذف المستخدم', 'User deleted'))) { setDel(null); reload(); } };
  const roleOpts = ROLES.filter((r) => r !== 'OWNER' || me?.role === 'OWNER').map((r) => ({ value: r, label: label(ROLE, r, lang) }));
  const columns: Column<AppUser>[] = [
    { key: 'name', header: t('المستخدم', 'User'), render: (u) => <div><p className="font-medium text-ink">{u.name}{u.id === me?.id && <span className="ms-1 text-xs text-ink-soft">({t('أنت', 'you')})</span>}</p><p className="text-xs text-ink-soft" dir="ltr">{u.email}</p></div> },
    { key: 'role', header: t('الدور', 'Role'), render: (u) => <Badge tone={u.role === 'OWNER' ? 'accent' : u.role === 'EMPLOYEE' ? 'neutral' : 'primary'}>{label(ROLE, u.role, lang)}</Badge> },
    { key: 'active', header: t('مفعّل', 'Active'), render: (u) => u.id === me?.id || u.role === 'OWNER' ? <Badge tone="success">{t('نعم', 'Yes')}</Badge> : <Toggle checked={u.isActive} onChange={() => toggleActive(u)} /> },
    { key: 'last', header: t('آخر دخول', 'Last login'), render: (u) => <span className="text-ink-muted">{date(u.lastLoginAt, lang)}</span> },
    { key: 'act', header: '', className: 'text-end', render: (u) => u.id === me?.id || u.role === 'OWNER' ? null : (
      <div className="flex justify-end gap-1">
        <button onClick={() => setEdit(u)} className="rounded-lg p-1.5 text-ink-soft hover:bg-sand hover:text-primary" aria-label="edit"><Pencil className="h-4 w-4" /></button>
        <button onClick={() => setDel(u)} className="rounded-lg p-1.5 text-ink-soft hover:bg-danger-50 hover:text-danger" aria-label="delete"><Trash2 className="h-4 w-4" /></button>
      </div>
    ) },
  ];
  return (
    <Card>
      <CardHeader title={t('المستخدمون والأدوار', 'Users & roles')} subtitle={t('من يمكنه الدخول إلى لوحة التحكم وبأي صلاحيات', 'Who can access the dashboard and with which permissions')}
        action={<Button size="sm" onClick={() => setEdit('new')}><UserPlus className="h-4 w-4" />{t('مستخدم جديد', 'New user')}</Button>} />
      <Async loading={loading} error={error} onRetry={reload} hasData={!!data}>
        <Table columns={columns} rows={users} rowKey={(u) => u.id} empty={<EmptyState />} />
      </Async>
      <div className="border-t border-line p-4">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-sm font-medium text-primary-500">{t('مصفوفة الصلاحيات', 'Permission matrix')}<ChevronDown className="h-4 w-4 transition group-open:rotate-180" /></summary>
          <ul className="mt-3 space-y-1.5 text-sm text-ink-muted">
            <li><strong className="text-ink">{label(ROLE, 'OWNER', lang)}:</strong> {t('كل شيء', 'Everything')}</li>
            <li><strong className="text-ink">{label(ROLE, 'HR_ADMIN', lang)}:</strong> {t('كل شيء عدا حذف المنشأة والفوترة', 'Everything except company deletion & billing')}</li>
            <li><strong className="text-ink">{label(ROLE, 'PAYROLL', lang)}:</strong> {t('الرواتب والسلف والتقارير المالية، وقراءة الموظفين', 'Payroll, loans, financial reports; read employees')}</li>
            <li><strong className="text-ink">{label(ROLE, 'BRANCH_MANAGER', lang)}:</strong> {t('موظفو فرعه وحضورهم، واعتماد طلباتهم وإجازاتهم', 'Own branch staff, attendance and approvals')}</li>
            <li><strong className="text-ink">{label(ROLE, 'EMPLOYEE', lang)}:</strong> {t('الخدمة الذاتية فقط', 'Self-service only')}</li>
          </ul>
        </details>
      </div>
      {edit && <UserModal user={edit === 'new' ? null : edit} roleOpts={roleOpts} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      <ConfirmModal open={!!del} onClose={() => setDel(null)} onConfirm={remove} danger loading={busy === 'del'} confirmLabel={t('حذف', 'Delete')}
        title={t('حذف المستخدم', 'Delete user')} message={del ? `${del.name} — ${del.email}` : ''} />
    </Card>
  );
}

function UserModal({ user, roleOpts, onClose, onSaved }: { user: AppUser | null; roleOpts: { value: string; label: string }[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useLang();
  const { busy, run } = useAction();
  const { options: empOpts } = useEmployeeOptions();
  const [f, setF] = useState({ name: user?.name ?? '', email: user?.email ?? '', role: user?.role ?? 'HR_ADMIN', password: '', employeeId: user?.employeeId ?? '' });
  const valid = f.name.trim() && (user || (f.email.trim() && f.password.length >= 8)) && (f.role !== 'BRANCH_MANAGER' && f.role !== 'EMPLOYEE' || f.employeeId || user);
  const save = async () => {
    if (!valid) return;
    const call = user
      ? () => api.patch(`/users/${user.id}`, { name: f.name.trim(), role: f.role })
      : () => api.post('/users', { name: f.name.trim(), email: f.email.trim(), role: f.role, password: f.password, employeeId: f.employeeId || undefined });
    if (await run('save', call, t('تم حفظ المستخدم', 'User saved'))) onSaved();
  };
  return (
    <Modal open onClose={onClose} title={user ? t('تعديل مستخدم', 'Edit user') : t('مستخدم جديد', 'New user')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('إلغاء', 'Cancel')}</Button><Button onClick={save} loading={busy === 'save'} disabled={!valid}>{t('حفظ', 'Save')}</Button></>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('الاسم', 'Name')} required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label={t('الدور', 'Role')} required><Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as AppUser['role'] })} options={roleOpts} /></Field>
        {!user && <>
          <Field label={t('البريد الإلكتروني', 'Email')} required><Input type="email" dir="ltr" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label={t('كلمة المرور', 'Password')} required hint={t('8 أحرف على الأقل', 'Min 8 characters')}><Input dir="ltr" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
          <Field label={t('ربط بموظف', 'Link to employee')} className="sm:col-span-2" hint={t('مطلوب لمدير الفرع والموظف', 'Required for branch managers and employees')}>
            <Select value={f.employeeId} onChange={(e) => setF({ ...f, employeeId: e.target.value })} options={empOpts} placeholder="—" />
          </Field>
        </>}
      </div>
    </Modal>
  );
}

// ---------------- Leave types ----------------
export function LeaveTypesSection() {
  const { t, lang } = useLang();
  const { data, loading, error, reload } = useFetch(() => api.get<LeaveType[]>('/leave-types'), []);
  const [edit, setEdit] = useState<LeaveType | 'new' | null>(null);
  const [del, setDel] = useState<LeaveType | null>(null);
  const { busy, run } = useAction();
  const remove = async () => { if (del && await run('del', () => api.del(`/leave-types/${del.id}`), t('تم الحذف', 'Deleted'))) { setDel(null); reload(); } };
  const columns: Column<LeaveType>[] = [
    { key: 'name', header: t('النوع', 'Type'), render: (l) => <div><p className="font-medium text-ink">{lang === 'ar' ? l.nameAr : l.nameEn || l.nameAr}</p><p className="text-xs text-ink-soft">{lang === 'ar' ? l.nameEn : l.nameAr}</p></div> },
    { key: 'code', header: t('الرمز', 'Code'), render: (l) => <Badge tone="neutral">{l.code}</Badge> },
    { key: 'paid', header: t('مدفوعة', 'Paid'), render: (l) => l.paid ? <Badge tone="success">{t('مدفوعة', 'Paid')}</Badge> : <Badge tone="warning">{t('غير مدفوعة', 'Unpaid')}</Badge> },
    { key: 'max', header: t('الحد السنوي', 'Max/year'), render: (l) => <span className="num">{l.maxDaysPerYear === null ? t('غير محدد', 'Unlimited') : `${num(l.maxDaysPerYear)} ${t('يوم', 'days')}`}</span> },
    { key: 'act', header: '', className: 'text-end', render: (l) => (
      <div className="flex justify-end gap-1">
        <button onClick={() => setEdit(l)} className="rounded-lg p-1.5 text-ink-soft hover:bg-sand hover:text-primary" aria-label="edit"><Pencil className="h-4 w-4" /></button>
        <button onClick={() => setDel(l)} className="rounded-lg p-1.5 text-ink-soft hover:bg-danger-50 hover:text-danger" aria-label="delete"><Trash2 className="h-4 w-4" /></button>
      </div>
    ) },
  ];
  return (
    <Card>
      <CardHeader title={t('أنواع الإجازات', 'Leave types')} subtitle={t('مُعدة مسبقاً وفق نظام العمل السعودي', 'Pre-configured per Saudi Labor Law')}
        action={<Button size="sm" onClick={() => setEdit('new')}><Plus className="h-4 w-4" />{t('نوع جديد', 'New type')}</Button>} />
      <Async loading={loading} error={error} onRetry={reload} hasData={!!data}>
        <Table columns={columns} rows={data ?? []} rowKey={(l) => l.id} empty={<EmptyState />} />
      </Async>
      {edit && <LeaveTypeModal lt={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      <ConfirmModal open={!!del} onClose={() => setDel(null)} onConfirm={remove} danger loading={busy === 'del'} confirmLabel={t('حذف', 'Delete')} title={t('حذف نوع الإجازة', 'Delete leave type')} message={del?.nameAr} />
    </Card>
  );
}

function LeaveTypeModal({ lt, onClose, onSaved }: { lt: LeaveType | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useLang();
  const { busy, run } = useAction();
  const [f, setF] = useState({ code: lt?.code ?? '', nameAr: lt?.nameAr ?? '', nameEn: lt?.nameEn ?? '', paid: lt?.paid ?? true, maxDaysPerYear: lt?.maxDaysPerYear === null || lt?.maxDaysPerYear === undefined ? '' : String(lt.maxDaysPerYear) });
  const valid = f.code.trim() && f.nameAr.trim();
  const save = async () => {
    const body = { code: f.code.trim().toUpperCase(), nameAr: f.nameAr.trim(), nameEn: f.nameEn.trim(), paid: f.paid, maxDaysPerYear: f.maxDaysPerYear === '' ? null : Number(f.maxDaysPerYear) };
    if (valid && await run('save', () => (lt ? api.patch(`/leave-types/${lt.id}`, body) : api.post('/leave-types', body)), t('تم الحفظ', 'Saved'))) onSaved();
  };
  return (
    <Modal open onClose={onClose} size="sm" title={lt ? t('تعديل نوع إجازة', 'Edit leave type') : t('نوع إجازة جديد', 'New leave type')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('إلغاء', 'Cancel')}</Button><Button onClick={save} loading={busy === 'save'} disabled={!valid}>{t('حفظ', 'Save')}</Button></>}>
      <div className="space-y-4">
        <Field label={t('الرمز', 'Code')} required><Input dir="ltr" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="ANNUAL" disabled={!!lt} /></Field>
        <Field label={t('الاسم (عربي)', 'Name (Arabic)')} required><Input value={f.nameAr} onChange={(e) => setF({ ...f, nameAr: e.target.value })} /></Field>
        <Field label={t('الاسم (إنجليزي)', 'Name (English)')}><Input dir="ltr" value={f.nameEn} onChange={(e) => setF({ ...f, nameEn: e.target.value })} /></Field>
        <Field label={t('الحد الأقصى سنوياً (يوم)', 'Max days per year')} hint={t('اتركه فارغاً لغير محدد', 'Leave empty for unlimited')}><Input type="number" min={0} dir="ltr" value={f.maxDaysPerYear} onChange={(e) => setF({ ...f, maxDaysPerYear: e.target.value })} /></Field>
        <Toggle checked={f.paid} onChange={(v) => setF({ ...f, paid: v })} label={t('إجازة مدفوعة الأجر', 'Paid leave')} />
      </div>
    </Modal>
  );
}

// ---------------- Holidays ----------------
export function HolidaysSection() {
  const { t, lang } = useLang();
  const [year, setYear] = useState(new Date().getFullYear());
  const { data, loading, error, reload } = useFetch(() => api.get<Holiday[]>('/holidays', { year }), [year]);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ date: '', nameAr: '', nameEn: '' });
  const [del, setDel] = useState<Holiday | null>(null);
  const { busy, run } = useAction();
  const add = async () => {
    if (!f.date || !f.nameAr.trim()) return;
    if (await run('add', () => api.post('/holidays', { date: f.date, nameAr: f.nameAr.trim(), nameEn: f.nameEn.trim() || undefined }), t('تمت إضافة العطلة', 'Holiday added'))) { setAdding(false); setF({ date: '', nameAr: '', nameEn: '' }); reload(); }
  };
  const remove = async () => { if (del && await run('del', () => api.del(`/holidays/${del.id}`), t('تم الحذف', 'Deleted'))) { setDel(null); reload(); } };
  const list = [...(data ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <Card>
      <CardHeader title={t('العطل الرسمية', 'Public holidays')} subtitle={t('تُستثنى من الإجازات والغياب', 'Excluded from leave and absence')}
        action={<div className="flex gap-2">
          <Select value={String(year)} onChange={(e) => setYear(Number(e.target.value))} className="!h-8 w-24 text-xs" options={[year - 1, year, year + 1].map((y) => ({ value: String(y), label: String(y) })).filter((o, i, a) => a.findIndex((x) => x.value === o.value) === i)} />
          <Button size="sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4" />{t('عطلة', 'Holiday')}</Button>
        </div>} />
      <Async loading={loading} error={error} onRetry={reload} hasData={!!data}>
        {!list.length ? <EmptyState title={t('لا توجد عطل لهذه السنة', 'No holidays this year')} /> : (
          <ul className="divide-y divide-line">
            {list.map((h) => {
              const d = new Date(`${h.date.slice(0, 10)}T00:00:00`);
              return (
                <li key={h.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="w-14 shrink-0 rounded-xl bg-accent-50 py-1.5 text-center">
                    <p className="num text-lg font-bold leading-none text-accent-600">{d.getDate()}</p>
                    <p className="text-[10px] text-ink-muted">{d.toLocaleDateString(lang === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB', { month: 'short' })}</p>
                  </div>
                  <div className="flex-1"><p className="font-medium text-ink">{lang === 'ar' ? h.nameAr : h.nameEn || h.nameAr}</p><p className="text-xs text-ink-soft">{DAY_NAMES[d.getDay()][lang === 'ar' ? 0 : 1]}</p></div>
                  <button onClick={() => setDel(h)} className="rounded-lg p-1.5 text-ink-soft hover:bg-danger-50 hover:text-danger" aria-label="delete"><Trash2 className="h-4 w-4" /></button>
                </li>
              );
            })}
          </ul>
        )}
      </Async>
      <Modal open={adding} onClose={() => setAdding(false)} size="sm" title={t('عطلة جديدة', 'New holiday')}
        footer={<><Button variant="secondary" onClick={() => setAdding(false)}>{t('إلغاء', 'Cancel')}</Button><Button onClick={add} loading={busy === 'add'} disabled={!f.date || !f.nameAr.trim()}>{t('حفظ', 'Save')}</Button></>}>
        <div className="space-y-4">
          <Field label={t('التاريخ', 'Date')} required><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label={t('الاسم (عربي)', 'Name (Arabic)')} required><Input value={f.nameAr} onChange={(e) => setF({ ...f, nameAr: e.target.value })} placeholder={t('اليوم الوطني', 'National Day')} /></Field>
          <Field label={t('الاسم (إنجليزي)', 'Name (English)')}><Input dir="ltr" value={f.nameEn} onChange={(e) => setF({ ...f, nameEn: e.target.value })} /></Field>
        </div>
      </Modal>
      <ConfirmModal open={!!del} onClose={() => setDel(null)} onConfirm={remove} danger loading={busy === 'del'} confirmLabel={t('حذف', 'Delete')} title={t('حذف العطلة', 'Delete holiday')} message={del?.nameAr} />
    </Card>
  );
}

// ---------------- Audit log ----------------
export function AuditSection() {
  const { t, lang } = useLang();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<AuditLog | null>(null);
  const { data, loading, error, reload } = useFetch(() => api.get<Paginated<AuditLog>>('/audit-logs', { page, pageSize: 25 }), [page]);
  const columns: Column<AuditLog>[] = [
    { key: 'when', header: t('الوقت', 'When'), render: (a) => <span className="num text-ink-muted">{new Date(a.createdAt).toLocaleString(lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { timeZone: 'Asia/Riyadh', dateStyle: 'medium', timeStyle: 'short' })}</span> },
    { key: 'user', header: t('المستخدم', 'User'), render: (a) => <span className="font-medium">{a.userName || t('النظام', 'System')}</span> },
    { key: 'action', header: t('الإجراء', 'Action'), render: (a) => activityText(a.action, a.entity, lang) },
    { key: 'entity', header: t('الكيان', 'Entity'), render: (a) => <span className="num text-xs text-ink-soft">{a.entity}{a.entityId ? ` · ${a.entityId.slice(0, 8)}` : ''}</span> },
  ];
  return (
    <Card>
      <CardHeader title={t('سجل التدقيق', 'Audit log')} subtitle={t('جميع العمليات الحساسة في المنشأة', 'All sensitive operations in the company')} />
      <Async loading={loading} error={error} onRetry={reload} hasData={!!data}>
        <Table columns={columns} rows={data?.data ?? []} rowKey={(a) => a.id} onRowClick={(a) => a.data ? setOpen(a) : undefined} empty={<EmptyState />} />
        {data && <Pagination page={page} pageSize={25} total={data.total} onChange={setPage} />}
      </Async>
      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? activityText(open.action, open.entity, lang) : ''}>
        <pre dir="ltr" className="max-h-96 overflow-auto rounded-xl bg-sand p-3 text-xs text-ink">{open ? JSON.stringify(open.data, null, 2) : ''}</pre>
      </Modal>
    </Card>
  );
}
