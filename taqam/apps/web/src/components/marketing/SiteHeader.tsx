'use client';
import clsx from 'clsx';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Globe, Menu, X } from 'lucide-react';
import { ButtonLink, Logo } from '@/components/ui';
import { NAV_LINKS, SECTORS } from './data';
import { useLang } from '@/lib/i18n';
import { Container, useT2 } from './primitives';

export function SiteHeader() {
  const { tt, t, lang } = useT2();
  const { setLang } = useLang();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [solutions, setSolutions] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const ddRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setOpen(false); setSolutions(false); }, [pathname]);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    if (!solutions) return;
    const onDoc = (e: MouseEvent) => { if (ddRef.current && !ddRef.current.contains(e.target as Node)) setSolutions(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSolutions(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [solutions]);
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');
  const linkCls = (active: boolean) => clsx('rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
    active ? 'text-primary bg-primary-50' : 'text-ink-muted hover:text-primary hover:bg-primary-50/60');
  const toggleLang = () => setLang(lang === 'ar' ? 'en' : 'ar');

  return (
    <header className={clsx('sticky top-0 z-40 border-b transition-all',
      scrolled ? 'border-line bg-sand/90 shadow-soft backdrop-blur-md' : 'border-transparent bg-sand/70 backdrop-blur')}>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-white ltr:focus:left-2 rtl:focus:right-2">
        {t('تخطَّ إلى المحتوى', 'Skip to content')}
      </a>
      <Container className="flex h-16 items-center gap-4">
        <Link href="/" aria-label={t('طاقم — الصفحة الرئيسية', 'Taqam — home')} className="shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <Logo />
        </Link>

        <nav aria-label={t('التنقل الرئيسي', 'Main navigation')} className="hidden flex-1 items-center gap-1 lg:flex ltr:ml-6 rtl:mr-6">
          <Link href="/features" className={linkCls(isActive('/features'))}>{t('المزايا', 'Features')}</Link>
          <div ref={ddRef} className="relative" onMouseEnter={() => setSolutions(true)} onMouseLeave={() => setSolutions(false)}>
            <button type="button" aria-expanded={solutions} aria-haspopup="true" onClick={() => setSolutions((s) => !s)}
              className={clsx(linkCls(isActive('/solutions')), 'inline-flex items-center gap-1')}>
              {t('الحلول', 'Solutions')}
              <ChevronDown className={clsx('h-4 w-4 transition-transform', solutions && 'rotate-180')} aria-hidden />
            </button>
            <div className={clsx('absolute top-full pt-2 transition-all ltr:left-0 rtl:right-0',
              solutions ? 'visible translate-y-0 opacity-100' : 'invisible -translate-y-1 opacity-0')}>
              <div className="w-[min(92vw,560px)] rounded-2xl border border-line bg-white p-3 shadow-lift">
                <p className="px-3 pb-2 pt-1 text-xs font-semibold text-ink-soft">{t('حلول حسب القطاع', 'Solutions by sector')}</p>
                <ul className="grid grid-cols-2 gap-1">
                  {SECTORS.map((s) => (
                    <li key={s.slug}>
                      <Link href={`/solutions/${s.slug}`}
                        className="group flex items-start gap-3 rounded-xl p-3 transition-colors hover:bg-sand focus-visible:bg-sand focus-visible:outline-none">
                        <span className="rounded-lg bg-primary-50 p-2 text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                          <s.icon className="h-4 w-4" aria-hidden />
                        </span>
                        <span>
                          <span className="block text-sm font-semibold text-ink">{tt(s.name)}</span>
                          <span className="mt-0.5 block text-xs leading-5 text-ink-muted">{tt(s.tagline)}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          {NAV_LINKS.slice(1).map((l) => (
            <Link key={l.href} href={l.href} className={linkCls(isActive(l.href))}>{tt(l.label)}</Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex ltr:ml-auto rtl:mr-auto">
          <button type="button" onClick={toggleLang} aria-label={t('Switch to English', 'التبديل إلى العربية')}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-ink-muted transition-colors hover:bg-primary-50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <Globe className="h-4 w-4" aria-hidden />{lang === 'ar' ? 'EN' : 'عربي'}
          </button>
          <Link href="/login" className="rounded-xl px-3 py-2 text-sm font-medium text-primary hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            {t('تسجيل الدخول', 'Log in')}
          </Link>
          <ButtonLink href="/demo" variant="primary">{t('اطلب عرضاً تجريبياً', 'Book a demo')}</ButtonLink>
        </div>

        <div className="flex items-center gap-1 lg:hidden ltr:ml-auto rtl:mr-auto">
          <button type="button" onClick={toggleLang} className="rounded-xl px-2.5 py-2 text-sm font-medium text-ink-muted hover:bg-primary-50" aria-label={t('Switch to English', 'التبديل إلى العربية')}>
            {lang === 'ar' ? 'EN' : 'عربي'}
          </button>
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="mobile-menu"
            aria-label={open ? t('إغلاق القائمة', 'Close menu') : t('فتح القائمة', 'Open menu')}
            className="rounded-xl p-2 text-primary hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </Container>

      {open && (
        <div id="mobile-menu" className="fixed inset-x-0 bottom-0 top-16 z-40 overflow-y-auto border-t border-line bg-sand lg:hidden">
          <Container className="flex flex-col gap-1 py-4">
            <Link href="/features" className="rounded-xl px-3 py-3 text-base font-semibold text-ink hover:bg-white">{t('المزايا', 'Features')}</Link>
            <p className="mt-2 px-3 text-xs font-semibold text-ink-soft">{t('الحلول', 'Solutions')}</p>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {SECTORS.map((s) => (
                <Link key={s.slug} href={`/solutions/${s.slug}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink hover:bg-white">
                  <s.icon className="h-4 w-4 text-primary-500" aria-hidden />{tt(s.name)}
                </Link>
              ))}
            </div>
            <div className="my-2 h-px bg-line" />
            {NAV_LINKS.slice(1).map((l) => (
              <Link key={l.href} href={l.href} className="rounded-xl px-3 py-3 text-base font-semibold text-ink hover:bg-white">{tt(l.label)}</Link>
            ))}
            <div className="mt-4 grid gap-2">
              <ButtonLink href="/demo" size="lg">{t('اطلب عرضاً تجريبياً', 'Book a demo')}</ButtonLink>
              <ButtonLink href="/login" size="lg" variant="secondary">{t('تسجيل الدخول', 'Log in')}</ButtonLink>
            </div>
          </Container>
        </div>
      )}
    </header>
  );
}
