'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Ban, CalendarX2, Eye, EyeOff, Hourglass, LogIn } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { Button, Field, Input } from '@/components/ui';
import { AuthLayout } from '@/components/app/AuthLayout';
import { errMsg } from '@/components/app/utils';
import { homeFor, useAuth, type SessionUser } from '@/lib/auth';
import { useLang } from '@/lib/i18n';
import { label, ROLE } from '@/lib/labels';

const DEMO = [
  { email: 'owner@shuoon.demo', role: 'OWNER' },
  { email: 'hr@shuoon.demo', role: 'HR_ADMIN' },
  { email: 'payroll@shuoon.demo', role: 'PAYROLL' },
  { email: 'manager@shuoon.demo', role: 'BRANCH_MANAGER' },
  { email: 'employee@shuoon.demo', role: 'EMPLOYEE' },
  { email: 'admin@shuoon.demo', role: 'SUPER_ADMIN' },
];
const DEMO_PASSWORD = 'Shuoon@2026';

type CompanyBlock = 'COMPANY_PENDING' | 'COMPANY_SUSPENDED' | 'COMPANY_EXPIRED';
/** Company-status refusal from the API (403 + code), so it can be shown as a clear state instead of a generic error. */
function companyBlock(err: unknown): { code: CompanyBlock; message: string } | null {
  if (!(err instanceof ApiError) || err.status !== 403) return null;
  const code = (err.body as { code?: string } | undefined)?.code;
  if (code === 'COMPANY_PENDING' || code === 'COMPANY_SUSPENDED' || code === 'COMPANY_EXPIRED') return { code, message: err.display };
  return null;
}

function destination(u: SessionUser) {
  if (typeof window === 'undefined') return homeFor(u);
  const next = new URLSearchParams(window.location.search).get('next');
  const home = homeFor(u);
  if (next && next.startsWith('/') && !next.startsWith('//') && next.startsWith(home)) return next;
  return home;
}

export default function LoginPage() {
  const { t, lang } = useLang();
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [block, setBlock] = useState<{ code: CompanyBlock; message: string } | null>(null);

  useEffect(() => { if (!loading && user) router.replace(destination(user)); }, [user, loading, router]);

  const submit = async (e?: React.FormEvent, creds?: { email: string; password: string }) => {
    e?.preventDefault();
    setBusy(true); setError(null); setBlock(null);
    try {
      const u = await login((creds?.email ?? email).trim(), creds?.password ?? password);
      router.replace(destination(u));
    } catch (err) {
      const b = companyBlock(err);
      if (b) setBlock(b); else setError(errMsg(err));
    } finally { setBusy(false); }
  };

  return (
    <AuthLayout>
      <h1 className="text-3xl font-bold text-ink">{t('مرحباً بعودتك', 'Welcome back')}</h1>
      <p className="mt-2 text-sm text-ink-muted">{t('سجّل الدخول إلى حساب منشأتك في شؤون.', 'Sign in to your Shuoon company account.')}</p>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <Field label={t('البريد الإلكتروني', 'Email')} required>
          <Input type="email" dir="ltr" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="name@company.sa" />
        </Field>
        <Field label={t('كلمة المرور', 'Password')} required>
          <div className="relative">
            <Input type={show ? 'text' : 'password'} dir="ltr" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className="pe-10" />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-soft hover:text-primary" aria-label="toggle password">
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>
        {error && <p className="rounded-xl bg-danger-50 px-3 py-2 text-sm text-danger">{error}</p>}
        {block && <CompanyBlockNotice code={block.code} message={block.message} />}
        <Button type="submit" size="lg" className="w-full" loading={busy}><LogIn className="h-4 w-4 rtl:rotate-180" />{t('تسجيل الدخول', 'Sign in')}</Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-muted">
        {t('منشأتك غير مسجلة؟', 'New to Shuoon?')}{' '}
        <Link href="/signup" className="font-semibold text-primary-500 hover:underline">{t('سجّل منشأتك مجاناً', 'Register your company')}</Link>
      </p>

      <div className="mt-8 rounded-2xl border border-dashed border-accent/60 bg-accent-50 p-4">
        <p className="text-sm font-semibold text-ink">{t('حسابات تجريبية', 'Demo accounts')}</p>
        <p className="mt-0.5 text-xs text-ink-muted">{t('مطاعم ورد الشام — كلمة المرور:', 'Ward Al-Sham Restaurants — password:')} <code dir="ltr" className="rounded bg-white px-1">{DEMO_PASSWORD}</code></p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {DEMO.map((d) => (
            <button key={d.email} type="button" disabled={busy}
              onClick={() => { setEmail(d.email); setPassword(DEMO_PASSWORD); void submit(undefined, { email: d.email, password: DEMO_PASSWORD }); }}
              className="rounded-xl border border-line bg-white px-3 py-2 text-start transition-colors hover:border-primary-500 hover:bg-primary-50 disabled:opacity-50">
              <span className="block text-sm font-medium text-primary">{d.role === 'SUPER_ADMIN' ? t('مدير المنصة', 'Platform admin') : label(ROLE, d.role, lang)}</span>
              <span className="block truncate text-[11px] text-ink-soft" dir="ltr">{d.email}</span>
            </button>
          ))}
        </div>
      </div>
    </AuthLayout>
  );
}

function CompanyBlockNotice({ code, message }: { code: CompanyBlock; message: string }) {
  const { t } = useLang();
  const cfg = {
    COMPANY_PENDING: { icon: Hourglass, box: 'border-warning/40 bg-warning-50 text-warning', title: t('حسابك قيد المراجعة', 'Account under review'), fallback: 'حساب منشأتك قيد المراجعة، وسيتم تفعيله قريباً' },
    COMPANY_SUSPENDED: { icon: Ban, box: 'border-danger/30 bg-danger-50 text-danger', title: t('الحساب موقوف', 'Account suspended'), fallback: 'تم إيقاف حساب منشأتك. تواصل مع الدعم' },
    COMPANY_EXPIRED: { icon: CalendarX2, box: 'border-line bg-sand-200 text-ink', title: t('انتهى الاشتراك', 'Subscription ended'), fallback: 'انتهى اشتراك منشأتك. تواصل معنا للتجديد' },
  }[code];
  const Icon = cfg.icon;
  return (
    <div role="alert" className={`flex items-start gap-3 rounded-2xl border px-4 py-3 ${cfg.box}`}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="text-sm">
        <p className="font-semibold">{cfg.title}</p>
        <p className="mt-0.5 opacity-90">{message || cfg.fallback}</p>
        {code !== 'COMPANY_PENDING' && <a href="mailto:hello@shuoon.sa" className="mt-1 inline-block text-xs font-medium underline" dir="ltr">hello@shuoon.sa</a>}
      </div>
    </div>
  );
}
