'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Building2 } from 'lucide-react';
import { Button, Field, Input, Select } from '@/components/ui';
import { AuthLayout } from '@/components/app/AuthLayout';
import { errMsg } from '@/components/app/utils';
import { homeFor, useAuth } from '@/lib/auth';
import { useLang } from '@/lib/i18n';
import { SECTOR } from '@/lib/labels';

export default function SignupPage() {
  const { t, lang } = useLang();
  const { register } = useAuth();
  const router = useRouter();
  const [f, setF] = useState({ companyNameAr: '', companyNameEn: '', sector: 'RESTAURANTS', employeesCount: '', ownerName: '', email: '', phone: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (f.password.length < 8) { setError(t('كلمة المرور يجب ألا تقل عن 8 أحرف', 'Password must be at least 8 characters')); return; }
    setBusy(true); setError(null);
    try {
      const u = await register({
        companyNameAr: f.companyNameAr.trim(),
        companyNameEn: f.companyNameEn.trim() || undefined,
        sector: f.sector,
        employeesCount: f.employeesCount ? Number(f.employeesCount) : undefined,
        ownerName: f.ownerName.trim(),
        email: f.email.trim(),
        phone: f.phone.trim() || undefined,
        password: f.password,
      });
      router.replace(homeFor(u));
    } catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  };

  const sectors = Object.entries(SECTOR).map(([value, l]) => ({ value, label: lang === 'ar' ? l[0] : l[1] }));
  return (
    <AuthLayout>
      <div className="mb-2 inline-flex rounded-xl bg-primary-100 p-2.5 text-primary"><Building2 className="h-5 w-5" /></div>
      <h1 className="text-3xl font-bold text-ink">{t('سجّل منشأتك', 'Register your company')}</h1>
      <p className="mt-2 text-sm text-ink-muted">{t('ابدأ خلال دقيقتين — نجهّز لك أنواع الإجازات حسب نظام العمل تلقائياً.', 'Get started in two minutes — leave types per Saudi Labor Law are set up automatically.')}</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('اسم المنشأة (عربي)', 'Company name (Arabic)')} required>
            <Input value={f.companyNameAr} onChange={set('companyNameAr')} required />
          </Field>
          <Field label={t('اسم المنشأة (إنجليزي)', 'Company name (English)')}>
            <Input value={f.companyNameEn} onChange={set('companyNameEn')} dir="ltr" />
          </Field>
          <Field label={t('القطاع', 'Sector')} required>
            <Select value={f.sector} onChange={set('sector')} options={sectors} />
          </Field>
          <Field label={t('عدد الموظفين', 'Employees')}>
            <Input type="number" min={1} value={f.employeesCount} onChange={set('employeesCount')} dir="ltr" />
          </Field>
        </div>
        <div className="h-px bg-line" />
        <Field label={t('اسم المالك / المسؤول', 'Owner name')} required>
          <Input value={f.ownerName} onChange={set('ownerName')} required autoComplete="name" />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('البريد الإلكتروني', 'Email')} required>
            <Input type="email" value={f.email} onChange={set('email')} required dir="ltr" autoComplete="email" />
          </Field>
          <Field label={t('الجوال', 'Phone')}>
            <Input type="tel" value={f.phone} onChange={set('phone')} dir="ltr" placeholder="05xxxxxxxx" autoComplete="tel" />
          </Field>
        </div>
        <Field label={t('كلمة المرور', 'Password')} required hint={t('8 أحرف على الأقل', 'At least 8 characters')}>
          <Input type="password" value={f.password} onChange={set('password')} required dir="ltr" autoComplete="new-password" />
        </Field>
        {error && <p className="rounded-xl bg-danger-50 px-3 py-2 text-sm text-danger">{error}</p>}
        <Button type="submit" size="lg" variant="accent" className="w-full" loading={busy}>{t('إنشاء الحساب', 'Create account')}</Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-muted">
        {t('لديك حساب؟', 'Already have an account?')}{' '}
        <Link href="/login" className="font-semibold text-primary-500 hover:underline">{t('تسجيل الدخول', 'Sign in')}</Link>
      </p>
    </AuthLayout>
  );
}
