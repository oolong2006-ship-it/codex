'use client';
import clsx from 'clsx';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { FlaskConical, RotateCcw, X } from 'lucide-react';

const MIN_KEY = 'taqam.demo.bannerMin';

/** Fixed notice shown on every page of the static demo build, with a "reset demo data" action. */
export function DemoBanner() {
  const pathname = usePathname() || '/';
  const [min, setMin] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    try { setMin(window.sessionStorage.getItem(MIN_KEY) === '1'); } catch { /* storage unavailable */ }
  }, []);
  const toggle = (v: boolean) => {
    setMin(v);
    try { window.sessionStorage.setItem(MIN_KEY, v ? '1' : '0'); } catch { /* storage unavailable */ }
  };
  const reset = async () => {
    if (!window.confirm('سيتم حذف كل التغييرات التي أجريتها واستعادة البيانات التجريبية الأصلية. متابعة؟')) return;
    setBusy(true);
    const { resetDemoData } = await import('./client');
    resetDemoData();
    window.location.reload();
  };
  // Clear the self-service bottom tab bar.
  const ess = pathname === '/me' || pathname.startsWith('/me/');
  const pos = ess ? 'bottom-[calc(76px+env(safe-area-inset-bottom))]' : 'bottom-3';

  if (min) {
    return (
      <button type="button" onClick={() => toggle(false)} className={clsx('fixed end-3 z-[60] flex items-center gap-1.5 rounded-full bg-ink/90 px-3 py-1.5 text-xs font-semibold text-white shadow-lift backdrop-blur print:hidden', pos)}
        aria-label="نسخة تجريبية">
        <FlaskConical className="h-3.5 w-3.5 text-accent" />تجريبي
      </button>
    );
  }
  return (
    <div role="note" dir="rtl" className={clsx('fixed end-3 z-[60] flex max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-2xl bg-ink/90 py-1.5 pe-1.5 ps-3 text-[11px] leading-tight text-white shadow-lift backdrop-blur sm:gap-3 sm:py-2 sm:text-xs print:hidden', pos)}>
      <FlaskConical className="h-4 w-4 shrink-0 text-accent" />
      <span className="min-w-0 font-medium sm:whitespace-nowrap">نسخة تجريبية — البيانات وهمية وتُحفظ في متصفحك فقط</span>
      <span className="flex shrink-0 items-center gap-1">
        <button type="button" onClick={reset} disabled={busy} title="إعادة ضبط البيانات التجريبية" aria-label="إعادة ضبط البيانات التجريبية"
          className="flex items-center gap-1 rounded-lg bg-white/10 p-1.5 font-semibold text-accent hover:bg-white/20 disabled:opacity-60 sm:px-2 sm:py-1">
          <RotateCcw className={clsx('h-3.5 w-3.5', busy && 'animate-spin')} /><span className="hidden sm:inline">إعادة ضبط البيانات التجريبية</span>
        </button>
        <button type="button" onClick={() => toggle(true)} className="rounded-lg p-1 text-white/70 hover:bg-white/10 hover:text-white" aria-label="تصغير">
          <X className="h-4 w-4" />
        </button>
      </span>
    </div>
  );
}
