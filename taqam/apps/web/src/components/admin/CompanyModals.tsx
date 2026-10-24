'use client';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { AlertTriangle, KeyRound } from 'lucide-react';
import { Button, Field, Input, Modal, Select, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { errMsg } from '@/components/app/utils';
import { api } from '@/lib/api';
import { useLang } from '@/lib/i18n';
import { money } from '@/lib/format';
import {
  BILLING_CYCLE, DEFAULT_PRICES, PLAN, PLANS, companyName, lbl,
  type ActivateBody, type AdminCompany, type AdminCompanyUser, type BillingCycle, type Plan, type PlatformSettings,
} from '@/lib/adminTypes';
import { CopyButton } from './primitives';
import { dayOf, delWithBody, intOrNull, numOrNull } from './adminApi';
import { refreshAdminCounts } from './AdminShell';

type Co = Pick<AdminCompany, 'id' | 'nameAr' | 'nameEn' | 'plan' | 'billingCycle' | 'maxEmployees' | 'pricePerEmployee' | 'trialEndsAt' | 'subscriptionEndsAt' | 'status' | 'activeEmployees'>;

let settingsCache: PlatformSettings | null = null;
function useSettings(open: boolean) {
  const [s, setS] = useState<PlatformSettings | null>(settingsCache);
  useEffect(() => {
    if (!open || settingsCache) return;
    api.get<PlatformSettings>('/admin/settings').then((r) => { settingsCache = r; setS(r); }).catch(() => {});
  }, [open]);
  return s;
}
export function invalidateSettingsCache() { settingsCache = null; }

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; hint?: string }[] }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={clsx('rounded-xl border px-3 py-2 text-start text-sm transition-colors',
            value === o.value ? 'border-primary bg-primary-50 text-primary ring-1 ring-primary' : 'border-line bg-white text-ink-muted hover:border-primary-500')}>
          <span className="block font-medium">{o.label}</span>
          {o.hint && <span className="block text-[11px] text-ink-soft">{o.hint}</span>}
        </button>
      ))}
    </div>
  );
}

function usePlanOptions() {
  const { lang } = useLang();
  return PLANS.map((p) => ({ value: p, label: lbl(PLAN, p, lang) }));
}
function useCycleOptions() {
  const { lang } = useLang();
  return (['MONTHLY', 'ANNUAL'] as const).map((c) => ({ value: c, label: lbl(BILLING_CYCLE, c, lang) }));
}

