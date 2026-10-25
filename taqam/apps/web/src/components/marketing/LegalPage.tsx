'use client';
import Link from 'next/link';
import { Container, PageHero, useT2 } from './primitives';
import type { T2 } from './data';

export interface LegalSection { id: string; title: T2; body: T2[] }

export function LegalPage({ title, intro, updated, sections }: { title: T2; intro: T2; updated: string; sections: LegalSection[] }) {
  const { tt, t } = useT2();
  return (
    <>
      <PageHero eyebrow={t('قانوني', 'Legal')} title={tt(title)} subtitle={tt(intro)} />
      <section className="py-14 sm:py-16">
        <Container className="grid gap-10 lg:grid-cols-[240px_1fr]">
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <p className="text-xs font-semibold text-ink-soft">{t('المحتويات', 'Contents')}</p>
            <ol className="mt-3 space-y-1 border-line text-sm ltr:border-l rtl:border-r">
              {sections.map((s, i) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="-mx-px block px-4 py-1.5 text-ink-muted transition-colors hover:text-primary ltr:border-l-2 rtl:border-r-2 border-transparent hover:border-accent">
                    <span className="num">{i + 1}.</span> {tt(s.title)}
                  </a>
                </li>
              ))}
            </ol>
          </aside>
          <article className="rounded-2xl border border-line bg-white p-6 shadow-soft sm:p-10">
            <p className="text-xs text-ink-soft">{t('آخر تحديث', 'Last updated')}: <span className="num">{updated}</span></p>
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} className="scroll-mt-24 pt-8 first-of-type:pt-6">
                <h2 className="text-xl font-bold text-ink"><span className="num text-accent-600">{i + 1}.</span> {tt(s.title)}</h2>
                <div className="mt-3 space-y-3 text-base leading-8 text-ink-muted">
                  {s.body.map((p, j) => <p key={j}>{tt(p)}</p>)}
                </div>
              </section>
            ))}
            <div className="mt-10 rounded-xl bg-sand p-5 text-sm leading-7 text-ink-muted">
              {t('لأي استفسار يتعلق بهذه الوثيقة تواصل معنا عبر', 'For any questions about this document, contact us at')}{' '}
              <a href="mailto:privacy@shuoon.sa" className="font-semibold text-primary underline decoration-accent underline-offset-4" dir="ltr">privacy@shuoon.sa</a>
              {' '}{t('أو من خلال', 'or via')}{' '}
              <Link href="/demo" className="font-semibold text-primary underline decoration-accent underline-offset-4">{t('نموذج التواصل', 'the contact form')}</Link>.
            </div>
          </article>
        </Container>
      </section>
    </>
  );
}
