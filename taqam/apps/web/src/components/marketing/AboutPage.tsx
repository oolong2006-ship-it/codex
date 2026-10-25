'use client';
import { Compass, HeartHandshake, Languages, MapPinned, ServerCog, ShieldCheck } from 'lucide-react';
import { Container, PageHero, SectionHeading, StarMotif, useT2 } from './primitives';
import { CtaBand } from './CtaBand';

export function AboutPage() {
  const { t } = useT2();
  const values = [
    { icon: MapPinned, h: t('الفرع أولاً', 'Branch first'), b: t('نبني كل ميزة من منظور مدير الفرع والموظف الميداني، لا من منظور المكتب فقط.', 'We design every feature from the view of the branch manager and the field employee, not just head office.') },
    { icon: Languages, h: t('العربية أولاً', 'Arabic first'), b: t('واجهة ومحتوى ودعم بالعربية، مع دعم كامل للإنجليزية لفرق العمل المتنوعة.', 'Interface, content and support in Arabic, with full English for diverse teams.') },
    { icon: Compass, h: t('الامتثال بلا تعقيد', 'Compliance without complexity'), b: t('نترجم نظام العمل ومتطلبات حماية الأجور والتأمينات إلى خطوات واضحة.', 'We turn labor law, WPS and GOSI requirements into clear steps.') },
    { icon: HeartHandshake, h: t('شراكة طويلة', 'Long-term partnership'), b: t('نقيس نجاحنا بعدد المسيرات التي تُقفل في وقتها، لا بعدد المزايا.', 'We measure success by payrolls closed on time, not by feature count.') },
  ];
  return (
    <>
      <PageHero eyebrow={t('عن شؤون', 'About Shuoon')}
        title={t('بنينا شؤون لأن الفريق الميداني يستحق أدوات أفضل', 'We built Shuoon because field teams deserve better tools')}
        subtitle={t('شؤون شركة سعودية ناشئة تعمل من الرياض، هدفها أن تجعل إدارة الموارد البشرية للمنشآت متعددة الفروع بسيطة ودقيقة ومتوافقة.',
          'Shuoon is a Saudi startup based in Riyadh, on a mission to make HR for multi-branch businesses simple, accurate and compliant.')} />

      <section className="py-16 sm:py-20">
        <Container className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <SectionHeading eyebrow={t('قصتنا', 'Our story')} title={t('من كشف حضور ورقي… إلى منصة', 'From a paper timesheet… to a platform')} />
            <div className="mt-6 space-y-4 text-base leading-8 text-ink-muted">
              <p>{t('بدأت الفكرة من مشهد متكرر: مدير موارد بشرية لسلسلة مطاعم يجمع كشوف الحضور من عشرين فرعاً عبر رسائل وصور، ثم يقضي أسبوعاً في مطابقتها قبل إقفال الرواتب.',
                'It started with a familiar scene: an HR manager at a restaurant chain collecting timesheets from twenty branches via messages and photos, then spending a week reconciling them before payroll.')}</p>
              <p>{t('الأنظمة المتاحة كانت تعامل الفرع كحقل نصي في ملف الموظف. نحن قررنا أن يكون الفرع هو نقطة البداية: نطاقه الجغرافي، ووردياته، ومديره، وتكلفته، ونسبة سعودته.',
                'Available systems treated the branch as a text field on an employee file. We decided the branch should be the starting point: its geofence, shifts, manager, cost and Saudization.')}</p>
              <p>{t('اليوم، يجمع شؤون الحضور والإجازات والطلبات والرواتب ونهاية الخدمة في منصة واحدة، مع تطبيق خدمة ذاتية يعمل على أي جوال.',
                'Today Shuoon brings attendance, leave, requests, payroll and end of service into one platform, with a self-service app that runs on any phone.')}</p>
            </div>
          </div>
          <div className="relative overflow-hidden rounded-[28px] bg-night p-8 text-white shadow-lift sm:p-10">
            <div aria-hidden className="taqam-pattern absolute inset-0 opacity-60" />
            <StarMotif className="pointer-events-none absolute -top-10 h-48 w-48 text-accent/30 ltr:-right-10 rtl:-left-10" />
            <p className="relative text-sm font-semibold text-accent">{t('رسالتنا', 'Our mission')}</p>
            <p className="relative mt-3 text-2xl font-bold leading-relaxed sm:text-3xl">
              {t('أن يشعر كل موظف في كل فرع أنه جزء من فريق واحد — يُحتسب وقته بدقة، ويصله راتبه في موعده، ويجد حقوقه واضحة.',
                'That every employee in every branch feels part of one team — their time counted accurately, their pay on time, their rights clear.')}
            </p>
          </div>
        </Container>
      </section>

      <section className="bg-white py-16 sm:py-20">
        <Container>
          <SectionHeading center eyebrow={t('قيمنا', 'Our values')} title={t('ما نؤمن به', 'What we believe')} />
          <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {values.map((v) => (
              <li key={v.h} className="rounded-2xl border border-line bg-sand/40 p-6">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-night text-accent"><v.icon className="h-5 w-5" aria-hidden /></span>
                <h3 className="mt-4 font-semibold text-ink">{v.h}</h3>
                <p className="mt-2 text-sm leading-7 text-ink-muted">{v.b}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section className="py-16 sm:py-20">
        <Container>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="rounded-2xl border border-line bg-white p-6 sm:p-8">
              <ShieldCheck className="h-8 w-8 text-primary-500" aria-hidden />
              <h2 className="mt-4 text-xl font-bold text-ink">{t('خصوصية بياناتك التزام', 'Your data privacy is a commitment')}</h2>
              <p className="mt-2 text-sm leading-7 text-ink-muted">{t('نتعامل مع بيانات موظفيك وفق نظام حماية البيانات الشخصية ولوائحه التنفيذية، ونطبق مبدأ أقل صلاحية: مدير الفرع يرى فريقه فقط.',
                'We handle your employees’ data in line with the Personal Data Protection Law (PDPL) and its regulations, applying least privilege: branch managers see only their team.')}</p>
            </div>
            <div className="rounded-2xl border border-line bg-white p-6 sm:p-8">
              <ServerCog className="h-8 w-8 text-primary-500" aria-hidden />
              <h2 className="mt-4 text-xl font-bold text-ink">{t('استضافة داخل المملكة', 'Hosted in Saudi Arabia')}</h2>
              <p className="mt-2 text-sm leading-7 text-ink-muted">{t('نلتزم باستضافة بيانات عملائنا في مراكز بيانات داخل المملكة العربية السعودية، مع تشفير أثناء النقل والتخزين ونسخ احتياطية منتظمة.',
                'We are committed to hosting customer data in data centres inside Saudi Arabia, with encryption in transit and at rest and regular backups.')}</p>
            </div>
          </div>
        </Container>
      </section>
      <CtaBand />
    </>
  );
}
