'use client';
import { useState } from 'react';
import { CalendarCheck, CheckCircle2, Clock3, Headphones, Route, ShieldCheck } from 'lucide-react';
import { Button, ButtonLink, Input, Select, Textarea, useToast } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { SECTOR } from '@/lib/labels';
import { Container, StarMotif, useT2 } from './primitives';

interface Form { name: string; company: string; email: string; phone: string; employeesCount: string; sector: string; message: string }
const EMPTY: Form = { name: '', company: '', email: '', phone: '', employeesCount: '', sector: '', message: '' };
type Errors = Partial<Record<keyof Form, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Saudi mobile: 05XXXXXXXX, 5XXXXXXXX, +9665XXXXXXXX, 009665XXXXXXXX
const PHONE_RE = /^(?:\+?966|00966|0)?5\d{8}$/;

export function DemoPage() {
  const { t, lang } = useT2();
  const toast = useToast();
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined }));
  };

  const validate = (): Errors => {
    const e: Errors = {};
    if (form.name.trim().length < 2) e.name = t('يرجى إدخال الاسم', 'Please enter your name');
    if (form.company.trim().length < 2) e.company = t('يرجى إدخال اسم المنشأة', 'Please enter your company name');
    if (!EMAIL_RE.test(form.email.trim())) e.email = t('البريد الإلكتروني غير صحيح', 'Invalid email address');
    if (!PHONE_RE.test(form.phone.replace(/[\s-]/g, ''))) e.phone = t('رقم جوال سعودي غير صحيح (مثال: 0551234567)', 'Invalid Saudi mobile (e.g. 0551234567)');
    if (form.employeesCount) {
      const n = Number(form.employeesCount);
      if (!Number.isInteger(n) || n < 1 || n > 100000) e.employeesCount = t('أدخل عدداً صحيحاً', 'Enter a valid number');
    }
    if (form.message.length > 1000) e.message = t('الرسالة طويلة جداً', 'Message is too long');
    return e;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      const first = Object.keys(e)[0];
      document.getElementById(`lead-${first}`)?.focus();
      return;
    }
    setLoading(true);
    try {
      await api.post<{ id: string }>('/public/leads', {
        name: form.name.trim(),
        company: form.company.trim(),
        email: form.email.trim(),
        phone: form.phone.replace(/[\s-]/g, ''),
        employeesCount: form.employeesCount ? Number(form.employeesCount) : undefined,
        sector: form.sector || undefined,
        message: form.message.trim() || undefined,
      });
      setDone(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        toast(lang === 'ar' ? err.display : err.message, 'error');
      } else {
        toast(t('تعذّر إرسال طلبك الآن بسبب مشكلة في الاتصال. حاول مجدداً بعد قليل أو راسلنا على hello@taqam.sa',
          'We couldn’t send your request due to a connection issue. Please try again shortly or email hello@taqam.sa'), 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const perks = [
    { icon: Clock3, title: t('30 دقيقة فقط', 'Just 30 minutes'), body: t('جولة مركزة على ما يهم منشأتك، دون عرض عام.', 'A focused tour of what matters to you, not a generic pitch.') },
    { icon: Route, title: t('سيناريو قطاعك', 'Your sector’s scenario'), body: t('نعرض طاقم على فروع وورديات تشبه واقعك.', 'We show Taqam on branches and shifts like yours.') },
    { icon: CalendarCheck, title: t('خطة تشغيل واضحة', 'A clear rollout plan'), body: t('تخرج بخطة لنقل بياناتك وتشغيل أول مسير.', 'Leave with a plan to migrate data and run your first payroll.') },
    { icon: Headphones, title: t('فريق يتحدث لغتك', 'A team that speaks your language'), body: t('مختصون في نظام العمل السعودي والرواتب.', 'Specialists in Saudi labor law and payroll.') },
  ];

  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="absolute inset-x-0 top-0 h-[460px] bg-primary">
        <div className="taqam-pattern h-full w-full opacity-60" />
      </div>
      <StarMotif className="pointer-events-none absolute top-10 h-72 w-72 text-white/[0.06] ltr:-right-20 rtl:-left-20" />
      <Container className="relative grid gap-10 py-14 sm:py-20 lg:grid-cols-[1fr_1.15fr] lg:gap-14">
        <div className="text-white">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-accent">
            <span aria-hidden className="inline-block h-1.5 w-1.5 rotate-45 bg-accent" />{t('عرض تجريبي مخصص', 'Personalised demo')}
          </span>
          <h1 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl">{t('شاهد فروعك تعمل كفريق واحد', 'See your branches work as one team')}</h1>
          <p className="mt-4 text-base leading-8 text-white/75 sm:text-lg">
            {t('احجز جلسة مع مختص من طاقم، وسنريك كيف تُدار الورديات والحضور والرواتب لمنشأة بحجمك.', 'Book a session with a Taqam specialist and we’ll show you how shifts, attendance and payroll run for a business your size.')}
          </p>
          <ul className="mt-10 grid gap-3 sm:grid-cols-2">
            {perks.map((p) => (
              <li key={p.title} className="flex gap-4 rounded-2xl border border-line bg-white p-4 text-ink shadow-soft">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary"><p.icon className="h-5 w-5" aria-hidden /></span>
                <div>
                  <h2 className="font-semibold">{p.title}</h2>
                  <p className="mt-1 text-sm leading-6 text-ink-muted">{p.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="lg:pt-4">
          <div className="rounded-[24px] border border-line bg-white p-6 shadow-lift sm:p-8">
            {done ? (
              <div className="py-10 text-center" role="status" aria-live="polite">
                <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success-50 text-success"><CheckCircle2 className="h-8 w-8" aria-hidden /></span>
                <h2 className="mt-5 text-2xl font-bold text-ink">{t('وصلنا طلبك، شكراً لك!', 'Request received — thank you!')}</h2>
                <p className="mx-auto mt-3 max-w-sm text-sm leading-7 text-ink-muted">
                  {t(`سيتواصل معك أحد مختصينا خلال يوم عمل واحد على ${form.email} لتحديد موعد يناسبك.`, `A specialist will contact you within one business day at ${form.email} to schedule a time.`)}
                </p>
                <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                  <ButtonLink href="/tools/end-of-service" variant="secondary">{t('جرّب حاسبة نهاية الخدمة', 'Try the EOSB calculator')}</ButtonLink>
                  <ButtonLink href="/">{t('العودة للرئيسية', 'Back to home')}</ButtonLink>
                </div>
              </div>
            ) : (
              <form noValidate onSubmit={submit} aria-labelledby="demo-form-title">
                <h2 id="demo-form-title" className="text-xl font-bold text-ink">{t('اطلب عرضك التجريبي', 'Request your demo')}</h2>
                <p className="mt-1 text-sm text-ink-muted">{t('املأ البيانات وسنتواصل معك خلال يوم عمل.', 'Fill in your details and we’ll reach out within a business day.')}</p>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <LField id="name" label={t('الاسم الكامل', 'Full name')} required error={errors.name}>
                    <Input id="lead-name" autoComplete="name" value={form.name} onChange={set('name')} aria-invalid={!!errors.name} aria-describedby={errors.name ? 'lead-name-err' : undefined} />
                  </LField>
                  <LField id="company" label={t('اسم المنشأة', 'Company')} required error={errors.company}>
                    <Input id="lead-company" autoComplete="organization" value={form.company} onChange={set('company')} aria-invalid={!!errors.company} />
                  </LField>
                  <LField id="email" label={t('البريد الإلكتروني للعمل', 'Work email')} required error={errors.email}>
                    <Input id="lead-email" type="email" dir="ltr" autoComplete="email" placeholder="name@company.sa" value={form.email} onChange={set('email')} aria-invalid={!!errors.email} className="text-start" />
                  </LField>
                  <LField id="phone" label={t('رقم الجوال', 'Mobile number')} required error={errors.phone}>
                    <Input id="lead-phone" type="tel" dir="ltr" inputMode="tel" autoComplete="tel" placeholder="05X XXX XXXX" value={form.phone} onChange={set('phone')} aria-invalid={!!errors.phone} className="text-start" />
                  </LField>
                  <LField id="employeesCount" label={t('عدد الموظفين', 'Number of employees')} error={errors.employeesCount}>
                    <Input id="lead-employeesCount" type="number" min={1} inputMode="numeric" placeholder={t('مثال: 120', 'e.g. 120')} value={form.employeesCount} onChange={set('employeesCount')} aria-invalid={!!errors.employeesCount} />
                  </LField>
                  <LField id="sector" label={t('القطاع', 'Sector')}>
                    <Select id="lead-sector" value={form.sector} onChange={set('sector')} placeholder={t('اختر القطاع', 'Select sector')}
                      options={Object.entries(SECTOR).map(([value, [ar, en]]) => ({ value, label: lang === 'ar' ? ar : en }))} />
                  </LField>
                  <LField id="message" label={t('ما أكبر تحدٍّ تواجهه اليوم؟ (اختياري)', 'What’s your biggest challenge today? (optional)')} error={errors.message} className="sm:col-span-2">
                    <Textarea id="lead-message" rows={3} value={form.message} onChange={set('message')} maxLength={1000}
                      placeholder={t('مثال: نحتاج ضبط الحضور في 8 فروع وإقفال الرواتب أسرع', 'e.g. We need to control attendance across 8 branches and close payroll faster')} />
                  </LField>
                </div>
                <Button type="submit" size="lg" loading={loading} className="mt-6 w-full">{t('أرسل الطلب', 'Send request')}</Button>
                <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-ink-soft">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary-500" aria-hidden />
                  {t('نستخدم بياناتك للتواصل معك بخصوص العرض فقط، وفق سياسة الخصوصية ونظام حماية البيانات الشخصية.', 'We use your details only to contact you about the demo, per our privacy policy and the PDPL.')}
                </p>
              </form>
            )}
          </div>
        </div>
      </Container>
    </section>
  );
}

/** Field wrapper whose label is linked to the control via htmlFor. */
function LField({ id, label, required, error, className, children }:
  { id: string; label: string; required?: boolean; error?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label htmlFor={`lead-${id}`} className="field-label">{label}{required && <span className="text-danger" aria-hidden> *</span>}</label>
      {children}
      {error && <p id={`lead-${id}-err`} className="mt-1 text-xs text-danger" role="alert">{error}</p>}
    </div>
  );
}
