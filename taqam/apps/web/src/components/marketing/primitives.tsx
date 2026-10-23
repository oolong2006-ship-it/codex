'use client';
import clsx from 'clsx';
import Link from 'next/link';
import { ArrowLeft, Check, Minus } from 'lucide-react';
import { useLang } from '@/lib/i18n';
import type { T2 } from './data';

/** Translate a bilingual tuple. */
export function useT2() {
  const { t, lang } = useLang();
  return { tt: (p: T2) => t(p[0], p[1]), t, lang };
}

export function Container({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={clsx('mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8', className)}>{children}</div>;
}

/** Arrow that points "forward" in the current reading direction. */
export function ArrowForward({ className }: { className?: string }) {
  return <ArrowLeft aria-hidden className={clsx('h-4 w-4 ltr:rotate-180', className)} />;
}

export function Eyebrow({ children, light, className }: { children: React.ReactNode; light?: boolean; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-2 text-sm font-semibold',
      light ? 'text-accent' : 'text-primary-500', className)}>
      <span aria-hidden className="inline-block h-1.5 w-1.5 rotate-45 bg-accent" />
      {children}
    </span>
  );
}

export function SectionHeading({ eyebrow, title, subtitle, center, light, className, as: As = 'h2' }:
  { eyebrow?: string; title: string; subtitle?: string; center?: boolean; light?: boolean; className?: string; as?: 'h1' | 'h2' }) {
  return (
    <div className={clsx('max-w-2xl', center && 'mx-auto text-center', className)}>
      {eyebrow && <Eyebrow light={light}>{eyebrow}</Eyebrow>}
      <As className={clsx('mt-3 text-balance font-bold leading-tight tracking-tight',
        As === 'h1' ? 'text-3xl sm:text-4xl lg:text-5xl' : 'text-2xl sm:text-3xl lg:text-4xl',
        light ? 'text-white' : 'text-ink')}>{title}</As>
      {subtitle && <p className={clsx('mt-4 text-base leading-8 sm:text-lg', light ? 'text-white/75' : 'text-ink-muted')}>{subtitle}</p>}
    </div>
  );
}

export function Yes({ className }: { className?: string }) {
  return (
    <span className={clsx('inline-flex h-6 w-6 items-center justify-center rounded-full bg-success-50 text-success', className)}>
      <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
    </span>
  );
}
export function No() {
  return <span className="inline-flex h-6 w-6 items-center justify-center text-ink-soft"><Minus className="h-4 w-4" aria-hidden /></span>;
}

/** Decorative 8-point star (Najdi-inspired) used as a motif. */
export function StarMotif({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="20" y="20" width="60" height="60" />
      <rect x="20" y="20" width="60" height="60" transform="rotate(45 50 50)" />
      <circle cx="50" cy="50" r="12" />
    </svg>
  );
}

/** Dark hero band used by inner pages. */
export function PageHero({ eyebrow, title, subtitle, children }:
  { eyebrow?: string; title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden bg-primary text-white">
      <div aria-hidden className="taqam-pattern absolute inset-0 opacity-60" />
      <StarMotif className="pointer-events-none absolute -top-16 h-72 w-72 text-white/[0.06] ltr:-right-16 rtl:-left-16" />
      <Container className="relative py-16 sm:py-20">
        <SectionHeading as="h1" light eyebrow={eyebrow} title={title} subtitle={subtitle} />
        {children && <div className="mt-8">{children}</div>}
      </Container>
    </section>
  );
}

/** Translucent button for dark backgrounds. */
export function GlassLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={clsx('inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-white/25 bg-white/10 px-6 text-base font-medium text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent', className)}>
      {children}
    </Link>
  );
}
