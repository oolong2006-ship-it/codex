'use client';
import { useEffect, useState } from 'react';
import { BellRing, Landmark, Pencil, Plus, Save } from 'lucide-react';
import { Badge, Button, Card, CardBody, CardHeader, Field, Input, Modal, PageHeader, Table, type Column } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { Async, Avatar, Toggle } from '@/components/app/primitives';
import { errMsg } from '@/components/app/utils';
import { invalidateSettingsCache } from '@/components/admin/CompanyModals';
import { timeAgo } from '@/components/admin/primitives';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLang } from '@/lib/i18n';
import { useFetch } from '@/lib/useFetch';
import { PLAN, PLANS, lbl, type BillingSettings, type Plan, type PlatformAdmin, type PlatformSettings, type ReminderSettings } from '@/lib/adminTypes';
import { DEFAULT_BILLING, DEFAULT_REMINDERS } from '@/lib/billing';

export default function AdminSettingsPage() {
  const { t } = useLang();
  return (
    <div>
      <PageHeader title={t('إعدادات المنصة', 'Platform settings')} subtitle={t('سياسة التسجيل والأسعار والفوترة والتذكيرات وفريق إدارة المنصة', 'Signup policy, pricing, billing, reminders and the platform team')} />
      <div className="space-y-6">
        <SettingsForm />
        <BillingForm />
        <RemindersForm />
        <AdminsCard />
      </div>
    </div>
  );
}

function SettingsForm() {
  const { t, lang } = useLang();
  const toast = useToast();
  const { data, loading, error, reload, setData } = useFetch(() => api.get<PlatformSettings>('/admin/settings'), []);
  const [f, setF] = useState({ requireApproval: true, trialDays: '14', prices: { ESSENTIALS: '19', GROWTH: '29', ENTERPRISE: '' } as Record<Plan, string>, discount: '15' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!data) return;
    setF({
      requireApproval: data.requireApproval, trialDays: String(data.trialDays),
      prices: { ESSENTIALS: data.prices.ESSENTIALS == null ? '' : String(data.prices.ESSENTIALS), GROWTH: data.prices.GROWTH == null ? '' : String(data.prices.GROWTH), ENTERPRISE: data.prices.ENTERPRISE == null ? '' : String(data.prices.ENTERPRISE) },
      discount: String(Math.round((data.annualDiscount ?? 0) * 1000) / 10),
    });
  }, [data]);
  const save = async () => {
    const trialDays = Math.round(Number(f.trialDays));
    const disc = Number(f.discount);
    if (!trialDays || trialDays < 1 || trialDays > 365) { toast(t('مدة التجربة بين 1 و365 يوماً', 'Trial days must be 1–365'), 'error'); return; }
    if (isNaN(disc) || disc < 0 || disc > 90) { toast(t('الخصم السنوي بين 0% و90%', 'Annual discount must be 0–90%'), 'error'); return; }
    const p = (v: string) => (v.trim() === '' ? null : Math.max(0, Number(v)));
    setBusy(true);
    try {
      const r = await api.patch<PlatformSettings>('/admin/settings', {
        requireApproval: f.requireApproval, trialDays,
        prices: { ESSENTIALS: p(f.prices.ESSENTIALS), GROWTH: p(f.prices.GROWTH), ENTERPRISE: p(f.prices.ENTERPRISE) },
        annualDiscount: Math.round(disc * 10) / 1000,
      });
      setData(r); invalidateSettingsCache(); toast(t('تم حفظ الإعدادات', 'Settings saved'));
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };
  return (
    <Card>
      <CardHeader title={t('التسجيل والأسعار', 'Signup & pricing')} action={<Button size="sm" onClick={save} loading={busy} disabled={!data}><Save className="h-4 w-4" />{t('حفظ', 'Save')}</Button>} />
      <CardBody>
        <Async loading={loading} error={error} onRetry={reload} hasData={!!data}>
          <div className="space-y-6">
            <div className="flex flex-col gap-3 rounded-xl border border-line bg-sand/50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-ink">{t('تتطلب المنشآت الجديدة موافقة', 'New companies require approval')}</p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {f.requireApproval
                    ? t('تُسجَّل المنشأة بحالة «بانتظار الموافقة» ولا تدخل حتى تفعّلها.', 'Signups start as Pending and cannot sign in until you activate them.')
                    : t(`تبدأ المنشأة فوراً بفترة تجريبية ${f.trialDays} يوماً.`, `Signups start a ${f.trialDays}-day trial immediately.`)}
                </p>
              </div>
              <Toggle checked={f.requireApproval} onChange={(v) => setF((s) => ({ ...s, requireApproval: v }))} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <Field label={t('مدة التجربة (أيام)', 'Trial days')}>
                <Input type="number" min={1} max={365} dir="ltr" value={f.trialDays} onChange={(e) => setF((s) => ({ ...s, trialDays: e.target.value }))} />
              </Field>
              {PLANS.map((pl) => (
                <Field key={pl} label={t(`${lbl(PLAN, pl, 'ar')} (ر.س للموظف)`, `${lbl(PLAN, pl, 'en')} (SAR/emp.)`)} hint={pl === 'ENTERPRISE' ? t('فارغ = حسب الاتفاق', 'Empty = negotiated') : undefined}>
                  <Input type="number" min={0} step="0.5" dir="ltr" value={f.prices[pl]} placeholder="—"
                    onChange={(e) => setF((s) => ({ ...s, prices: { ...s.prices, [pl]: e.target.value } }))} />
                </Field>
              ))}
              <Field label={t('الخصم السنوي (%)', 'Annual discount (%)')}>
                <Input type="number" min={0} max={90} step="0.5" dir="ltr" value={f.discount} onChange={(e) => setF((s) => ({ ...s, discount: e.target.value }))} />
              </Field>
            </div>
            <p className="text-xs text-ink-soft">{lang === 'ar'
              ? 'تغيير الأسعار يؤثر على المنشآت التي لا تملك سعراً خاصاً، ويُعاد احتساب الإيراد الشهري فوراً.'
              : 'Price changes apply to companies without a price override; MRR is recalculated immediately.'}</p>
          </div>
        </Async>
      </CardBody>
    </Card>
  );
}

