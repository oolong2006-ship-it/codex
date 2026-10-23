'use client';
import clsx from 'clsx';
import { CalendarDays, Fingerprint, MapPin, Receipt, Wallet } from 'lucide-react';
import { useT2 } from './primitives';

export function PhoneMock({ className }: { className?: string }) {
  const { t } = useT2();
  return (
    <div className={clsx('relative mx-auto w-[270px] sm:w-[290px]', className)} role="img" aria-label={t('معاينة توضيحية لتطبيق الخدمة الذاتية', 'Illustrative preview of the self-service app')}>
      <div className="rounded-[44px] bg-[#0B2E2F] p-2.5 shadow-lift ring-1 ring-black/10">
        <div className="relative overflow-hidden rounded-[36px] bg-sand">
          <div className="absolute left-1/2 top-2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-[#0B2E2F]" />
          {/* header */}
          <div className="bg-primary px-5 pb-6 pt-10 text-white">
            <p className="text-[11px] text-white/70">{t('صباح الخير', 'Good morning')}</p>
            <p className="text-base font-bold">{t('نورة الشمري', 'Noura Al-Shammari')}</p>
            <p className="mt-0.5 text-[11px] text-white/70">{t('كاشير — فرع التحلية', 'Cashier — Tahlia branch')}</p>
          </div>
          {/* check-in card */}
          <div className="-mt-4 px-4">
            <div className="rounded-2xl bg-white p-4 text-center shadow-soft">
              <div className="relative mx-auto flex h-36 w-36 items-center justify-center">
                <span className="absolute inset-0 rounded-full border-2 border-dashed border-success/40" />
                <span className="absolute inset-3 animate-pulse rounded-full bg-success-50" />
                <button type="button" tabIndex={-1} aria-hidden className="relative flex h-24 w-24 flex-col items-center justify-center rounded-full bg-primary text-white shadow-lift">
                  <Fingerprint className="h-8 w-8 text-accent" />
                  <span className="mt-1 text-xs font-semibold">{t('تسجيل حضور', 'Check in')}</span>
                </button>
              </div>
              <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-success-50 px-2.5 py-1 text-[11px] font-medium text-success">
                <MapPin className="h-3 w-3" />{t('أنتِ داخل نطاق الفرع · 42م', 'Inside branch geofence · 42m')}
              </p>
              <p className="num mt-2 text-[11px] text-ink-soft">{t('وردية', 'Shift')} 08:00 – 16:00</p>
            </div>
          </div>
          {/* quick actions */}
          <div className="grid grid-cols-3 gap-2 px-4 py-4">
            {[
              { i: CalendarDays, l: t('إجازة', 'Leave'), v: t('18 يوماً', '18 days') },
              { i: Receipt, l: t('قسيمتي', 'Payslip'), v: t('سبتمبر', 'Sep') },
              { i: Wallet, l: t('طلب', 'Request'), v: t('سلفة', 'Loan') },
            ].map((a) => (
              <div key={a.l} className="rounded-xl bg-white p-2.5 text-center shadow-soft">
                <a.i className="mx-auto h-4 w-4 text-primary-500" />
                <p className="mt-1 text-[10px] font-semibold text-ink">{a.l}</p>
                <p className="text-[10px] text-ink-soft">{a.v}</p>
              </div>
            ))}
          </div>
          <div className="mx-auto mb-2 h-1 w-24 rounded-full bg-ink/20" />
        </div>
      </div>
    </div>
  );
}
