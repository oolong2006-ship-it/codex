'use client';
import clsx from 'clsx';
import { CheckCircle2 } from 'lucide-react';
import { ButtonLink } from '@/components/ui';
import { MODULES, type T2 } from './data';
import { ArrowForward, Container, PageHero, StarMotif, useT2 } from './primitives';
import { CtaBand } from './CtaBand';

type Tone = 'ok' | 'warn' | 'bad' | 'info';
const SAMPLES: Record<string, { title: T2; rows: { label: T2; value: T2; tone: Tone }[] }> = {
  branches: { title: ['الفروع', 'Branches'], rows: [
    { label: ['فرع العليا — الرياض', 'Olaya — Riyadh'], value: ['نطاق 150م', '150m radius'], tone: 'info' },
    { label: ['فرع التحلية — جدة', 'Tahlia — Jeddah'], value: ['نطاق 200م', '200m radius'], tone: 'info' },
    { label: ['مستودع السلي', 'Sulay warehouse'], value: ['نطاق 400م', '400m radius'], tone: 'info' },
  ] },
  employees: { title: ['مستندات تنتهي قريباً', 'Expiring documents'], rows: [
    { label: ['إقامة — محمد إقبال', 'Iqama — M. Iqbal'], value: ['خلال 12 يوماً', 'in 12 days'], tone: 'bad' },
    { label: ['جواز — جون كروز', 'Passport — J. Cruz'], value: ['خلال 45 يوماً', 'in 45 days'], tone: 'warn' },
    { label: ['عقد — ريم الحربي', 'Contract — Reem H.'], value: ['ساري', 'Valid'], tone: 'ok' },
  ] },
  attendance: { title: ['وردية اليوم — فرع العليا', 'Today — Olaya'], rows: [
    { label: ['أحمد سالم', 'Ahmed Salem'], value: ['حاضر 07:58', 'Present 07:58'], tone: 'ok' },
    { label: ['ليلى منصور', 'Layla Mansour'], value: ['متأخرة 14 د', 'Late 14m'], tone: 'warn' },
    { label: ['راجيش كومار', 'Rajesh Kumar'], value: ['إضافي 1:30', 'OT 1:30'], tone: 'info' },
  ] },
  leave: { title: ['أرصدة الإجازات', 'Leave balances'], rows: [
    { label: ['سنوية', 'Annual'], value: ['18 / 21 يوماً', '18 / 21 days'], tone: 'ok' },
    { label: ['مرضية', 'Sick'], value: ['3 أيام مستخدمة', '3 days used'], tone: 'info' },
    { label: ['طلب: إجازة زواج', 'Request: marriage'], value: ['قيد الاعتماد', 'Pending'], tone: 'warn' },
  ] },
  requests: { title: ['طلبات معلقة', 'Pending requests'], rows: [
    { label: ['تعريف بالراتب', 'Salary certificate'], value: ['جاهز للتحميل', 'Ready'], tone: 'ok' },
    { label: ['سلفة 3,000 ر.س', 'Loan 3,000 SAR'], value: ['6 أقساط', '6 instalments'], tone: 'info' },
    { label: ['مطالبة وقود', 'Fuel claim'], value: ['قيد الاعتماد', 'Pending'], tone: 'warn' },
  ] },
  payroll: { title: ['مسير سبتمبر 2026', 'Sep 2026 payroll'], rows: [
    { label: ['إجمالي الاستحقاقات', 'Gross earnings'], value: ['412,850 ر.س', 'SAR 412,850'], tone: 'info' },
    { label: ['التأمينات (حصة المنشأة)', 'GOSI (employer)'], value: ['18,920 ر.س', 'SAR 18,920'], tone: 'info' },
    { label: ['ملف حماية الأجور', 'WPS file'], value: ['تم التصدير', 'Exported'], tone: 'ok' },
  ] },
  eosb: { title: ['مخالصة نهائية', 'Final settlement'], rows: [
    { label: ['مدة الخدمة', 'Service'], value: ['6 سنوات و4 أشهر', '6y 4m'], tone: 'info' },
    { label: ['المكافأة (استقالة ⅔)', 'Award (resignation ⅔)'], value: ['21,340 ر.س', 'SAR 21,340'], tone: 'ok' },
    { label: ['رصيد إجازات 9 أيام', '9 leave days'], value: ['2,700 ر.س', 'SAR 2,700'], tone: 'ok' },
  ] },
  saudization: { title: ['السعودة حسب الفرع', 'Saudization by branch'], rows: [
    { label: ['فرع العليا', 'Olaya'], value: ['41% — بلاتيني', '41% — Platinum'], tone: 'ok' },
    { label: ['فرع التحلية', 'Tahlia'], value: ['28% — أخضر متوسط', '28% — Mid green'], tone: 'info' },
    { label: ['فرع النخيل', 'Nakheel'], value: ['17% — أخضر منخفض', '17% — Low green'], tone: 'warn' },
  ] },
  performance: { title: ['دورة تقييم الربع الثالث', 'Q3 review cycle'], rows: [
    { label: ['تقييمات مكتملة', 'Completed reviews'], value: ['84%', '84%'], tone: 'ok' },
    { label: ['متوسط الدرجات', 'Average score'], value: ['4.1 / 5', '4.1 / 5'], tone: 'info' },
    { label: ['تقييمات متأخرة', 'Overdue'], value: ['7', '7'], tone: 'warn' },
  ] },
  recruitment: { title: ['كاشير — فرع الكورنيش', 'Cashier — Corniche'], rows: [
    { label: ['متقدمون', 'Applied'], value: ['24', '24'], tone: 'info' },
    { label: ['مقابلات', 'Interviews'], value: ['5', '5'], tone: 'warn' },
    { label: ['تم التعيين', 'Hired'], value: ['1', '1'], tone: 'ok' },
  ] },
  reports: { title: ['ملخص الشهر', 'Month summary'], rows: [
    { label: ['عدد الموظفين', 'Headcount'], value: ['312', '312'], tone: 'info' },
    { label: ['نسبة الحضور', 'Attendance rate'], value: ['96.4%', '96.4%'], tone: 'ok' },
    { label: ['ساعات الإضافي', 'Overtime hours'], value: ['−12% عن الشهر الماضي', '−12% vs last month'], tone: 'ok' },
  ] },
  ess: { title: ['جوال الموظف', 'Employee phone'], rows: [
    { label: ['تسجيل الحضور', 'Check-in'], value: ['داخل النطاق', 'Inside geofence'], tone: 'ok' },
    { label: ['قسيمة سبتمبر', 'Sep payslip'], value: ['متاحة', 'Available'], tone: 'info' },
    { label: ['طلب إجازة', 'Leave request'], value: ['معتمد', 'Approved'], tone: 'ok' },
  ] },
};
const toneCls: Record<Tone, string> = {
  ok: 'bg-success-50 text-success', warn: 'bg-warning-50 text-[#9a7400]', bad: 'bg-danger-50 text-danger', info: 'bg-info-50 text-info',
};

