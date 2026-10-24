'use client';
import Link from 'next/link';
import { useState } from 'react';
import { KeyRound, Smartphone } from 'lucide-react';
import { Button, Card, CardBody, CardHeader, Field, Input, PageHeader } from '@/components/ui';
import { Avatar, KV } from '@/components/app/primitives';
import { useAction } from '@/components/app/utils';
import { changePassword } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLang } from '@/lib/i18n';
import { ROLE, label } from '@/lib/labels';

export default function ProfilePage() {
  const { t, lang } = useLang();
  const { user } = useAuth();
  const { busy, run } = useAction();
  const [f, setF] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const mismatch = f.confirm && f.newPassword !== f.confirm;
  const valid = f.currentPassword && f.newPassword.length >= 8 && f.newPassword === f.confirm;
  const change = async (e: React.FormEvent) => {
    e.preventDefault();
    if (valid && await run('pw', () => changePassword(f.currentPassword, f.newPassword), t('تم تغيير كلمة المرور', 'Password changed'))) setF({ currentPassword: '', newPassword: '', confirm: '' });
  };
  if (!user) return null;
  return (
    <>
      <PageHeader title={t('الملف الشخصي', 'Profile')} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardBody className="flex flex-col items-center gap-3 text-center">
            <Avatar name={user.name} size="xl" />
            <div><p className="text-lg font-semibold text-ink">{user.name}</p><p className="text-sm text-ink-muted" dir="ltr">{user.email}</p></div>
          </CardBody>
          <div className="border-t border-line p-5">
            <KV items={[
              { label: t('الدور', 'Role'), value: label(ROLE, user.role, lang) },
              { label: t('المنشأة', 'Company'), value: user.company ? (lang === 'en' ? user.company.nameEn || user.company.nameAr : user.company.nameAr) : '—' },
            ]} />
            {user.employeeId && (
              <div className="mt-5 flex flex-wrap gap-2">
                <Link href={`/app/employees/${user.employeeId}`} className="text-sm font-medium text-primary-500 hover:underline">{t('ملفي الوظيفي', 'My employee record')}</Link>
                <span className="text-ink-soft">·</span>
                <Link href="/me" className="inline-flex items-center gap-1 text-sm font-medium text-primary-500 hover:underline"><Smartphone className="h-4 w-4" />{t('خدمتي الذاتية', 'My self-service')}</Link>
              </div>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title={t('تغيير كلمة المرور', 'Change password')} action={<KeyRound className="h-5 w-5 text-accent" />} />
          <CardBody>
            <form onSubmit={change} className="space-y-4">
              <Field label={t('كلمة المرور الحالية', 'Current password')} required><Input type="password" dir="ltr" autoComplete="current-password" value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} /></Field>
              <Field label={t('كلمة المرور الجديدة', 'New password')} required hint={t('8 أحرف على الأقل', 'Min 8 characters')}><Input type="password" dir="ltr" autoComplete="new-password" value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} /></Field>
              <Field label={t('تأكيد كلمة المرور', 'Confirm password')} required error={mismatch ? t('كلمتا المرور غير متطابقتين', 'Passwords do not match') : undefined}><Input type="password" dir="ltr" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} /></Field>
              <Button type="submit" loading={busy === 'pw'} disabled={!valid}>{t('تحديث كلمة المرور', 'Update password')}</Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