function AdminsCard() {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const toast = useToast();
  const { data, setData, loading, error, reload } = useFetch(() => api.get<PlatformAdmin[]>('/admin/admins'), []);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<PlatformAdmin | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  const toggle = async (a: PlatformAdmin, isActive: boolean) => {
    setToggling(a.id);
    try {
      const r = await api.patch<PlatformAdmin>(`/admin/admins/${a.id}`, { isActive });
      setData((d) => (d ? d.map((x) => (x.id === a.id ? { ...x, ...r } : x)) : d));
      toast(isActive ? t('تم تفعيل المدير', 'Admin enabled') : t('تم تعطيل المدير', 'Admin disabled'));
    } catch (e) { toast(errMsg(e), 'error'); } finally { setToggling(null); }
  };

  const cols: Column<PlatformAdmin>[] = [
    { key: 'name', header: t('المدير', 'Admin'), render: (a) => (
      <div className="flex items-center gap-2.5">
        <Avatar name={a.name} color="#0F2747" size="sm" />
        <div className="min-w-0">
          <p className="font-medium text-ink">{a.name}{a.id === user?.id && <Badge tone="primary" className="ms-2">{t('أنت', 'You')}</Badge>}</p>
          <p className="text-xs text-ink-soft" dir="ltr">{a.email}</p>
        </div>
      </div>
    ) },
    { key: 'status', header: t('الحالة', 'Status'), render: (a) => <Badge tone={a.isActive ? 'success' : 'neutral'}>{a.isActive ? t('مفعّل', 'Active') : t('معطّل', 'Disabled')}</Badge> },
    { key: 'login', header: t('آخر دخول', 'Last login'), render: (a) => <span className="text-xs text-ink-muted">{a.lastLoginAt ? timeAgo(a.lastLoginAt, lang) : t('لم يسجل دخولاً', 'Never')}</span> },
    { key: 'act', header: '', render: (a) => (
      <div className="flex items-center justify-end gap-3">
        <span className={toggling === a.id ? 'opacity-50' : ''} title={a.id === user?.id ? t('لا يمكنك تعطيل حسابك', 'You cannot disable yourself') : undefined}>
          {a.id === user?.id ? <span className="text-xs text-ink-soft">—</span> : <Toggle checked={a.isActive} onChange={(v) => toggle(a, v)} />}
        </span>
        <Button size="sm" variant="ghost" onClick={() => setEditing(a)} aria-label={t('تعديل', 'Edit')}><Pencil className="h-4 w-4" /></Button>
      </div>
    ) },
  ];

  return (
    <Card>
      <CardHeader title={t('مديرو المنصة', 'Platform admins')} subtitle={t('حسابات فريق شؤون بصلاحية بوابة المنصة', 'Shuoon team accounts with portal access')}
        action={<Button size="sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4" />{t('إضافة مدير', 'Add admin')}</Button>} />
      <Async loading={loading} error={error} onRetry={reload} hasData={!!data}>
        {data && <Table columns={cols} rows={data} rowKey={(a) => a.id} />}
      </Async>
      <AddAdminModal open={adding} onClose={() => setAdding(false)} onDone={(a) => setData((d) => [...(d ?? []), a])} />
      <EditAdminModal admin={editing} onClose={() => setEditing(null)} onDone={(a) => setData((d) => (d ? d.map((x) => (x.id === a.id ? { ...x, ...a } : x)) : d))} />
    </Card>
  );
}

function AddAdminModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (a: PlatformAdmin) => void }) {
  const { t } = useLang();
  const toast = useToast();
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setF({ name: '', email: '', password: '' }); }, [open]);
  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!f.name.trim() || !f.email.trim()) return;
    if (f.password.length < 8) { toast(t('كلمة المرور 8 أحرف على الأقل', 'Password must be at least 8 characters'), 'error'); return; }
    setBusy(true);
    try {
      const r = await api.post<PlatformAdmin>('/admin/admins', { name: f.name.trim(), email: f.email.trim(), password: f.password });
      toast(t('تمت إضافة المدير', 'Admin added')); onDone(r); onClose();
    } catch (err) { toast(errMsg(err), 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} size="sm" title={t('إضافة مدير منصة', 'Add platform admin')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('إلغاء', 'Cancel')}</Button><Button onClick={() => submit()} loading={busy} disabled={!f.name.trim() || !f.email.trim()}>{t('إضافة', 'Add')}</Button></>}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('الاسم', 'Name')} required><Input value={f.name} onChange={(e) => setF((s) => ({ ...s, name: e.target.value }))} autoFocus /></Field>
        <Field label={t('البريد الإلكتروني', 'Email')} required><Input type="email" dir="ltr" value={f.email} onChange={(e) => setF((s) => ({ ...s, email: e.target.value }))} /></Field>
        <Field label={t('كلمة المرور', 'Password')} required hint={t('8 أحرف على الأقل', 'At least 8 characters')}><Input type="password" dir="ltr" autoComplete="new-password" value={f.password} onChange={(e) => setF((s) => ({ ...s, password: e.target.value }))} /></Field>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

function EditAdminModal({ admin, onClose, onDone }: { admin: PlatformAdmin | null; onClose: () => void; onDone: (a: PlatformAdmin) => void }) {
  const { t } = useLang();
  const toast = useToast();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (admin) setName(admin.name); }, [admin]);
  if (!admin) return null;
  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try { const r = await api.patch<PlatformAdmin>(`/admin/admins/${admin.id}`, { name: name.trim() }); toast(t('تم الحفظ', 'Saved')); onDone(r); onClose(); }
    catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} size="sm" title={t('تعديل المدير', 'Edit admin')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('إلغاء', 'Cancel')}</Button><Button onClick={submit} loading={busy} disabled={!name.trim()}>{t('حفظ', 'Save')}</Button></>}>
      <Field label={t('الاسم', 'Name')} required><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <p className="mt-3 text-xs text-ink-soft" dir="ltr">{admin.email}</p>
    </Modal>
  );
}

function useSettingsSection() {
  return useFetch(() => api.get<PlatformSettings>('/admin/settings'), []);
}

const BILLING_FIELDS: { key: keyof BillingSettings; label: [string, string]; dir?: 'ltr'; hint?: [string, string] }[] = [
  { key: 'sellerName', label: ['اسم البائع (عربي)', 'Seller name (Arabic)'] },
  { key: 'sellerNameEn', label: ['اسم البائع (إنجليزي)', 'Seller name (English)'], dir: 'ltr' },
  { key: 'sellerVatNumber', label: ['الرقم الضريبي', 'VAT number'], dir: 'ltr', hint: ['15 رقماً — يظهر على الفاتورة الضريبية', '15 digits — printed on tax invoices'] },
  { key: 'sellerCrNumber', label: ['السجل التجاري', 'CR number'], dir: 'ltr' },
  { key: 'sellerAddress', label: ['العنوان', 'Address'] },
  { key: 'sellerEmail', label: ['بريد الفوترة', 'Billing email'], dir: 'ltr' },
  { key: 'sellerPhone', label: ['هاتف الفوترة', 'Billing phone'], dir: 'ltr' },
  { key: 'bankName', label: ['البنك', 'Bank'] },
  { key: 'iban', label: ['الآيبان', 'IBAN'], dir: 'ltr' },
];

