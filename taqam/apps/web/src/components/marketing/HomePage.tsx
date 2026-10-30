'use client';
import { NodeNetwork } from './NodeNetwork';
import clsx from 'clsx';
import Link from 'next/link';
import {
  BadgeCheck, Building2, CheckCircle2, MapPinned, Quote, Rocket, ShieldCheck, Sparkles, Upload, XCircle,
} from 'lucide-react';
import { ButtonLink } from '@/components/ui';
import { COMPLIANCE_CHIPS, COMPLIANCE_FOOTNOTE, HOME_FAQ, MODULES, SECTORS, TESTIMONIALS, TIERS } from './data';
import { ArrowForward, Container, SectionHeading, StarMotif, Yes, useT2 } from './primitives';
import { ProductMock } from './ProductMock';
import { PhoneMock } from './PhoneMock';
import { Faq } from './Faq';
import { CtaBand } from './CtaBand';

export function HomePage() {
  return (
    <>
      <Hero />
      <TrustStrip />
      <ProblemSolution />
      <FeatureGrid />
      <HowItWorks />
      <Sectors />
      <EssSection />
      <Proof />
      <PricingTeaser />
      <FaqSection />
      <CtaBand />
    </>
  );
}

function Hero() {
  const { t } = useT2();
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 h-[520px] w-[520px] rounded-full bg-accent/15 blur-3xl ltr:-right-40 rtl:-left-40" />
        <div className="absolute -bottom-40 h-[420px] w-[420px] rounded-full bg-primary-500/10 blur-3xl ltr:-left-32 rtl:-right-32" />
        <NodeNetwork className="absolute inset-0 h-full w-full opacity-70 [mask-image:linear-gradient(to_bottom,black,transparent_80%)]" />
      </div>
      <Container className="relative grid items-center gap-14 pb-20 pt-12 sm:pt-16 lg:grid-cols-[1.05fr_1fr] lg:gap-12 lg:pb-28 lg:pt-20">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-white/70 px-3 py-1 text-xs font-semibold text-primary shadow-soft sm:text-sm">
            <Sparkles className="h-4 w-4 text-accent-600" aria-hidden />
            {t('منصة شؤون لإدارة الموارد البشرية', 'Shuoon HR management platform')}
          </span>
          <h1 className="mt-6 text-balance text-4xl font-bold leading-[1.4] tracking-tight text-ink sm:text-5xl lg:text-[2.75rem] xl:text-[3.15rem]">
            <span className="whitespace-nowrap">{t('كل شؤون موظفيك،', 'All your people matters,')}</span>
            <br />
            <span className="relative inline-block text-primary">
              {t('في مكان واحد.', 'in one place.')}
              <svg aria-hidden viewBox="0 0 200 12" preserveAspectRatio="none" className="absolute -bottom-2 h-3 w-full text-accent ltr:left-0 rtl:right-0">
                <path d="M2 9 C 50 2, 150 2, 198 8" stroke="currentColor" strokeWidth="4" fill="none" strokeLinecap="round" />
              </svg>
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-ink-muted">
            {t('شؤون تجعل الفرع قلب نظام الموارد البشرية: حضور بالموقع داخل نطاق كل فرع، وورديات ومدير لكل فريق، ومسير رواتب وملف حماية أجور يُقفل في يوم واحد — مهما تعددت مدنك.',
              'Shuoon puts the branch at the heart of HR: geofenced attendance per branch, shifts and a manager for every team, and payroll with a WPS file closed in a single day — however many cities you operate in.')}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/signup" size="lg" className="shadow-lift">{t('ابدأ تجربتك المجانية', 'Start your free trial')}<ArrowForward /></ButtonLink>
            <ButtonLink href="/demo" size="lg" variant="secondary">{t('اطلب عرضاً تجريبياً', 'Book a demo')}</ButtonLink>
          </div>
          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-muted">
            {[t('14 يوماً مجاناً', '14 days free'), t('دون بطاقة ائتمانية', 'No credit card'), t('تشغيل خلال أسبوع', 'Live within a week')].map((x) => (
              <li key={x} className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-success" aria-hidden />{x}</li>
            ))}
          </ul>
        </div>
        <ProductMock className="mx-auto w-full max-w-xl lg:max-w-none" />
      </Container>
    </section>
  );
}

