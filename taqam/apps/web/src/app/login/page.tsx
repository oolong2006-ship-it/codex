'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { Button, Field, Input } from '@/components/ui';
import { AuthLayout } from '@/components/app/AuthLayout';
import { errMsg } from '@/components/app/utils';
import { homeFor, useAuth, type SessionUser } from '@/lib/auth';
import { useLang } from '@/lib/i18n';
import { label, ROLE } from '@/lib/labels';

const DEMO = [
  { email: 'owner@taqam.demo', role: 'OWNER' },
  { email: 'hr@taqam.demo', role: 'HR_ADMIN' },
  { email: 'payroll@taqam.demo', role: 'PAYROLL' },
  { email: 'manager@taqam.demo', role: 'BRANCH_MANAGER' },
  { email: 'employee@taqam.demo', role: 'EMPLOYEE' },
];
const DEMO_PASSWORD = 'Taqam@2026';

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

  useEffect(() => { if (!loading && user) router.replace(destination(user)); }, [user, loading, router]);

  const submit = async (e?: React.FormEvent, creds?: { email: string; password: string }) => {
    e?.preventDefault();
    setBusy(true); setError(null);
    try {
      const u = await login((creds?.email ?? email).trim(), creds?.password ?? password);
      router.replace(destination(u));
    } catch (err) {
      setError(errMsg(err));
    } finally { setBusy(false); }
  };

  return (
    <AuthLayout>
      <h1 className="text-3xl font-bold text-ink">{t('مرحباً بعودتك', 'Welcome back')}</h1>
      <p className="mt-2 text-sm text-ink-muted">{t('سجّل الدخول إلى حساب منشأتك في طاقم.', 'Sign in to your Taqam company account.')}</p>
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
        <Button type="submit" size="lg" className="w-full" loading={busy}><LogIn className="h-4 w-4 rtl:rotate-180" />{t('تسجيل الدخول', 'Sign in')}</Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-muted">
        {t('منشأتك غير مسجلة؟', 'New to Taqam?')}{' '}
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
              <span className="block text-sm font-medium text-primary">{label(ROLE, d.role, lang)}</span>
              <span className="block truncate text-[11px] text-ink-soft" dir="ltr">{d.email}</span>
            </button>
          ))}
        </div>
      </div>
    </AuthLayout>
  );
}
