'use client';
import Link from 'next/link';
import { Languages, MapPin, ShieldCheck, Wallet, Users } from 'lucide-react';
import { Logo } from '@/components/ui';
import { useLang } from '@/lib/i18n';

/** Split-screen layout for /login and /signup. */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  const { t, lang, setLang } = useLang();
  const points = [
    { icon: MapPin, text: t('حضور بالموقع لكل فرع مع نطاق جغرافي', 'Geofenced attendance for every branch') },
    { icon: Wallet, text: t('مسير رواتب وملف رواتب (CSV) لرفعه عبر البنك أو مُدد', 'Payroll and a payroll file (CSV) to upload via your bank or Mudad') },
    { icon: ShieldCheck, text: t('نهاية خدمة محسوبة وفق المادتين 84 و85 من نظام العمل', 'End-of-service computed per Articles 84 & 85 of the Labor Law') },
    { icon: Users, text: t('نسبة السعودة لكل فرع مع محاكاة نطاقات', 'Per-branch Saudization & Nitaqat simulator') },
  ];
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="relative flex flex-col px-4 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Link href="/"><Logo /></Link>
          <button onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-ink-muted hover:bg-sand-200">
            <Languages className="h-4 w-4" />{lang === 'ar' ? 'English' : 'العربية'}
          </button>
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-md">{children}</div>
        </div>
        <p className="text-center text-xs text-ink-soft">© {new Date().getFullYear()} {t('شؤون — صُنع في السعودية', 'Shuoon — made in Saudi Arabia')}</p>
      </div>
      <div className="taqam-pattern relative hidden overflow-hidden bg-night lg:block">
        <div className="absolute inset-0 bg-gradient-to-br from-night via-night/95 to-night-800/90" />
        <div className="relative flex h-full flex-col justify-center px-14 py-16 text-white">
          <span className="mb-6 inline-flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs text-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />{t('للمنشآت متعددة الفروع', 'Built for multi-branch businesses')}
          </span>
          <h2 className="max-w-lg text-4xl font-bold leading-tight">
            {t('كل شؤون موظفيك،', 'All your people matters,')}<br />
            <span className="text-accent">{t('في مكان واحد.', 'in one place.')}</span>
          </h2>
          <p className="mt-4 max-w-md text-white/70">{t('الموارد البشرية والرواتب والحضور مصممة للمطاعم والتجزئة والمقاولات والعيادات.', 'HR, payroll and attendance designed for restaurants, retail, contracting and clinics.')}</p>
          <ul className="mt-10 space-y-4">
            {points.map((p) => (
              <li key={p.text} className="flex items-center gap-3">
                <span className="rounded-xl bg-white/10 p-2.5"><p.icon className="h-5 w-5 text-accent" /></span>
                <span className="text-white/90">{p.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
