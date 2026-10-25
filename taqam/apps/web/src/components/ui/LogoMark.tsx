import { useId } from 'react';
import { BRAND } from '@/lib/brand';

type Tone = 'color' | 'tile' | 'mono' | 'white';

/** Shuoon symbol paths in a 200×140 box: three people (blue centre head, teal sides) joined by one flowing path. */
function Symbol({ id, tone }: { id: string; tone: Tone }) {
  const flat = tone === 'mono' ? BRAND.night : tone === 'white' ? BRAND.white : null;
  const teal = flat ?? `url(#${id}t)`;
  const blue = flat ?? `url(#${id}b)`;
  const wave = flat ?? `url(#${id}w)`;
  return (
    <>
      {!flat && (
        <defs>
          <linearGradient id={`${id}t`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1EDBC9" /><stop offset="1" stopColor="#10C4BA" /></linearGradient>
          <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0C93D6" /><stop offset="1" stopColor="#0377BE" /></linearGradient>
          <linearGradient id={`${id}w`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0A8FD3" /><stop offset=".55" stopColor="#0378C0" /><stop offset="1" stopColor="#143A7A" /></linearGradient>
        </defs>
      )}
      <circle cx="100" cy="21" r="19" fill={blue} />
      <circle cx="37" cy="45" r="17" fill={teal} />
      <circle cx="163" cy="45" r="17" fill={teal} />
      <path d="M13 97C20 130 50 142 72 125C86 114 92 94 100 78C108 94 114 114 128 124C150 142 180 130 187 97C178 112 160 118 146 108C128 92 118 56 100 56C82 56 72 92 54 108C40 118 22 112 13 97Z" fill={wave} />
      <circle cx="37" cy="95" r="25" fill={teal} />
      <circle cx="163" cy="95" r="25" fill={teal} />
    </>
  );
}

/** The Shuoon mark. `color` (default) and `mono`/`white` are the bare symbol; `tile` is the navy app icon. */
export function LogoMark({ size = 32, tone = 'color', className }: { size?: number; tone?: Tone; className?: string }) {
  const id = `sh${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  if (tone === 'tile') {
    return (
      <svg viewBox="0 0 220 220" width={size} height={size} className={className} aria-hidden>
        <rect width="220" height="220" rx="52" fill={BRAND.night} />
        <g transform="translate(32 56) scale(.78)"><Symbol id={id} tone="color" /></g>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 200 140" width={size} height={(size * 140) / 200} className={className} aria-hidden>
      <Symbol id={id} tone={tone} />
    </svg>
  );
}