// ---------------- Activate ----------------
export function ActivateModal({ company, open, onClose, onDone }: { company: Co | null; open: boolean; onClose: () => void; onDone: (c: AdminCompany) => void }) {
  const { t, lang } = useLang();
  const toast = useToast();
  const settings = useSettings(open);
  const planOpts = usePlanOptions(); const cycleOpts = useCycleOptions();
  const [f, setF] = useState({ plan: 'GROWTH' as Plan, billingCycle: 'MONTHLY' as BillingCycle, mode: 'TRIAL' as 'TRIAL' | 'PAID', trialDays: '14', maxEmployees: '', pricePerEmployee: '', subscriptionEndsAt: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open || !company) return;
    setF({
      plan: company.plan || 'GROWTH', billingCycle: company.billingCycle || 'MONTHLY', mode: 'TRIAL',
      trialDays: String(settings?.trialDays ?? 14), maxEmployees: company.maxEmployees != null ? String(company.maxEmployees) : '',
      pricePerEmployee: company.pricePerEmployee != null ? String(company.pricePerEmployee) : '', subscriptionEndsAt: dayOf(company.subscriptionEndsAt),
    });
  }, [open, company, settings?.trialDays]);
  if (!company) return null;
  const listPrice = (settings?.prices ?? DEFAULT_PRICES)[f.plan];
  const submit = async () => {
    const body: ActivateBody = { plan: f.plan, billingCycle: f.billingCycle, mode: f.mode, maxEmployees: intOrNull(f.maxEmployees), pricePerEmployee: numOrNull(f.pricePerEmployee) };
    if (f.mode === 'TRIAL') body.trialDays = Math.max(1, Number(f.trialDays) || 14);
    else body.subscriptionEndsAt = f.subscriptionEndsAt || null;
    if (f.plan === 'ENTERPRISE' && listPrice == null && body.pricePerEmployee == null && f.mode === 'PAID') {
      toast(t('باقة المؤسسات بلا سعر قائمة — حدّد سعراً للموظف', 'Enterprise has no list price — set a price per employee'), 'error'); return;
    }
    setBusy(true);
    try {
      const r = await api.post<AdminCompany>(`/admin/companies/${company.id}/activate`, body);
      toast(f.mode === 'TRIAL' ? t('تم تفعيل الفترة التجريبية', 'Trial activated') : t('تم تفعيل الاشتراك', 'Subscription activated'));
      refreshAdminCounts(); onDone(r); onClose();
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  return (
    <Modal open={open} onClose={onClose} title={t(`تفعيل ${companyName(company, lang)}`, `Activate ${companyName(company, lang)}`)}
      footer={<><Button variant="secondary" onClick={onClose}>{t('إلغاء', 'Cancel')}</Button><Button onClick={submit} loading={busy}>{t('تفعيل', 'Activate')}</Button></>}>
      <div className="space-y-4">
        <Segmented value={f.mode} onChange={(mode) => setF((s) => ({ ...s, mode }))} options={[
          { value: 'TRIAL', label: t('فترة تجريبية', 'Trial'), hint: t('مجانية لعدد أيام', 'Free for N days') },
          { value: 'PAID', label: t('اشتراك مدفوع', 'Paid'), hint: t('تفعيل نشط فوري', 'Active immediately') },
        ]} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('الباقة', 'Plan')} required><Select value={f.plan} onChange={set('plan')} options={planOpts} /></Field>
          <Field label={t('دورة الفوترة', 'Billing cycle')} required><Select value={f.billingCycle} onChange={set('billingCycle')} options={cycleOpts} /></Field>
          <Field label={t('حد الموظفين', 'Seat limit')} hint={t('اتركه فارغاً لعدد غير محدود', 'Empty = unlimited')}>
            <Input type="number" min={1} dir="ltr" value={f.maxEmployees} onChange={set('maxEmployees')} placeholder="∞" />
          </Field>
          <Field label={t('السعر للموظف (ر.س/شهر)', 'Price / employee (SAR/mo)')} hint={listPrice != null ? t(`سعر القائمة ${money(listPrice, { decimals: 0 })}`, `List price ${money(listPrice, { decimals: 0 })}`) : t('بلا سعر قائمة — حسب الاتفاق', 'No list price — negotiated')}>
            <Input type="number" min={0} step="0.5" dir="ltr" value={f.pricePerEmployee} onChange={set('pricePerEmployee')} placeholder={listPrice != null ? String(listPrice) : '—'} />
          </Field>
          {f.mode === 'TRIAL'
            ? <Field label={t('مدة التجربة (أيام)', 'Trial days')} required><Input type="number" min={1} max={365} dir="ltr" value={f.trialDays} onChange={set('trialDays')} /></Field>
            : <Field label={t('ينتهي الاشتراك في', 'Subscription ends')} hint={t('اختياري — فارغ = مفتوح', 'Optional — empty = open-ended')}><Input type="date" dir="ltr" value={f.subscriptionEndsAt} onChange={set('subscriptionEndsAt')} /></Field>}
        </div>
      </div>
    </Modal>
  );
}

