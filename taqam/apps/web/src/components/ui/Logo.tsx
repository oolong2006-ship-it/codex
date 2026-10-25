import clsx from 'clsx';
import { LogoMark } from './LogoMark';

/** Bilingual lockup: mark + «شــؤون» (Alexandria 800) with optional latin «SHUOON». */
export function Logo({ className, light, showLatin = false }: { className?: string; light?: boolean; showLatin?: boolean }) {
  return (
    <span className={clsx('inline-flex items-center gap-2.5', className)}>
      <LogoMark size={34} tone="oasis" />
      <span className="flex flex-col leading-none">
        <span className={clsx('font-display text-[22px] font-extrabold', light ? 'text-white' : 'text-night')}>شــؤون</span>
        {showLatin && <span dir="ltr" className={clsx('mt-1 text-end font-display text-[10px] font-medium tracking-[0.3em]', light ? 'text-accent' : 'text-primary')}>SHUOON</span>}
      </span>
    </span>
  );
}
