import clsx from 'clsx';
import { LogoMark } from './LogoMark';
import { WORDMARK_AR, WORDMARK_LATIN } from './wordmark';

/** Bilingual lockup from the Brand Kit: icon + outlined «شؤون» with optional latin «SHUOON». */
export function Logo({ className, light, showLatin = false }: { className?: string; light?: boolean; showLatin?: boolean }) {
  return (
    <span className={clsx('inline-flex items-center gap-2.5', className)} role="img" aria-label="شؤون SHUOON">
      <LogoMark size={36} tone={light ? 'night' : 'oasis'} />
      <span className="flex flex-col items-start leading-none">
        <svg viewBox={WORDMARK_AR.viewBox} className={clsx('h-[26px] w-auto', light ? 'text-white' : 'text-night')} aria-hidden>
          <path d={WORDMARK_AR.d} fill="currentColor" />
        </svg>
        {showLatin && (
          <svg viewBox={WORDMARK_LATIN.viewBox} className={clsx('mt-1.5 h-[7px] w-auto self-end', light ? 'text-accent' : 'text-primary')} aria-hidden>
            <path d={WORDMARK_LATIN.d} fill="currentColor" />
          </svg>
        )}
      </span>
    </span>
  );
}
