'use client';
import Link from 'next/link';
import { Calculator, Home, LayoutGrid, Tag } from 'lucide-react';
import { ButtonLink } from '@/components/ui';
import { Container, StarMotif, useT2 } from './primitives';

export function NotFoundContent() {
  const { t } = useT2();
  const links = [
    { href: '/features', icon: LayoutGrid, label: t('المزايا', 'Features') },
    { href: '/pricing', icon: Tag, label: t('الأسعار', 'Pricing') },
    { href: '/tools/end-of-service', icon: Calculator, label: t('حاسبة نهاية الخدمة', 'EOSB calculator') },
  ];
  return (
    <section className="relative overflow-hidden py-20 sm:py-28">
      <div aria-hidden className="taqam-pattern absolute inset-0 opacity-50 [mask-image:radial-gradient(circle_at_center,black,transparent_70%)]" />
      <Container className="relative text-center">
        <div className="relative mx-auto flex h-44 w-44 items-center justify-center">
          <StarMotif className="absolute inset-0 h-full w-full animate-[spin_40s_linear_infinite] text-accent" />
          <span className="num text-5xl font-bold text-primary" dir="ltr">404</span>
        </div>
        <h1 className="mt-8 text-3xl font-bold text-ink sm:text-4xl">{t('يبدو أن هذه الصفحة خارج النطاق', 'This page is outside the geofence')}</h1>
        <p className="mx-auto mt-4 max-w-md text-base leading-8 text-ink-muted">
          {t('الصفحة التي تبحث عنها غير موجودة أو تم نقلها. لنعدك إلى الفريق.', 'The page you’re looking for doesn’t exist or has moved. Let’s get you back to the team.')}
        </p>
        <div className="mt-8 flex justify-center">
          <ButtonLink href="/" size="lg"><Home className="h-4 w-4" aria-hidden />{t('العودة للرئيسية', 'Back to home')}</ButtonLink>
        </div>
        <ul className="mx-auto mt-10 flex max-w-lg flex-wrap justify-center gap-2">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-sm font-medium text-primary transition-colors hover:border-primary-500">
                <l.icon className="h-4 w-4" aria-hidden />{l.label}
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