// ---------------- Suspend ----------------
export function SuspendModal({ company, open, onClose, onDone }: { company: Co | null; open: boolean; onClose: () => void; onDone: (c: AdminCompany) => void }) {
  const { t, lang } = useLang();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (open) { setReason(''); setTouched(false); } }, [open]);
  if (!company) return null;
  const quick = [t('تأخر السداد', 'Late payment'), t('طلب المنشأة', 'Requested by company'), t('مخالفة شروط الاستخدام', 'Terms violation')];
  const submit = async () => {
    setTouched(true);
    if (!reason.trim()) return;
    setBusy(true);
    try {
      const r = await api.post<AdminCompany>(`/admin/companies/${company.id}/suspend`, { reason: reason.trim() });
      toast(t('تم إيقاف المنشأة', 'Company suspended')); refreshAdminCounts(); onDone(r); onClose();
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} size="sm" title={t('إيقاف المنشأة', 'Suspend company')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('إلغاء', 'Cancel')}</Button><Button variant="danger" onClick={submit} loading={busy}>{t('إيقاف', 'Suspend')}</Button></>}>
      <p className="mb-4 text-sm text-ink-muted">{t(`سيُمنع جميع مستخدمي «${companyName(company, lang)}» من الدخول حتى إعادة التفعيل.`, `All users of “${companyName(company, lang)}” will be blocked until reactivated.`)}</p>
      <Field label={t('سبب الإيقاف', 'Reason')} required error={touched && !reason.trim() ? t('السبب مطلوب', 'Reason is required') : undefined}>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      </Field>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {quick.map((q) => <button key={q} type="button" onClick={() => setReason(q)} className="rounded-full border border-line px-2.5 py-0.5 text-xs text-ink-muted hover:border-primary-500 hover:text-primary">{q}</button>)}
      </div>
    </Modal>
  );
}

// ---------------- Edit subscription ----------------
export function EditSubscriptionModal({ company, open, onClose, onDone }: { company: Co | null; open: boolean; onClose: () => void; onDone: (c: AdminCompany) => void }) {
  const { t } = useLang();
  const toast = useToast();
  const settings = useSettings(open);
  const planOpts = usePlanOptions(); const cycleOpts = useCycleOptions();
  const [f, setF] = useState({ plan: 'GROWTH' as Plan, billingCycle: 'MONTHLY' as BillingCycle, maxEmployees: '', pricePerEmployee: '', trialEndsAt: '', subscriptionEndsAt: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open || !company) return;
    setF({
      plan: company.plan, billingCycle: company.billingCycle,
      maxEmployees: company.maxEmployees != null ? String(company.maxEmployees) : '', pricePerEmployee: company.pricePerEmployee != null ? String(company.pricePerEmployee) : '',
      trialEndsAt: dayOf(company.trialEndsAt), subscriptionEndsAt: dayOf(company.subscriptionEndsAt),
    });
  }, [open, company]);
  if (!company) return null;
  const listPrice = (settings?.prices ?? DEFAULT_PRICES)[f.plan];
  const seats = intOrNull(f.maxEmployees);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const submit = async () => {
    const body: Record<string, unknown> = {};
    if (f.plan !== company.plan) body.plan = f.plan;
    if (f.billingCycle !== company.billingCycle) body.billingCycle = f.billingCycle;
    if (seats !== company.maxEmployees) body.maxEmployees = seats;
    const price = numOrNull(f.pricePerEmployee);
    if (price !== company.pricePerEmployee) body.pricePerEmployee = price;
    if (f.trialEndsAt !== dayOf(company.trialEndsAt)) body.trialEndsAt = f.trialEndsAt || null;
    if (f.subscriptionEndsAt !== dayOf(company.subscriptionEndsAt)) body.subscriptionEndsAt = f.subscriptionEndsAt || null;
    if (!Object.keys(body).length) { onClose(); return; }
    setBusy(true);
    try {
      const r = await api.patch<AdminCompany>(`/admin/companies/${company.id}`, body);
      toast(t('تم تحديث الاشتراك', 'Subscription updated')); onDone(r); onClose();
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={t('تعديل الاشتراك', 'Edit subscription')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('إلغاء', 'Cancel')}</Button><Button onClick={submit} loading={busy}>{t('حفظ', 'Save')}</Button></>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('الباقة', 'Plan')}><Select value={f.plan} onChange={set('plan')} options={planOpts} /></Field>
        <Field label={t('دورة الفوترة', 'Billing cycle')}><Select value={f.billingCycle} onChange={set('billingCycle')} options={cycleOpts} /></Field>
        <Field label={t('حد الموظفين', 'Seat limit')} hint={seats != null && seats < company.activeEmployees ? t(`أقل من الموظفين النشطين (${company.activeEmployees})`, `Below active employees (${company.activeEmployees})`) : t('فارغ = غير محدود', 'Empty = unlimited')}>
          <Input type="number" min={1} dir="ltr" value={f.maxEmployees} onChange={set('maxEmployees')} placeholder="∞" />
        </Field>
        <Field label={t('السعر للموظف (ر.س/شهر)', 'Price / employee (SAR/mo)')} hint={listPrice != null ? t(`فارغ = سعر القائمة ${listPrice}`, `Empty = list price ${listPrice}`) : t('بلا سعر قائمة', 'No list price')}>
          <Input type="number" min={0} step="0.5" dir="ltr" value={f.pricePerEmployee} onChange={set('pricePerEmployee')} placeholder={listPrice != null ? String(listPrice) : '—'} />
        </Field>
        <Field label={t('نهاية الفترة التجريبية', 'Trial ends')}><Input type="date" dir="ltr" value={f.trialEndsAt} onChange={set('trialEndsAt')} /></Field>
        <Field label={t('نهاية الاشتراك', 'Subscription ends')}><Input type="date" dir="ltr" value={f.subscriptionEndsAt} onChange={set('subscriptionEndsAt')} /></Field>
      </div>
    </Modal>
  );
}

