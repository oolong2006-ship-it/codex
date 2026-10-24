import { BRAND } from '@/lib/brand';

type Tone = 'oasis' | 'night' | 'white';
const TONES: Record<Tone, { tile: string; glyph: string }> = {
  oasis: { tile: BRAND.oasis, glyph: BRAND.white },
  night: { tile: BRAND.night, glyph: BRAND.white },
  white: { tile: BRAND.white, glyph: BRAND.oasis },
};

/** The Taqam node-T mark: two branch nodes joined by the platform, a stem down to the person (saffron). */
export function LogoMark({ size = 32, tone = 'oasis', className }: { size?: number; tone?: Tone; className?: string }) {
  const { tile, glyph } = TONES[tone];
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden>
      <rect width="64" height="64" rx="18" fill={tile} />
      <path d="M17 23H47M32 23V43" stroke={glyph} strokeWidth="5" strokeLinecap="round" fill="none" />
      <circle cx="17" cy="23" r="6" fill={glyph} />
      <circle cx="47" cy="23" r="6" fill={glyph} />
      <circle cx="32" cy="46" r="7.5" fill={BRAND.saffron} />
    </svg>
  );
}
