import { BRAND } from '@/lib/brand';

type Tone = 'oasis' | 'night' | 'white';
const TONES: Record<Tone, { tile: string; glyph: string }> = {
  oasis: { tile: BRAND.oasis, glyph: BRAND.white },
  night: { tile: BRAND.night, glyph: BRAND.white },
  white: { tile: BRAND.white, glyph: BRAND.oasis },
};

/** The Shuoon mark: the letter «ش» — its three dots are three connected people (saffron on top), over the letter's three teeth. */
export function LogoMark({ size = 32, tone = 'oasis', className }: { size?: number; tone?: Tone; className?: string }) {
  const { tile, glyph } = TONES[tone];
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden>
      <rect width="64" height="64" rx="18" fill={tile} />
      <path d="M25.5 25 L32 15.5 L38.5 25 Z" fill="none" stroke={glyph} strokeOpacity=".55" strokeWidth="2.2" strokeLinejoin="round" />
      <circle cx="25.5" cy="25" r="4.2" fill={glyph} />
      <circle cx="38.5" cy="25" r="4.2" fill={glyph} />
      <circle cx="32" cy="15.5" r="4.8" fill={BRAND.saffron} />
      <path d="M16.5 34.5v3.2a5 5 0 0 0 10 0v-3.2M26.5 37.7a5 5 0 0 0 10 0v-3.2M36.5 37.7a5 5 0 0 0 10 0v-3.2" fill="none" stroke={glyph} strokeWidth="4.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M46.5 37.7c0 7-4 11.3-10.5 11.3h-9" fill="none" stroke={glyph} strokeWidth="4.4" strokeLinecap="round" />
    </svg>
  );
}