// ---------------- Extend ----------------
export function ExtendModal({ company, open, onClose, onDone }: { company: Co | null; open: boolean; onClose: () => void; onDone: (c: AdminCompany) => void }) {
  const { t } = useLang();
  const toast = useToast();
  const [days, setDays] = useState('14');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setDays(company?.status === 'TRIAL' ? '14' : '30'); }, [open, company?.status]);
  if (!company) return null;
  const target = company.status === 'TRIAL' ? t('الفترة التجريبية', 'the trial') : t('الاشتراك', 'the subscription');
  const submit = async () => {
    const n = Math.round(Number(days));
    if (!n || n < 1) { toast(t('أدخل عدد أيام صحيحاً', 'Enter a valid number of days'), 'error'); return; }
    setBusy(true);
    try {
      const r = await api.post<AdminCompany>(`/admin/companies/${company.id}/extend`, { days: n });
      toast(t(`تم التمديد ${n} يوماً`, `Extended by ${n} days`)); refreshAdminCounts(); onDone(r); onClose();
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} size="sm" title={t('تمديد', 'Extend')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('إلغاء', 'Cancel')}</Button><Button onClick={submit} loading={busy}>{t('تمديد', 'Extend')}</Button></>}>
      <p className="mb-4 text-sm text-ink-muted">
        {company.status === 'EXPIRED'
          ? t('المنشأة منتهية — التمديد يعيدها إلى «نشط».', 'Company is expired — extending makes it Active again.')
          : t(`تمديد ${target} بعدد الأيام التالي:`, `Extend ${target} by:`)}
      </p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {[7, 14, 30, 90, 365].map((n) => (
          <button key={n} type="button" onClick={() => setDays(String(n))}
            className={clsx('num rounded-full border px-3 py-1 text-xs font-medium', days === String(n) ? 'border-primary bg-primary text-white' : 'border-line text-ink-muted hover:border-primary-500')}>
            {t(`${n} يوم`, `${n}d`)}
          </button>
        ))}
      </div>
      <Field label={t('عدد الأيام', 'Days')}><Input type="number" min={1} dir="ltr" value={days} onChange={(e) => setDays(e.target.value)} /></Field>
    </Modal>
  );
}