function BillingForm() {
  const { t, lang } = useLang();
  const toast = useToast();
  const { data, loading, error, reload, setData } = useSettingsSection();
  const [f, setF] = useState<Record<keyof BillingSettings, string>>(() => toBillingForm(DEFAULT_BILLING));
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setF(toBillingForm({ ...DEFAULT_BILLING, ...data.billing })); }, [data]);
  const save = async () => {
    const vat = Number(f.vatRate); const due = Number(f.invoiceDueDays);
    if (isNaN(vat) || vat < 0 || vat > 100) { toast(t('نسبة الضريبة بين 0% و100%', 'VAT must be 0–100%'), 'error'); return; }
    if (!Number.isInteger(due) || due < 0 || due > 90) { toast(t('مهلة السداد بين 0 و90 يوماً', 'Due days must be 0–90'), 'error'); return; }
    const billing: Partial<BillingSettings> = { vatRate: Math.round(vat * 100) / 10000, invoiceDueDays: due };
    for (const x of BILLING_FIELDS) (billing as Record<string, unknown>)[x.key] = f[x.key].trim();
    setBusy(true);
    try {
      const r = await api.patch<PlatformSettings>('/admin/settings', { billing });
      setData(r); invalidateSettingsCache(); toast(t('تم حفظ بيانات الفوترة', 'Billing details saved'));
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };
  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2"><Landmark className="h-4 w-4 text-primary" />{t('بيانات الفوترة', 'Billing details')}</span>}
        subtitle={t('تظهر على كل فاتورة ضريبية تصدرها المنصة', 'Printed on every tax invoice the platform issues')}
        action={<Button size="sm" onClick={save} loading={busy} disabled={!data}><Save className="h-4 w-4" />{t('حفظ', 'Save')}</Button>} />
      <CardBody>
        <Async loading={loading} error={error} onRetry={reload} hasData={!!data}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {BILLING_FIELDS.map((x) => (
              <Field key={x.key} label={lang === 'ar' ? x.label[0] : x.label[1]} hint={x.hint ? (lang === 'ar' ? x.hint[0] : x.hint[1]) : undefined}>
                <Input dir={x.dir} value={f[x.key]} onChange={(e) => setF((s) => ({ ...s, [x.key]: e.target.value }))} />
              </Field>
            ))}
            <Field label={t('ضريبة القيمة المضافة (%)', 'VAT (%)')}>
              <Input type="number" min={0} max={100} step="0.5" dir="ltr" value={f.vatRate} onChange={(e) => setF((s) => ({ ...s, vatRate: e.target.value }))} />
            </Field>
            <Field label={t('مهلة السداد (أيام)', 'Payment terms (days)')} hint={t('تاريخ الاستحقاق = تاريخ الإصدار + المهلة', 'Due date = issue date + terms')}>
              <Input type="number" min={0} max={90} dir="ltr" value={f.invoiceDueDays} onChange={(e) => setF((s) => ({ ...s, invoiceDueDays: e.target.value }))} />
            </Field>
          </div>
        </Async>
      </CardBody>
    </Card>
  );
}
function toBillingForm(b: BillingSettings): Record<keyof BillingSettings, string> {
  return {
    sellerName: b.sellerName ?? '', sellerNameEn: b.sellerNameEn ?? '', sellerVatNumber: b.sellerVatNumber ?? '', sellerCrNumber: b.sellerCrNumber ?? '',
    sellerAddress: b.sellerAddress ?? '', sellerEmail: b.sellerEmail ?? '', sellerPhone: b.sellerPhone ?? '', bankName: b.bankName ?? '', iban: b.iban ?? '',
    vatRate: String(Math.round((b.vatRate ?? 0.15) * 1000) / 10), invoiceDueDays: String(b.invoiceDueDays ?? 7),
  };
}

const DAY_PRESETS = [60, 30, 14, 7, 3, 1, 0];
function DayPicker({ value, onChange, presets = DAY_PRESETS, suffix }: { value: number[]; onChange: (v: number[]) => void; presets?: number[]; suffix: (n: number) => string }) {
  const toggle = (n: number) => onChange(value.includes(n) ? value.filter((x) => x !== n) : [...value, n].sort((a, b) => b - a).slice(0, 6));
  return (
    <div className="flex flex-wrap gap-1.5">
      {presets.map((n) => (
        <button key={n} type="button" onClick={() => toggle(n)} aria-pressed={value.includes(n)}
          className={value.includes(n)
            ? 'num rounded-full border border-primary bg-primary px-3 py-1 text-xs font-medium text-white'
            : 'num rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-ink-muted hover:border-primary-500'}>
          {suffix(n)}
        </button>
      ))}
    </div>
  );
}

