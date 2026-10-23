'use client';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Quote } from 'lucide-react';
import { ButtonLink } from '@/components/ui';
import { SECTORS, type SectorSlug, getSector } from './data';
import { ArrowForward, Container, GlassLink, PageHero, SectionHeading, StarMotif, useT2 } from './primitives';
import { CtaBand } from './CtaBand';

export function SectorPage({ slug }: { slug: SectorSlug }) {
  const { t, tt } = useT2();
  const s = getSector(slug)!;
  const others = SECTORS.filter((x) => x.slug !== slug);
  return (
    <>
      <PageHero eyebrow={`${t('حلول', 'Solutions')} · ${tt(s.name)}`} title={tt(s.headline)} subtitle={tt(s.intro)}>
        <div className="flex flex-col gap-3 sm:flex-row">
          <ButtonLink href="/demo" variant="accent" size="lg">{t('اطلب عرضاً لقطاعك', 'Book a sector demo')}<ArrowForward /></ButtonLink>
          <GlassLink href="/signup">{t('ابدأ تجربتك المجانية', 'Start free trial')}</GlassLink>
        </div>
      </PageHero>

      <section className="py-16 sm:py-20">
        <Container>
          <SectionHeading eyebrow={t('التحديات', 'The challenges')} title={t('نعرف ما يرهق فريقك', 'We know what wears your team down')} />
          <ul className="mt-10 grid gap-5 md:grid-cols-3">
            {s.pains.map((p) => (
              <li key={p.title[1]} className="rounded-2xl border border-line bg-white p-6 shadow-soft">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-danger-50 text-danger"><AlertTriangle className="h-5 w-5" aria-hidden /></span>
                <h3 className="mt-4 font-semibold text-ink">{tt(p.title)}</h3>
                <p className="mt-2 text-sm leading-7 text-ink-muted">{tt(p.body)}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section className="bg-white py-16 sm:py-20">
        <Container>
          <SectionHeading eyebrow={t('كيف يساعد طاقم', 'How Taqam helps')} title={t(`مصمم لإيقاع ${s.name[0]}`, `Tuned for ${s.name[1].toLowerCase()}`)} />
          <ul className="mt-10 grid gap-5 sm:grid-cols-2">
            {s.features.map((f, i) => (
              <li key={f.title[1]} className="group flex gap-4 rounded-2xl border border-line bg-sand/40 p-6 transition-colors hover:bg-white hover:shadow-soft">
                <span className="num flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-bold text-accent">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <h3 className="font-semibold text-ink">{tt(f.title)}</h3>
                  <p className="mt-1.5 text-sm leading-7 text-ink-muted">{tt(f.body)}</p>
                </div>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section className="py-16 sm:py-20">
        <Container>
          <div className="relative overflow-hidden rounded-[28px] bg-primary p-6 text-white shadow-lift sm:p-10 lg:p-12">
            <div aria-hidden className="taqam-pattern absolute inset-0 opacity-60" />
            <StarMotif className="pointer-events-none absolute -bottom-16 h-64 w-64 text-white/[0.06] ltr:-right-16 rtl:-left-16" />
            <div className="relative grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:items-center">
              <div>
                <span className="inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-accent ring-1 ring-white/15">
                  {t('قصة نموذجية', 'Sample story')}
                </span>
                <h2 className="mt-4 text-2xl font-bold sm:text-3xl">{tt(s.caseStudy.company)}</h2>
                <p className="mt-1 text-sm text-white/70">{tt(s.caseStudy.profile)}</p>
                <figure className="mt-6">
                  <Quote className="h-7 w-7 text-accent ltr:-scale-x-100" aria-hidden />
                  <blockquote className="mt-3 text-lg leading-9 sm:text-xl">«{tt(s.caseStudy.quote)}»</blockquote>
                  <figcaption className="mt-3 text-sm text-white/70">— {tt(s.caseStudy.person)}</figcaption>
                </figure>
              </div>
              <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                {s.caseStudy.stats.map((st) => (
                  <div key={st.label[1]} className="flex flex-col-reverse rounded-2xl bg-white/10 p-5 ring-1 ring-white/15">
                    <dt className="mt-1 text-sm text-white/75">{tt(st.label)}</dt>
                    <dd className="num text-3xl font-bold text-accent ltr:text-left rtl:text-right" dir="ltr">{st.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <p className="relative mt-6 text-xs text-white/55">{t('* مثال توضيحي لمنشأة افتراضية، والأرقام تقديرية.', '* Illustrative example of a fictional company; figures are estimates.')}</p>
          </div>
        </Container>
      </section>

      <section className="pb-4">
        <Container>
          <h2 className="text-lg font-semibold text-ink">{t('قطاعات أخرى', 'Other sectors')}</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {others.map((o) => (
              <li key={o.slug}>
                <Link href={`/solutions/${o.slug}`} className="group flex items-center gap-3 rounded-xl border border-line bg-white p-4 transition-all hover:border-primary-500/40 hover:shadow-soft">
                  <o.icon className="h-5 w-5 text-primary-500" aria-hidden />
                  <span className="flex-1 text-sm font-medium text-ink">{tt(o.name)}</span>
                  <ArrowForward className="h-3.5 w-3.5 text-ink-soft group-hover:text-primary" />
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-6 flex items-center gap-2 text-sm text-ink-muted">
            <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
            {t('كل الحلول تشمل الرواتب وحماية الأجور والإجازات وتطبيق الخدمة الذاتية.', 'Every solution includes payroll, WPS, leave and the self-service app.')}
          </p>
        </Container>
      </section>
      <CtaBand />
    </>
  );
}