// ---------------- Reset password ----------------
export function ResetPasswordModal({ companyId, user, onClose }: { companyId: string; user: AdminCompanyUser | null; onClose: () => void }) {
  const { t } = useLang();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [temp, setTemp] = useState<string | null>(null);
  useEffect(() => { setTemp(null); }, [user?.id]);
  if (!user) return null;
  const close = () => { setTemp(null); onClose(); };
  const submit = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ temporaryPassword: string }>(`/admin/companies/${companyId}/users/${user.id}/reset-password`);
      setTemp(r.temporaryPassword);
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={close} size="sm" title={t('إعادة تعيين كلمة المرور', 'Reset password')}
      footer={temp
        ? <Button onClick={close}>{t('تم', 'Done')}</Button>
        : <><Button variant="secondary" onClick={close}>{t('إلغاء', 'Cancel')}</Button><Button onClick={submit} loading={busy}><KeyRound className="h-4 w-4" />{t('إنشاء كلمة مرور مؤقتة', 'Generate temporary password')}</Button></>}>
      {!temp ? (
        <p className="text-sm text-ink-muted">{t(`سيتم إنشاء كلمة مرور مؤقتة للمستخدم ${user.name} (${user.email}) وإلغاء كلمة المرور الحالية.`, `A temporary password will be generated for ${user.name} (${user.email}); the current password stops working.`)}</p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">{t('كلمة المرور المؤقتة:', 'Temporary password:')}</p>
          <div className="flex items-center gap-2">
            <code dir="ltr" className="flex-1 select-all rounded-xl border border-line bg-sand px-3 py-2 text-center font-mono text-lg font-semibold tracking-wider text-ink">{temp}</code>
            <CopyButton value={temp} />
          </div>
          <p className="flex items-start gap-2 rounded-xl bg-warning-50 px-3 py-2 text-xs text-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {t('تظهر مرة واحدة فقط — انسخها وأرسلها للمستخدم بطريقة آمنة.', 'Shown only once — copy it and share it securely with the user.')}
          </p>
        </div>
      )}
    </Modal>
  );
}

// ---------------- Delete ----------------
export function DeleteCompanyModal({ company, open, onClose, onDone }: { company: Co | null; open: boolean; onClose: () => void; onDone: () => void }) {
  const { t } = useLang();
  const toast = useToast();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setName(''); }, [open]);
  if (!company) return null;
  const match = name.trim() === company.nameAr.trim();
  const submit = async () => {
    if (!match) return;
    setBusy(true);
    try {
      await delWithBody(`/admin/companies/${company.id}`, { confirmName: name.trim() });
      toast(t('تم حذف المنشأة وجميع بياناتها', 'Company and all its data deleted')); refreshAdminCounts(); onClose(); onDone();
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} size="sm" title={t('حذف المنشأة نهائياً', 'Delete company permanently')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('إلغاء', 'Cancel')}</Button><Button variant="danger" onClick={submit} loading={busy} disabled={!match}>{t('حذف نهائي', 'Delete forever')}</Button></>}>
      <div className="mb-4 flex items-start gap-2 rounded-xl border border-danger/20 bg-danger-50 px-3 py-2.5 text-sm text-danger">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{t('سيتم حذف جميع بيانات المنشأة (الموظفون، الرواتب، الحضور، المستخدمون) ولا يمكن التراجع.', 'All tenant data (employees, payroll, attendance, users) will be erased. This cannot be undone.')}</span>
      </div>
      <Field label={t('اكتب اسم المنشأة للتأكيد', 'Type the company name to confirm')} hint={company.nameAr}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={company.nameAr} autoFocus />
      </Field>
    </Modal>
  );
}