function TrustStrip() {
  const { t, tt } = useT2();
  return (
    <section aria-labelledby="trust-title" className="border-y border-line bg-white/60">
      <Container className="flex flex-col items-center gap-4 py-7 lg:flex-row lg:gap-8">
        <p id="trust-title" className="shrink-0 text-sm font-semibold text-ink-muted">
          <ShieldCheck className="me-1.5 inline h-4 w-4 text-primary-500" aria-hidden />
          {t('مبني للبيئة النظامية السعودية', 'Built for the Saudi regulatory context')}
        </p>
        <div className="flex flex-col items-center gap-2 lg:items-start">
          <ul className="flex flex-wrap justify-center gap-2 lg:justify-start">
            {COMPLIANCE_CHIPS.map((c) => (
              <li key={c[1]} className="rounded-full border border-line bg-white px-3.5 py-1.5 text-xs font-medium text-primary sm:text-sm">{tt(c)}</li>
            ))}
          </ul>
          <p className="text-center text-[11px] text-ink-soft lg:text-start">* {tt(COMPLIANCE_FOOTNOTE)}</p>
        </div>
      </Container>
    </section>
  );
}

function ProblemSolution() {
  const { t } = useT2();
  const before = [
    t('كشوف حضور ورقية من كل فرع تصل متأخرة وبأخطاء', 'Paper attendance sheets from each branch, late and error-prone'),
    t('مسير رواتب في جداول بيانات يستغرق أياماً', 'Spreadsheet payroll that takes days'),
    t('إقامات وعقود تنتهي دون تنبيه', 'Iqamas and contracts expiring without warning'),
    t('كل طلب إجازة يمر عبر الإدارة المركزية', 'Every leave request routed through head office'),
    t('نسبة سعودة لا تعرف أي فرع يؤثر فيها', 'A Saudization rate with no per-branch view'),
  ];
  const after = [
    t('بصمة بالجوال داخل نطاق الفرع، ولوحة حضور لحظية', 'Phone check-in inside the geofence, with a live board'),
    t('مسير آلي بالإضافي والغياب والسلف والتأمينات', 'Automatic payroll with overtime, absence, loans and GOSI'),
    t('تنبيهات قبل 90 و30 يوماً من انتهاء أي مستند', 'Alerts 90 and 30 days before any document expires'),
    t('مدير الفرع يعتمد طلبات فريقه مباشرة', 'Branch managers approve their own team’s requests'),
    t('سعودة لكل فرع مع محاكاة أثر التوظيف', 'Per-branch Saudization with hiring simulation'),
  ];
  return (
    <section className="py-20 sm:py-24">
      <Container>
        <SectionHeading center eyebrow={t('لماذا شؤون؟', 'Why Shuoon?')}
          title={t('أنظمة الموارد البشرية العامة صُممت للمكتب. فريقك في الميدان.', 'Generic HR tools were built for the office. Your team is in the field.')}
          subtitle={t('عندما تدير عشرات الفروع والورديات، تتحول التفاصيل الصغيرة إلى ساعات ضائعة وتكلفة خفية.', 'When you run dozens of branches and shifts, small details become lost hours and hidden cost.')} />
        <div className="mt-12 grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-line bg-white/70 p-6 sm:p-8">
            <p className="text-sm font-semibold text-danger">{t('قبل شؤون', 'Before Shuoon')}</p>
            <ul className="mt-5 space-y-4">
              {before.map((x) => (
                <li key={x} className="flex gap-3 text-ink-muted"><XCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger/70" aria-hidden />{x}</li>
              ))}
            </ul>
          </div>
          <div className="relative overflow-hidden rounded-2xl bg-night p-6 text-white shadow-lift sm:p-8">
            <StarMotif className="pointer-events-none absolute -bottom-10 h-48 w-48 text-white/[0.07] ltr:-right-10 rtl:-left-10" />
            <p className="text-sm font-semibold text-accent">{t('مع شؤون', 'With Shuoon')}</p>
            <ul className="relative mt-5 space-y-4">
              {after.map((x) => (
                <li key={x} className="flex gap-3 text-white/90"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />{x}</li>
              ))}
            </ul>
          </div>
        </div>
      </Container>
    </section>
  );
}

