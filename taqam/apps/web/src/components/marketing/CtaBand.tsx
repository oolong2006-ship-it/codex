'use client';
import { ButtonLink } from '@/components/ui';
import { ArrowForward, Container, GlassLink, StarMotif, useT2 } from './primitives';

export function CtaBand({ title, subtitle }: { title?: string; subtitle?: string }) {
  const { t } = useT2();
  return (
    <section className="py-16 sm:py-20">
      <Container>
        <div className="relative overflow-hidden rounded-[28px] bg-primary px-6 py-12 text-center text-white shadow-lift sm:px-12 sm:py-16">
          <div aria-hidden className="taqam-pattern absolute inset-0" />
          <StarMotif className="pointer-events-none absolute -top-20 h-64 w-64 text-accent/20 ltr:-left-20 rtl:-right-20" />
          <StarMotif className="pointer-events-none absolute -bottom-24 h-72 w-72 text-white/[0.07] ltr:-right-16 rtl:-left-16" />
          <div className="relative mx-auto max-w-2xl">
            <h2 className="text-balance text-2xl font-bold leading-tight sm:text-4xl">
              {title ?? t('جاهز تجمع كل فروعك في فريق واحد؟', 'Ready to bring every branch into one team?')}
            </h2>
            <p className="mt-4 text-base leading-8 text-white/75 sm:text-lg">
              {subtitle ?? t('ابدأ تجربة مجانية لمدة 14 يوماً دون بطاقة ائتمانية، أو دع فريقنا يريك طاقم على بيانات تشبه منشأتك.',
                'Start a 14-day free trial with no credit card, or let our team show you Taqam on data like yours.')}
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <ButtonLink href="/signup" variant="accent" size="lg">{t('ابدأ تجربتك المجانية', 'Start your free trial')}<ArrowForward /></ButtonLink>
              <GlassLink href="/demo">{t('اطلب عرضاً تجريبياً', 'Book a demo')}</GlassLink>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