function RemindersForm() {
  const { t } = useLang();
  const toast = useToast();
  const { data, loading, error, reload, setData } = useSettingsSection();
  const [f, setF] = useState<ReminderSettings>(DEFAULT_REMINDERS);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setF({ ...DEFAULT_REMINDERS, ...data.reminders }); }, [data]);
  const save = async () => {
    setBusy(true);
    try {
      const r = await api.patch<PlatformSettings>('/admin/settings', { reminders: f });
      setData(r); toast(t('تم حفظ إعدادات التذكيرات', 'Reminder settings saved'));
    } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };
  const before = (n: number) => (n === 0 ? t('يوم الانتهاء', 'On the day') : t(`قبل ${n} يوم`, `${n}d before`));
  const after = (n: number) => t(`بعد ${n} يوم`, `${n}d after`);
  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2"><BellRing className="h-4 w-4 text-primary" />{t('التذكيرات التلقائية', 'Automatic reminders')}</span>}
        subtitle={t('رسائل بريدية وتنبيهات داخل التطبيق لمالك المنشأة — تعمل يومياً الساعة 9:00 صباحاً بتوقيت الرياض', 'Emails and in-app alerts to the company owner — run daily at 09:00 Riyadh time')}
        action={<Button size="sm" onClick={save} loading={busy} disabled={!data}><Save className="h-4 w-4" />{t('حفظ', 'Save')}</Button>} />
      <CardBody>
        <Async loading={loading} error={error} onRetry={reload} hasData={!!data}>
          <div className="space-y-4">
            <div className="flex flex-col gap-3 rounded-xl border border-line bg-sand/50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-ink">{t('تفعيل التذكيرات التلقائية', 'Enable automatic reminders')}</p>
                <p className="mt-0.5 text-xs text-ink-muted">{t('عند الإيقاف لا تُرسل تذكيرات انتهاء التجربة أو الاشتراك أو الفواتير المتأخرة.', 'When off, no trial, subscription or overdue-invoice reminders are sent.')}</p>
              </div>
              <Toggle checked={f.enabled} onChange={(v) => setF((s) => ({ ...s, enabled: v }))} />
            </div>
            <div className={f.enabled ? 'grid gap-4 lg:grid-cols-3' : 'pointer-events-none grid gap-4 opacity-50 lg:grid-cols-3'}>
              <ReminderGroup title={t('قرب انتهاء الفترة التجريبية', 'Trial ending')}><DayPicker value={f.trialDays} onChange={(v) => setF((s) => ({ ...s, trialDays: v }))} suffix={before} /></ReminderGroup>
              <ReminderGroup title={t('قرب انتهاء الاشتراك', 'Subscription ending')}><DayPicker value={f.subscriptionDays} onChange={(v) => setF((s) => ({ ...s, subscriptionDays: v }))} suffix={before} /></ReminderGroup>
              <ReminderGroup title={t('فاتورة متأخرة السداد', 'Overdue invoice')}><DayPicker value={f.overdueInvoiceDays} onChange={(v) => setF((s) => ({ ...s, overdueInvoiceDays: v }))} presets={[1, 3, 7, 14, 30]} suffix={after} /></ReminderGroup>
            </div>
            <div className="rounded-xl border border-line p-4">
              <Toggle checked={f.notifyOnExpiry} onChange={(v) => setF((s) => ({ ...s, notifyOnExpiry: v }))} label={t('إشعار المالك عند انتهاء الاشتراك', 'Notify the owner when the subscription expires')} />
            </div>
            <p className="text-xs text-ink-soft">{t('حتى 6 مواعيد لكل نوع. لا تُكرَّر الرسالة نفسها عند إعادة تشغيل التذكيرات في اليوم ذاته.', 'Up to 6 points per type. The same reminder is never sent twice, even if the job re-runs.')}</p>
          </div>
        </Async>
      </CardBody>
    </Card>
  );
}
function ReminderGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line p-4">
      <p className="mb-2.5 text-sm font-semibold text-ink">{title}</p>
      {children}
    </div>
  );
}