function FeatureGrid() {
  const { t, tt } = useT2();
  return (
    <section className="relative bg-white py-20 sm:py-24">
      <Container>
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <SectionHeading eyebrow={t('منصة واحدة', 'One platform')}
            title={t('كل ما تحتاجه لإدارة فريقك، من التعيين حتى المخالصة', 'Everything to run your team, from hire to final settlement')} />
          <Link href="/features" className="group inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-primary hover:text-primary-500">
            {t('استكشف كل المزايا', 'Explore all features')}<ArrowForward className="transition-transform group-hover:-translate-x-1 ltr:group-hover:translate-x-1" />
          </Link>
        </div>
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {MODULES.map((m) => (
            <li key={m.id}>
              <Link href={`/features#${m.id}`}
                className="group flex h-full flex-col rounded-2xl border border-line bg-sand/40 p-5 transition-all hover:-translate-y-0.5 hover:border-primary-500/40 hover:bg-white hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-night text-accent transition-transform group-hover:scale-105">
                  <m.icon className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="mt-4 font-semibold text-ink">{tt(m.name)}</h3>
                <p className="mt-1.5 text-sm leading-6 text-ink-muted">{tt(m.short)}</p>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

function HowItWorks() {
  const { t } = useT2();
  const steps = [
    { icon: Building2, title: t('أضف فروعك', 'Add your branches'), body: t('حدد موقع كل فرع على الخريطة ونطاق البصمة ومديره ووردياته.', 'Pin each branch on the map, set its check-in radius, manager and shifts.') },
    { icon: Upload, title: t('استورد فريقك', 'Import your team'), body: t('ارفع ملف الموظفين ورواتبهم ومستنداتهم مرة واحدة، أو أضفهم تدريجياً.', 'Upload employees, wages and documents once — or add them gradually.') },
    { icon: Rocket, title: t('شغّل وتابع', 'Go live'), body: t('يبصم الموظفون من جوالاتهم، وتُقفل الرواتب وملف حماية الأجور نهاية الشهر.', 'Staff check in from their phones; payroll and the WPS file close at month end.') },
  ];
  return (
    <section className="py-20 sm:py-24">
      <Container>
        <SectionHeading center eyebrow={t('كيف يعمل', 'How it works')} title={t('من التسجيل إلى أول مسير في ثلاث خطوات', 'From sign-up to first payroll in three steps')} />
        <ol className="relative mt-14 grid gap-6 md:grid-cols-3">
          <div aria-hidden className="absolute inset-x-[16%] top-8 hidden border-t-2 border-dashed border-accent/40 md:block" />
          {steps.map((s, i) => (
            <li key={s.title} className="relative rounded-2xl border border-line bg-white p-6 text-center shadow-soft">
              <span className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-white shadow-lift">
                <s.icon className="h-7 w-7 text-accent" aria-hidden />
                <span className="num absolute -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-accent text-sm font-bold text-night ltr:-right-2 rtl:-left-2">{i + 1}</span>
              </span>
              <h3 className="mt-5 text-lg font-semibold text-ink">{s.title}</h3>
              <p className="mt-2 text-sm leading-7 text-ink-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}

function Sectors() {
  const { t, tt } = useT2();
  return (
    <section className="bg-sand-200/60 py-20 sm:py-24">
      <Container>
        <SectionHeading eyebrow={t('حلول حسب القطاع', 'Built for your sector')}
          title={t('صُمم لمن يعمل فريقه خارج المكتب', 'Made for teams that work beyond the office')}
          subtitle={t('كل قطاع له إيقاعه. اختر قطاعك لترى كيف يتكيف شؤون معه.', 'Every sector has its own rhythm. Pick yours to see how Shuoon adapts.')} />
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {SECTORS.map((s, i) => (
            <li key={s.slug} className={clsx(i === 0 && 'sm:col-span-2 lg:col-span-1')}>
              <Link href={`/solutions/${s.slug}`}
                className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-white p-5 transition-all hover:-translate-y-1 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                <StarMotif className="pointer-events-none absolute -top-6 h-24 w-24 text-accent/0 transition-colors group-hover:text-accent/30 ltr:-right-6 rtl:-left-6" />
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-50 text-accent-600 transition-colors group-hover:bg-primary group-hover:text-accent">
                  <s.icon className="h-6 w-6" aria-hidden />
                </span>
                <h3 className="mt-4 font-semibold text-ink">{tt(s.name)}</h3>
                <p className="mt-1.5 flex-1 text-sm leading-6 text-ink-muted">{tt(s.tagline)}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                  {t('اكتشف الحل', 'See the solution')}<ArrowForward className="h-3.5 w-3.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

function EssSection() {
  const { t } = useT2();
  const points = [
    { icon: MapPinned, title: t('بصمة بالموقع', 'Geofenced check-in'), body: t('لا تُقبل البصمة إلا من داخل نطاق الفرع، مع تسجيل المسافة والوقت.', 'Check-ins only count inside the branch radius, with distance and time logged.') },
    { icon: BadgeCheck, title: t('طلبات بلا أوراق', 'Paperless requests'), body: t('إجازة، سلفة، تعريف بالراتب، أو تصحيح حضور — من الجوال في ثوانٍ.', 'Leave, loans, salary certificates or attendance fixes — from the phone in seconds.') },
    { icon: ShieldCheck, title: t('دون تحميل من المتجر', 'No app-store install'), body: t('يعمل من المتصفح على أي جوال، ويُضاف للشاشة الرئيسية كتطبيق.', 'Runs in any phone browser and can be added to the home screen.') },
  ];
  return (
    <section className="relative overflow-hidden bg-night py-20 text-white sm:py-24">
      <div aria-hidden className="taqam-pattern absolute inset-0 opacity-70" />
      <Container className="relative grid items-center gap-14 lg:grid-cols-2">
        <div>
          <SectionHeading light eyebrow={t('تطبيق الخدمة الذاتية', 'Self-service app')}
            title={t('مكتب الموارد البشرية… في جيب كل موظف', 'The HR office… in every employee’s pocket')}
            subtitle={t('الموظف الميداني لا يجلس أمام حاسوب. لذلك صممنا تجربته للجوال أولاً، وبالعربية أولاً.', 'Field staff don’t sit at a desk, so we designed their experience mobile-first and Arabic-first.')} />
          <ul className="mt-10 space-y-6">
            {points.map((p) => (
              <li key={p.title} className="flex gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-accent ring-1 ring-white/15"><p.icon className="h-5 w-5" aria-hidden /></span>
                <div>
                  <h3 className="font-semibold">{p.title}</h3>
                  <p className="mt-1 text-sm leading-7 text-white/70">{p.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative">
          <div aria-hidden className="absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/20 blur-3xl" />
          <PhoneMock className="relative" />
        </div>
      </Container>
    </section>
  );
}

function Proof() {
  const { t, tt } = useT2();
  const stats = [
    { v: '1 ' + t('يوم', 'day'), l: t('لإقفال مسير متعدد الفروع', 'to close multi-branch payroll') },
    { v: '−30%', l: t('في الإضافي غير المبرر', 'in unjustified overtime') },
    { v: '90', l: t('يوماً تنبيه مسبق للمستندات', 'days of advance document alerts') },
    { v: '100%', l: t('بصمات من داخل الفروع', 'of check-ins from inside branches') },
  ];
  return (
    <section className="py-20 sm:py-24">
      <Container>
        <SectionHeading center eyebrow={t('أثر ملموس', 'Real impact')} title={t('ما الذي يتغير عندما يصبح الفرع هو المحور؟', 'What changes when the branch becomes the centre?')} />
        <dl className="mt-12 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.l} className="rounded-2xl border border-line bg-white p-5 text-center shadow-soft">
              <dt className="sr-only">{s.l}</dt>
              <dd className="num text-3xl font-bold text-primary sm:text-4xl" dir="ltr">{s.v}</dd>
              <dd className="mt-2 text-sm leading-6 text-ink-muted">{s.l}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-center text-xs text-ink-soft">{t('* أرقام توضيحية مبنية على سيناريوهات تشغيل نموذجية.', '* Illustrative figures based on typical operating scenarios.')}</p>
        <ul className="mt-12 grid gap-5 md:grid-cols-3">
          {TESTIMONIALS.map((x) => (
            <li key={x.name[1]}>
              <figure className="flex h-full flex-col rounded-2xl border border-line bg-white p-6 shadow-soft">
                <Quote className="h-7 w-7 text-accent ltr:-scale-x-100" aria-hidden />
                <blockquote className="mt-4 flex-1 text-base leading-8 text-ink">«{tt(x.quote)}»</blockquote>
                <figcaption className="mt-6 flex items-center gap-3 border-t border-line pt-4">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 font-bold text-primary">{tt(x.name).replace(/^(م\.|Eng\.)\s*/, '').charAt(0)}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">{tt(x.name)}</span>
                    <span className="block text-xs text-ink-muted">{tt(x.role)} · {tt(x.company)}</span>
                  </span>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-center text-xs text-ink-soft">{t('* شهادات نموذجية لأغراض العرض، والأسماء والمنشآت افتراضية.', '* Sample testimonials for illustration; names and companies are fictional.')}</p>
      </Container>
    </section>
  );
}

function PricingTeaser() {
  const { t, tt } = useT2();
  return (
    <section className="bg-white py-20 sm:py-24">
      <Container>
        <SectionHeading center eyebrow={t('الأسعار', 'Pricing')} title={t('سعر واضح لكل موظف، دون رسوم خفية', 'Clear per-employee pricing, no hidden fees')}
          subtitle={t('ادفع حسب عدد موظفيك النشطين، ووفّر 15% مع الاشتراك السنوي.', 'Pay per active employee and save 15% with annual billing.')} />
        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {TIERS.map((tier) => (
            <div key={tier.id} className={clsx('relative flex flex-col rounded-2xl border p-6',
              tier.highlight ? 'border-night bg-night text-white shadow-lift' : 'border-line bg-sand/40')}>
              {tier.highlight && <span className="absolute -top-3 rounded-full bg-accent px-3 py-1 text-xs font-bold text-night ltr:right-6 rtl:left-6">{t('الأكثر اختياراً', 'Most popular')}</span>}
              <h3 className={clsx('text-lg font-semibold', tier.highlight ? 'text-white' : 'text-ink')}>{tt(tier.name)}</h3>
              <p className={clsx('mt-1 text-sm', tier.highlight ? 'text-white/70' : 'text-ink-muted')}>{tt(tier.desc)}</p>
              <p className="mt-5">
                {tier.price != null ? (
                  <>
                    <span className="num text-4xl font-bold">{tier.price}</span>
                    <span className={clsx('text-sm', tier.highlight ? 'text-white/70' : 'text-ink-muted')}> {t('ر.س / موظف / شهرياً', 'SAR / employee / mo')}</span>
                  </>
                ) : <span className="text-2xl font-bold">{t('تواصل معنا', 'Contact us')}</span>}
              </p>
              <ul className="mt-5 flex-1 space-y-2.5 text-sm">
                {tier.features.slice(0, 4).map((f) => (
                  <li key={f[1]} className="flex items-center gap-2"><Yes className={tier.highlight ? 'bg-white/15 text-accent' : ''} />{tt(f)}</li>
                ))}
              </ul>
              <ButtonLink href={tier.cta.href} variant={tier.highlight ? 'accent' : 'secondary'} className="mt-6 w-full">{tt(tier.cta.label)}</ButtonLink>
            </div>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link href="/pricing" className="group inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary-500">
            {t('قارن الباقات بالتفصيل', 'Compare plans in detail')}<ArrowForward />
          </Link>
        </div>
      </Container>
    </section>
  );
}

function FaqSection() {
  const { t } = useT2();
  return (
    <section className="py-20 sm:py-24">
      <Container className="grid gap-10 lg:grid-cols-[1fr_1.6fr]">
        <div>
          <SectionHeading eyebrow={t('أسئلة شائعة', 'FAQ')} title={t('أسئلة يطرحها أصحاب المنشآت قبل البدء', 'What business owners ask before starting')} />
          <p className="mt-4 text-sm leading-7 text-ink-muted">
            {t('لم تجد إجابتك؟', 'Didn’t find your answer?')}{' '}
            <Link href="/demo" className="font-semibold text-primary underline decoration-accent decoration-2 underline-offset-4">{t('تحدث مع فريقنا', 'Talk to our team')}</Link>
          </p>
        </div>
        <Faq items={HOME_FAQ} />
      </Container>
    </section>
  );
}
