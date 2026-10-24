'use client';
import clsx from 'clsx';
import Link from 'next/link';
import { useState } from 'react';
import { Bell, BriefcaseBusiness, ChevronLeft, ChevronRight, ClipboardList, IdCard, KeyRound, Languages, LayoutDashboard, LogOut, UserRound } from 'lucide-react';
import { api, ApiError, changePassword } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFetch } from '@/lib/useFetch';
import { useLang } from '@/lib/i18n';
import { date as fmtDate, money } from '@/lib/format';
import { EMPLOYEE_STATUS, label, ROLE } from '@/lib/labels';
import { Badge, type Tone } from '@/components/ui/Badge';
import { Field, Input } from '@/components/ui/Field';
import { ErrorState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { NotificationsList } from '@/components/ess/NotificationsList';
import { FormError, IconTile, Section, Sheet, SheetButton, Skeleton } from '@/components/ess/primitives';
import type { MyProfile } from '@/components/ess/types';
import { daysUntil, maskIban } from '@/components/ess/utils';

export default function MorePage() {
  const { t, lang, setLang, dir } = useLang();
  const { user, logout } = useAuth();
  const { data: p, loading, error, reload } = useFetch(() => api.get<MyProfile>('/me/profile'), []);
  const [pwOpen, setPwOpen] = useState(false);
  const Chevron = dir === 'rtl' ? ChevronLeft : ChevronRight;

  const fullName = p ? (lang === 'ar' ? `${p.firstNameAr} ${p.lastNameAr}` : p.fullNameEn || `${p.firstNameAr} ${p.lastNameAr}`) : user?.name ?? '';
  const iqamaDays = daysUntil(p?.idExpiry);
  const iqama: { tone: Tone; text: string } | null = iqamaDays === null ? null
    : iqamaDays < 0 ? { tone: 'danger', text: t('منتهية', 'Expired') }
    : iqamaDays <= 30 ? { tone: 'danger', text: t(`تنتهي خلال ${iqamaDays} يوماً`, `${iqamaDays} days left`) }
    : iqamaDays <= 90 ? { tone: 'warning', text: t(`تنتهي خلال ${iqamaDays} يوماً`, `${iqamaDays} days left`) }
    : { tone: 'success', text: t('سارية', 'Valid') };
  const totalWage = p ? (p.basicSalary ?? 0) + (p.housingAllowance ?? 0) + (p.transportAllowance ?? 0) + (p.otherAllowances ?? 0) : 0;

  return (
    <div className="space-y-6">
      {/* Profile header */}
      {loading && !p ? <Skeleton className="h-36 rounded-[28px]" /> : (
        <div className="flex items-center gap-4 rounded-[28px] border border-line bg-white p-5 shadow-soft">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-3xl text-2xl font-bold text-white" style={{ background: p?.avatarColor || '#16313A' }}>
            {fullName.trim().slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold text-ink">{fullName}</p>
            <p className="truncate text-sm text-ink-muted">{p?.jobTitle ?? label(ROLE, user?.role, lang)}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {p?.employeeNumber && <Badge tone="primary" className="num">{p.employeeNumber}</Badge>}
              {p?.status && <Badge tone={p.status === 'ACTIVE' ? 'success' : 'info'}>{label(EMPLOYEE_STATUS, p.status, lang)}</Badge>}
            </div>
          </div>
        </div>
      )}
      {error && !p && <ErrorState message={error} onRetry={reload} />}

      {p && (
        <>
          <Section title={<span className="flex items-center gap-2"><UserRound className="h-4 w-4 text-primary-500" />{t('البيانات الشخصية', 'Personal')}</span>}>
            <InfoList rows={[
              [t('الجنسية', 'Nationality'), p.isSaudi ? t('سعودي', 'Saudi') : p.nationality],
              [t('الجوال', 'Phone'), p.phone, true],
              [t('البريد', 'Email'), p.email, true],
              [t('تاريخ الميلاد', 'Birth date'), fmtDate(p.birthDate, lang)],
            ]} />
          </Section>

          <Section title={<span className="flex items-center gap-2"><IdCard className="h-4 w-4 text-primary-500" />{t('الهوية والمستندات', 'ID & documents')}</span>}>
            <div className="overflow-hidden rounded-3xl border border-line bg-white shadow-soft">
              <div className="flex items-center justify-between gap-3 px-4 py-3.5">
                <div>
                  <p className="text-xs text-ink-muted">{p.isSaudi ? t('الهوية الوطنية', 'National ID') : t('رقم الإقامة', 'Iqama no.')}</p>
                  <p className="num font-semibold text-ink">{p.nationalId || '—'}</p>
                </div>
                <div className="text-end">
                  <p className="text-xs text-ink-muted">{t('تاريخ الانتهاء', 'Expiry')}</p>
                  <p className="num text-sm font-semibold text-ink">{fmtDate(p.idExpiry, lang)}</p>
                  {iqama && <Badge tone={iqama.tone} className="mt-1">{iqama.text}</Badge>}
                </div>
              </div>
              {p.passportNumber && (
                <div className="flex items-center justify-between border-t border-line/70 px-4 py-3.5 text-sm">
                  <span className="text-ink-muted">{t('جواز السفر', 'Passport')} <span className="num font-medium text-ink">{p.passportNumber}</span></span>
                  <span className="num text-ink">{fmtDate(p.passportExpiry, lang)}</span>
                </div>
              )}
            </div>
          </Section>

          <Section title={<span className="flex items-center gap-2"><BriefcaseBusiness className="h-4 w-4 text-primary-500" />{t('الوظيفة والعقد', 'Job & contract')}</span>}>
            <InfoList rows={[
              [t('المسمى', 'Title'), p.jobTitle],
              [t('الفرع', 'Branch'), p.branch?.nameAr],
              [t('القسم', 'Department'), p.department?.name],
              [t('المدير المباشر', 'Manager'), p.manager?.name],
              [t('تاريخ المباشرة', 'Hire date'), fmtDate(p.hireDate, lang)],
              [t('نوع العقد', 'Contract'), p.contractType === 'FIXED' ? `${t('محدد المدة', 'Fixed term')}${p.contractEndDate ? ` · ${t('ينتهي', 'ends')} ${fmtDate(p.contractEndDate, lang)}` : ''}` : p.contractType === 'UNLIMITED' ? t('غير محدد المدة', 'Unlimited') : null],
              ...(p.probationEndDate && (daysUntil(p.probationEndDate) ?? -1) >= 0 ? [[t('نهاية التجربة', 'Probation ends'), fmtDate(p.probationEndDate, lang)] as [string, string]] : []),
              [t('إجمالي الأجر', 'Total wage'), totalWage ? money(totalWage) : null, true],
              [t('الآيبان', 'IBAN'), maskIban(p.iban), true],
            ]} />
          </Section>
        </>
      )}

      <Section title={<span className="flex items-center gap-2"><Bell className="h-4 w-4 text-primary-500" />{t('الإشعارات', 'Notifications')}</span>}
        action={<Link href="/me/notifications" className="text-sm font-medium text-primary-500">{t('عرض الكل', 'View all')}</Link>}>
        <NotificationsList limit={5} />
      </Section>

      <Section title={t('الإعدادات', 'Settings')}>
        <div className="overflow-hidden rounded-3xl border border-line bg-white shadow-soft">
          <Row icon={<ClipboardList className="h-5 w-5" />} label={t('طلباتي', 'My requests')} href="/me/requests" chevron={<Chevron className="h-5 w-5" />} />
          <Row icon={<KeyRound className="h-5 w-5" />} label={t('تغيير كلمة المرور', 'Change password')} onClick={() => setPwOpen(true)} chevron={<Chevron className="h-5 w-5" />} />
          <div className="flex min-h-[60px] items-center gap-3 border-t border-line/70 px-4">
            <IconTile icon={<Languages className="h-5 w-5" />} tone="neutral" className="h-10 w-10" />
            <span className="flex-1 text-[15px] font-medium text-ink">{t('اللغة', 'Language')}</span>
            <div className="flex rounded-xl bg-sand-200 p-1">
              {(['ar', 'en'] as const).map((l) => (
                <button key={l} onClick={() => setLang(l)} className={clsx('h-9 rounded-lg px-3 text-sm font-medium', lang === l ? 'bg-white text-primary shadow-soft' : 'text-ink-muted')}>
                  {l === 'ar' ? 'العربية' : 'English'}
                </button>
              ))}
            </div>
          </div>
          {user && user.role !== 'EMPLOYEE' && (
            <Row icon={<LayoutDashboard className="h-5 w-5" />} label={t('لوحة الشركة', 'Company dashboard')} href="/app" chevron={<Chevron className="h-5 w-5" />} />
          )}
          <button onClick={logout} className="flex min-h-[60px] w-full items-center gap-3 border-t border-line/70 px-4 text-start text-danger">
            <IconTile icon={<LogOut className="h-5 w-5" />} tone="danger" className="h-10 w-10" />
            <span className="flex-1 text-[15px] font-medium">{t('تسجيل الخروج', 'Log out')}</span>
          </button>
        </div>
      </Section>

      <p className="text-center text-xs text-ink-soft">{user?.email} · {t('طاقم — الخدمة الذاتية', 'Taqam self-service')}</p>

      <ChangePasswordSheet open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  );
}

function InfoList({ rows }: { rows: [string, string | null | undefined, boolean?][] }) {
  return (
    <dl className="overflow-hidden rounded-3xl border border-line bg-white shadow-soft">
      {rows.map(([k, v, num], i) => (
        <div key={i} className="flex min-h-[52px] items-center justify-between gap-4 border-b border-line/70 px-4 py-3 last:border-0">
          <dt className="shrink-0 text-sm text-ink-muted">{k}</dt>
          <dd className={clsx('min-w-0 truncate text-end text-sm font-medium text-ink', num && 'num')} dir={num ? 'ltr' : undefined}>{v || '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

function Row({ icon, label: l, href, onClick, chevron }: { icon: React.ReactNode; label: string; href?: string; onClick?: () => void; chevron?: React.ReactNode }) {
  const inner = (
    <>
      <IconTile icon={icon} tone="primary" className="h-10 w-10" />
      <span className="flex-1 text-[15px] font-medium text-ink">{l}</span>
      <span className="text-ink-soft">{chevron}</span>
    </>
  );
  const cls = 'flex min-h-[60px] w-full items-center gap-3 border-t border-line/70 px-4 text-start first:border-0 active:bg-sand';
  return href ? <Link href={href} className={cls}>{inner}</Link> : <button onClick={onClick} className={cls}>{inner}</button>;
}

function ChangePasswordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useLang();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError(null);
    if (!current || !next) return setError(t('أدخل كلمة المرور الحالية والجديدة', 'Enter current and new password'));
    if (next.length < 8) return setError(t('كلمة المرور الجديدة 8 أحرف على الأقل', 'New password must be at least 8 characters'));
    if (next !== confirm) return setError(t('تأكيد كلمة المرور غير مطابق', 'Passwords do not match'));
    setSaving(true);
    try {
      await changePassword(current, next);
      toast(t('تم تغيير كلمة المرور', 'Password changed'));
      setCurrent(''); setNext(''); setConfirm('');
      onClose();
    } catch (e) { setError(e instanceof ApiError ? e.display : String(e)); }
    finally { setSaving(false); }
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('تغيير كلمة المرور', 'Change password')}
      footer={<SheetButton onClick={submit} loading={saving}>{t('حفظ', 'Save')}</SheetButton>}>
      <div className="space-y-4">
        <Field label={t('كلمة المرور الحالية', 'Current password')} required>
          <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className="h-12" />
        </Field>
        <Field label={t('كلمة المرور الجديدة', 'New password')} required hint={t('8 أحرف على الأقل', 'At least 8 characters')}>
          <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className="h-12" />
        </Field>
        <Field label={t('تأكيد كلمة المرور', 'Confirm password')} required>
          <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="h-12" />
        </Field>
        <FormError message={error} />
      </div>
    </Sheet>
  );
}
