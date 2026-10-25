'use client';
import { useEffect, useState } from 'react';
import { Pencil, Plus, Save } from 'lucide-react';
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
import { PLAN, PLANS, lbl, type Plan, type PlatformAdmin, type PlatformSettings } from '@/lib/adminTypes';

export default function AdminSettingsPage() {
  const { t } = useLang();
  return (
    <div>
      <PageHeader title={t('إعدادات المنصة', 'Platform settings')} subtitle={t('سياسة التسجيل والأسعار وفريق إدارة المنصة', 'Signup policy, pricing and the platform team')} />
      <div className="space-y-6">
        <SettingsForm />
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
        <Avatar name={a.name} color="#172C46" size="sm" />
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
