import clsx from 'clsx';
import { LogoMark } from './LogoMark';

/** Bilingual lockup: mark + «طاقم» (Alexandria 800) with optional latin «taqam». */
export function Logo({ className, light, showLatin = false }: { className?: string; light?: boolean; showLatin?: boolean }) {
  return (
    <span className={clsx('inline-flex items-center gap-2.5', className)}>
      <LogoMark size={34} tone="oasis" />
      <span className="flex flex-col leading-none">
        <span className={clsx('font-display text-[22px] font-extrabold', light ? 'text-white' : 'text-night')}>طاقم</span>
        {showLatin && <span dir="ltr" className={clsx('mt-0.5 text-end font-display text-xs font-medium tracking-tight', light ? 'text-accent' : 'text-primary')}>taqam</span>}
      </span>
    </span>
  );
}