export function FeaturesPage() {
  const { t, tt } = useT2();
  return (
    <>
      <PageHero eyebrow={t('المزايا', 'Features')}
        title={t('اثنتا عشرة وحدة، ومحور واحد: الفرع', 'Twelve modules, one centre: the branch')}
        subtitle={t('من البصمة الأولى صباحاً حتى ملف حماية الأجور نهاية الشهر، كل وحدة في طاقم تعرف إلى أي فرع ينتمي الموظف ومن يعتمد طلبه.',
          'From the first morning check-in to the month-end WPS file, every Taqam module knows which branch an employee belongs to and who approves their requests.')}>
        <div className="flex flex-col gap-3 sm:flex-row">
          <ButtonLink href="/signup" variant="accent" size="lg">{t('ابدأ تجربتك المجانية', 'Start free trial')}<ArrowForward /></ButtonLink>
        </div>
      </PageHero>

      {/* module index */}
      <nav aria-label={t('الوحدات', 'Modules')} className="sticky top-16 z-30 border-b border-line bg-sand/90 backdrop-blur">
        <Container className="flex gap-2 overflow-x-auto py-3 [scrollbar-width:none]">
          {MODULES.map((m) => (
            <a key={m.id} href={`#${m.id}`} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-primary-500 hover:text-primary sm:text-sm">
              <m.icon className="h-3.5 w-3.5" aria-hidden />{tt(m.name)}
            </a>
          ))}
        </Container>
      </nav>

      <div className="py-8">
        {MODULES.map((m, i) => {
          const sample = SAMPLES[m.id];
          return (
            <section key={m.id} id={m.id} aria-labelledby={`${m.id}-h`} className="scroll-mt-32 py-12 sm:py-16">
              <Container className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
                <div className={clsx(i % 2 === 1 && 'lg:order-2')}>
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-accent shadow-soft"><m.icon className="h-6 w-6" aria-hidden /></span>
                  <h2 id={`${m.id}-h`} className="mt-5 text-2xl font-bold text-ink sm:text-3xl">{tt(m.name)}</h2>
                  <p className="mt-4 text-base leading-8 text-ink-muted">{tt(m.long)}</p>
                  <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                    {m.points.map((p) => (
                      <li key={p[1]} className="flex gap-2 text-sm text-ink"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />{tt(p)}</li>
                    ))}
                  </ul>
                </div>
                {sample && (
                  <div className="relative" aria-hidden>
                    <div className="absolute inset-0 -rotate-2 rounded-2xl bg-primary/90">
                      <div className="taqam-pattern h-full w-full rounded-2xl" />
                    </div>
                    <div className="relative rounded-2xl border border-line bg-white p-5 shadow-lift sm:p-6">
                      <div className="mb-4 flex items-center justify-between">
                        <p className="text-sm font-semibold text-ink">{tt(sample.title)}</p>
                        <StarMotif className="h-6 w-6 text-accent" />
                      </div>
                      <ul className="space-y-2.5">
                        {sample.rows.map((r) => (
                          <li key={r.label[1]} className="flex items-center justify-between gap-3 rounded-xl bg-sand/70 px-4 py-3">
                            <span className="text-sm text-ink">{tt(r.label)}</span>
                            <span className={clsx('num shrink-0 rounded-full px-2.5 py-1 text-xs font-medium', toneCls[r.tone])}>{tt(r.value)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </Container>
            </section>
          );
        })}
      </div>
      <CtaBand />
    </>
  );
}
