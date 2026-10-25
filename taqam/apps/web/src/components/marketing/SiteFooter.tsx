'use client';
import Link from 'next/link';
import { Mail, MapPin, Phone, ShieldCheck } from 'lucide-react';
import { Logo } from '@/components/ui';
import { SECTORS } from './data';
import { Container, StarMotif, useT2 } from './primitives';

export function SiteFooter() {
  const { tt, t } = useT2();
  const year = 2026;
  const cols: { title: string; links: { href: string; label: string }[] }[] = [
    {
      title: t('المنتج', 'Product'),
      links: [
        { href: '/features', label: t('كل المزايا', 'All features') },
        { href: '/features#payroll', label: t('الرواتب وحماية الأجور', 'Payroll & WPS') },
        { href: '/features#attendance', label: t('الحضور والورديات', 'Attendance & shifts') },
        { href: '/features#ess', label: t('تطبيق الخدمة الذاتية', 'Self-service app') },
        { href: '/pricing', label: t('الأسعار', 'Pricing') },
      ],
    },
    { title: t('القطاعات', 'Sectors'), links: SECTORS.map((s) => ({ href: `/solutions/${s.slug}`, label: tt(s.name) })) },
    {
      title: t('موارد', 'Resources'),
      links: [
        { href: '/tools/end-of-service', label: t('حاسبة نهاية الخدمة', 'End-of-service calculator') },
        { href: '/demo', label: t('اطلب عرضاً تجريبياً', 'Book a demo') },
        { href: '/signup', label: t('ابدأ تجربة مجانية', 'Start free trial') },
        { href: '/login', label: t('تسجيل الدخول', 'Log in') },
      ],
    },
    {
      title: t('الشركة', 'Company'),
      links: [
        { href: '/about', label: t('عن شؤون', 'About Shuoon') },
        { href: '/privacy', label: t('سياسة الخصوصية', 'Privacy policy') },
        { href: '/terms', label: t('الشروط والأحكام', 'Terms of service') },
      ],
    },
  ];

  return (
    <footer className="relative overflow-hidden bg-night text-white/80">
      <StarMotif className="pointer-events-none absolute -bottom-24 h-96 w-96 text-white/[0.04] ltr:-left-24 rtl:-right-24" />
      <Container className="relative py-14">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4 lg:grid-cols-[1.3fr_repeat(4,1fr)]">
          <div className="col-span-2 max-w-sm sm:col-span-4 lg:col-span-1">
            <Logo light showLatin />
            <p className="mt-4 font-display text-base font-semibold text-accent">{t('كل شؤون موظفيك، في مكان واحد', 'All your people matters, in one place')}</p>
            <p className="mt-2 text-sm leading-7 text-white/65">
              {t('منصة شؤون لإدارة الموارد البشرية والرواتب، مصممة للمنشآت متعددة الفروع ذات العمالة الميدانية.',
                'A Saudi HR & payroll platform built for multi-branch businesses with field teams.')}
            </p>
            <ul className="mt-5 space-y-2 text-sm text-white/70">
              <li className="flex items-center gap-2"><MapPin className="h-4 w-4 text-accent" aria-hidden />{t('الرياض، المملكة العربية السعودية', 'Riyadh, Saudi Arabia')}</li>
              <li className="flex items-center gap-2"><Mail className="h-4 w-4 text-accent" aria-hidden /><a href="mailto:hello@shuoon.net" className="hover:text-white" dir="ltr">hello@shuoon.net</a></li>
              <li className="flex items-center gap-2"><Phone className="h-4 w-4 text-accent" aria-hidden /><a href="tel:+966550421235" className="hover:text-white" dir="ltr">+966 55 042 1235</a></li>
            </ul>
          </div>
          {cols.map((c) => (
            <nav key={c.title} aria-label={c.title}>
              <h2 className="text-sm font-semibold text-white">{c.title}</h2>
              <ul className="mt-4 space-y-2.5">
                {c.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-sm text-white/65 transition-colors hover:text-accent focus-visible:text-accent focus-visible:outline-none">{l.label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-12 flex flex-col gap-4 border-t border-white/10 pt-6 text-xs text-white/55 sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} {t('شؤون. جميع الحقوق محفوظة.', 'Shuoon. All rights reserved.')}</p>
          <p className="inline-flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-accent" aria-hidden />
            {t('بياناتك مستضافة داخل المملكة ومحمية وفق نظام حماية البيانات الشخصية', 'Your data is hosted in KSA and protected under the PDPL')}
          </p>
        </div>
      </Container>
    </footer>
  );
}
